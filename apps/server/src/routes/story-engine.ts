import {
  createChekhovHookInput,
  createDecisionProfileInput,
  createDriveInput,
  createRelationshipInput,
  createWorldVariableInput,
  directorDriveEditorInput,
  directorEventInjectorInput,
  directorHookPlanterInput,
  directorPressureTunerInput,
  directorTensionTunerInput,
  driveStatus,
  rerollSceneOverridesSchema,
  sceneInitialConditionsSchema,
  updateChekhovHookInput,
  updateDecisionProfileInput,
  updateDriveInput,
  updateRelationshipInput,
  updateWorldVariableInput,
} from '@grid-story/schema';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { logRouteError } from '../lib/logger';
import { DriveEditor } from '../story-engine/director/drive-editor';
import { EventInjector } from '../story-engine/director/event-injector';
import { ForcedChangeQueue } from '../story-engine/director/forced-change-queue';
import { HookPlanter } from '../story-engine/director/hook-planter';
import { PressureTuner } from '../story-engine/director/pressure-tuner';
import { TensionTuner } from '../story-engine/director/tension-tuner';
import { DrizzleStoryEngineStore, type StoryEngineStore } from '../story-engine/store';

interface StoryEngineCoordinator {
  runScene(
    initialConditions: z.infer<typeof sceneInitialConditionsSchema>,
    options?: { authorForcedChanges?: import('@grid-story/schema').AuthorForcedChange[] },
  ): Promise<unknown>;
  rerollScene?(input: {
    bookId: string;
    simulationId: string;
    overrides?: z.infer<typeof rerollSceneOverridesSchema>;
    authorForcedChanges?: import('@grid-story/schema').AuthorForcedChange[];
  }): Promise<unknown>;
}

const createDecisionProfileBody = createDecisionProfileInput.omit({
  bookId: true,
  characterId: true,
});
const createDriveBody = createDriveInput.omit({ bookId: true });
const createRelationshipBody = createRelationshipInput.omit({ bookId: true });
const createWorldVariableBody = createWorldVariableInput.omit({ bookId: true });
const createHookBody = createChekhovHookInput.omit({ bookId: true });

const driveQuerySchema = z.object({
  characterId: z.string().optional(),
  status: driveStatus.optional(),
});

const adoptSceneSchema = z.object({
  branchLabel: z.string().min(1).default('primary'),
  narrativeOverride: z.string().min(1).optional(),
});

interface OffscreenTickerHandler {
  tickChapter(input: { bookId: string; chapterId: string }): Promise<unknown>;
}

interface BibleSuggesterHandler {
  suggestDecisionProfile(input: { bookId: string; characterId: string }): Promise<unknown>;
  suggestDriveEvolution(input: { bookId: string; driveId: string }): Promise<unknown>;
  suggestDrives?(input: { bookId: string; characterId: string }): Promise<unknown>;
  suggestRelationships?(input: { bookId: string }): Promise<unknown>;
  suggestWorldVariables?(input: { bookId: string }): Promise<unknown>;
  suggestHooks?(input: { bookId: string; currentChapter?: number }): Promise<unknown>;
}

interface NextSceneSuggesterHandler {
  suggest(input: { bookId: string; chapterId: string }): Promise<unknown>;
}

interface StoryEngineRouteOptions {
  store?: StoryEngineStore;
  engineCoordinator?: StoryEngineCoordinator;
  tickScheduler?: OffscreenTickerHandler;
  bibleSuggester?: BibleSuggesterHandler;
  nextSceneSuggester?: NextSceneSuggesterHandler;
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

async function parseBody<TSchema extends z.ZodTypeAny>(
  c: Context,
  schema: TSchema,
): Promise<ParseResult<z.output<TSchema>>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json({ error: 'Invalid JSON body' }, 400) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400),
    };
  }
  return { ok: true, data: parsed.data };
}

function notFound(c: Context) {
  return c.json({ error: 'Not found' }, 404);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failWithLog(c: Context, scope: string, error: unknown, extra?: Record<string, unknown>) {
  logRouteError(scope, error, { ...extra, bookId: c.req.param('bookId') });
  const message = errorMessage(error);
  if (message.toLowerCase().includes('not found')) {
    return c.json({ error: message }, 404);
  }
  return c.json({ error: message }, 400);
}

function normalizeOptions(input?: StoryEngineStore | StoryEngineRouteOptions): {
  store: StoryEngineStore;
  engineCoordinator?: StoryEngineCoordinator;
  tickScheduler?: OffscreenTickerHandler;
  bibleSuggester?: BibleSuggesterHandler;
  nextSceneSuggester?: NextSceneSuggesterHandler;
} {
  if (input && 'listDecisionProfiles' in input) {
    return {
      store: input,
      engineCoordinator: undefined,
      tickScheduler: undefined,
      bibleSuggester: undefined,
      nextSceneSuggester: undefined,
    };
  }
  return {
    store: input?.store ?? new DrizzleStoryEngineStore(),
    engineCoordinator: input?.engineCoordinator,
    tickScheduler: input?.tickScheduler,
    bibleSuggester: input?.bibleSuggester,
    nextSceneSuggester: input?.nextSceneSuggester,
  };
}

export function createStoryEngineRoutes(input?: StoryEngineStore | StoryEngineRouteOptions) {
  const { store, engineCoordinator, tickScheduler, bibleSuggester, nextSceneSuggester } =
    normalizeOptions(input);
  const routes = new Hono();
  const eventInjector = new EventInjector();
  const forcedChangeQueue = new ForcedChangeQueue();
  const pressureTuner = new PressureTuner(store);
  const driveEditor = new DriveEditor(store);
  const tensionTuner = new TensionTuner(store);
  const hookPlanter = new HookPlanter(store);

  routes.get('/:bookId/decision-profiles', async (c) => {
    const rows = await store.listDecisionProfiles(c.req.param('bookId'));
    return c.json(rows);
  });

  routes.get('/:bookId/characters/:id/decision-profile', async (c) => {
    const row = await store.getDecisionProfile(c.req.param('bookId'), c.req.param('id'));
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.put('/:bookId/characters/:id/decision-profile', async (c) => {
    const parsed = await parseBody(c, createDecisionProfileBody);
    if (!parsed.ok) return parsed.response;

    const row = await store.upsertDecisionProfile(
      c.req.param('bookId'),
      c.req.param('id'),
      parsed.data,
    );
    return c.json(row);
  });

  routes.patch('/:bookId/characters/:id/decision-profile', async (c) => {
    const parsed = await parseBody(c, updateDecisionProfileInput);
    if (!parsed.ok) return parsed.response;

    const row = await store.updateDecisionProfile(
      c.req.param('bookId'),
      c.req.param('id'),
      parsed.data,
    );
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.post('/:bookId/characters/:id/suggest-decision-profile', async (c) => {
    if (!bibleSuggester) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    try {
      const result = await bibleSuggester.suggestDecisionProfile({
        bookId: c.req.param('bookId'),
        characterId: c.req.param('id'),
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-decision-profile', error, {
        characterId: c.req.param('id'),
      });
    }
  });

  routes.post('/:bookId/characters/:id/suggest-drives', async (c) => {
    if (!bibleSuggester?.suggestDrives) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    try {
      const result = await bibleSuggester.suggestDrives({
        bookId: c.req.param('bookId'),
        characterId: c.req.param('id'),
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-drives', error, { characterId: c.req.param('id') });
    }
  });

  routes.post('/:bookId/suggest-relationships', async (c) => {
    if (!bibleSuggester?.suggestRelationships) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    try {
      const result = await bibleSuggester.suggestRelationships({
        bookId: c.req.param('bookId'),
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-relationships', error);
    }
  });

  routes.post('/:bookId/suggest-world-variables', async (c) => {
    if (!bibleSuggester?.suggestWorldVariables) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    try {
      const result = await bibleSuggester.suggestWorldVariables({
        bookId: c.req.param('bookId'),
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-world-variables', error);
    }
  });

  routes.post('/:bookId/suggest-hooks', async (c) => {
    if (!bibleSuggester?.suggestHooks) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    const currentChapterRaw = c.req.query('currentChapter');
    const currentChapter = currentChapterRaw ? Number.parseInt(currentChapterRaw, 10) : undefined;
    try {
      const result = await bibleSuggester.suggestHooks({
        bookId: c.req.param('bookId'),
        currentChapter: Number.isFinite(currentChapter) ? currentChapter : undefined,
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-hooks', error, { currentChapter });
    }
  });

  routes.delete('/:bookId/characters/:id/decision-profile', async (c) => {
    const deleted = await store.deleteDecisionProfile(c.req.param('bookId'), c.req.param('id'));
    if (!deleted) return notFound(c);
    return c.json({ ok: true });
  });

  routes.get('/:bookId/drives', async (c) => {
    const parsed = driveQuerySchema.safeParse({
      characterId: c.req.query('characterId'),
      status: c.req.query('status'),
    });
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const rows = await store.listDrives(c.req.param('bookId'), parsed.data);
    return c.json(rows);
  });

  routes.post('/:bookId/drives', async (c) => {
    const parsed = await parseBody(c, createDriveBody);
    if (!parsed.ok) return parsed.response;

    const row = await store.createDrive(c.req.param('bookId'), parsed.data);
    return c.json(row, 201);
  });

  routes.patch('/:bookId/drives/:id', async (c) => {
    const parsed = await parseBody(c, updateDriveInput);
    if (!parsed.ok) return parsed.response;

    const row = await store.updateDrive(c.req.param('bookId'), c.req.param('id'), parsed.data);
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.post('/:bookId/drives/:id/suggest-evolution', async (c) => {
    if (!bibleSuggester) {
      return c.json({ error: 'BibleSuggester not configured' }, 501);
    }
    try {
      const result = await bibleSuggester.suggestDriveEvolution({
        bookId: c.req.param('bookId'),
        driveId: c.req.param('id'),
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      return failWithLog(c, 'suggest-drive-evolution', error, { driveId: c.req.param('id') });
    }
  });

  routes.delete('/:bookId/drives/:id', async (c) => {
    const deleted = await store.deleteDrive(c.req.param('bookId'), c.req.param('id'));
    if (!deleted) return notFound(c);
    return c.json({ ok: true });
  });

  routes.get('/:bookId/relationships', async (c) => {
    const rows = await store.listRelationships(c.req.param('bookId'));
    return c.json(rows);
  });

  routes.post('/:bookId/relationships', async (c) => {
    const parsed = await parseBody(c, createRelationshipBody);
    if (!parsed.ok) return parsed.response;

    const row = await store.createRelationship(c.req.param('bookId'), parsed.data);
    return c.json(row, 201);
  });

  routes.get('/:bookId/relationships/:id/history', async (c) => {
    const history = await store.getRelationshipHistory(c.req.param('bookId'), c.req.param('id'));
    if (!history) return notFound(c);
    return c.json({ relationshipId: c.req.param('id'), history });
  });

  routes.patch('/:bookId/relationships/:id', async (c) => {
    const parsed = await parseBody(c, updateRelationshipInput);
    if (!parsed.ok) return parsed.response;

    const row = await store.updateRelationship(
      c.req.param('bookId'),
      c.req.param('id'),
      parsed.data,
    );
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.delete('/:bookId/relationships/:id', async (c) => {
    const deleted = await store.deleteRelationship(c.req.param('bookId'), c.req.param('id'));
    if (!deleted) return notFound(c);
    return c.json({ ok: true });
  });

  routes.get('/:bookId/world-variables', async (c) => {
    const rows = await store.listWorldVariables(c.req.param('bookId'));
    return c.json(rows);
  });

  routes.post('/:bookId/world-variables', async (c) => {
    const parsed = await parseBody(c, createWorldVariableBody);
    if (!parsed.ok) return parsed.response;

    const row = await store.createWorldVariable(c.req.param('bookId'), parsed.data);
    return c.json(row, 201);
  });

  routes.get('/:bookId/world-variables/:id/history', async (c) => {
    const history = await store.getWorldVariableHistory(c.req.param('bookId'), c.req.param('id'));
    if (!history) return notFound(c);
    return c.json({ worldVariableId: c.req.param('id'), history });
  });

  routes.patch('/:bookId/world-variables/:id', async (c) => {
    const parsed = await parseBody(c, updateWorldVariableInput);
    if (!parsed.ok) return parsed.response;

    const row = await store.updateWorldVariable(
      c.req.param('bookId'),
      c.req.param('id'),
      parsed.data,
    );
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.delete('/:bookId/world-variables/:id', async (c) => {
    const deleted = await store.deleteWorldVariable(c.req.param('bookId'), c.req.param('id'));
    if (!deleted) return notFound(c);
    return c.json({ ok: true });
  });

  routes.get('/:bookId/hooks', async (c) => {
    const rows = await store.listHooks(c.req.param('bookId'));
    return c.json(rows);
  });

  routes.post('/:bookId/hooks', async (c) => {
    const parsed = await parseBody(c, createHookBody);
    if (!parsed.ok) return parsed.response;

    const row = await store.createHook(c.req.param('bookId'), parsed.data);
    return c.json(row, 201);
  });

  routes.patch('/:bookId/hooks/:id', async (c) => {
    const parsed = await parseBody(c, updateChekhovHookInput);
    if (!parsed.ok) return parsed.response;

    const row = await store.updateHook(c.req.param('bookId'), c.req.param('id'), parsed.data);
    if (!row) return notFound(c);
    return c.json(row);
  });

  routes.delete('/:bookId/hooks/:id', async (c) => {
    const deleted = await store.deleteHook(c.req.param('bookId'), c.req.param('id'));
    if (!deleted) return notFound(c);
    return c.json({ ok: true });
  });

  routes.get('/:bookId/pacing-timeline', async (c) => {
    const rows = await store.listPacingEvaluations(c.req.param('bookId'));
    return c.json({ ok: true, evaluations: rows });
  });

  routes.post('/:bookId/director/inject-event', async (c) => {
    const parsed = await parseBody(c, directorEventInjectorInput);
    if (!parsed.ok) return parsed.response;

    return c.json(eventInjector.inject(c.req.param('bookId'), parsed.data), 201);
  });

  routes.post('/:bookId/director/tune-pressure', async (c) => {
    const parsed = await parseBody(c, directorPressureTunerInput);
    if (!parsed.ok) return parsed.response;

    try {
      const bookId = c.req.param('bookId');
      const worldVariable = await pressureTuner.tune(bookId, parsed.data);
      forcedChangeQueue.record(bookId, {
        kind: 'world_variable',
        targetLabel: `WorldVariable: ${worldVariable.name}`,
        changeSummary: `${worldVariable.name} → ${parsed.data.toValue}`,
        reason: parsed.data.reason,
      });
      return c.json({ ok: true, worldVariable });
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 409);
    }
  });

  routes.post('/:bookId/director/edit-drive', async (c) => {
    const parsed = await parseBody(c, directorDriveEditorInput);
    if (!parsed.ok) return parsed.response;

    try {
      const bookId = c.req.param('bookId');
      const result = await driveEditor.edit(bookId, parsed.data);
      forcedChangeQueue.record(bookId, {
        kind: 'drive',
        targetLabel: `Drive: ${result.drive.description}`,
        changeSummary:
          result.action === 'created'
            ? `新建 Drive (priority=${result.drive.priority}, status=${result.drive.status})`
            : `更新 Drive (progress=${result.drive.progress}, status=${result.drive.status})`,
        reason: parsed.data.reason,
      });
      return c.json({ ok: true, ...result }, result.action === 'created' ? 201 : 200);
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 409);
    }
  });

  routes.post('/:bookId/director/tune-tension', async (c) => {
    const parsed = await parseBody(c, directorTensionTunerInput);
    if (!parsed.ok) return parsed.response;

    try {
      const bookId = c.req.param('bookId');
      const relationship = await tensionTuner.tune(bookId, parsed.data);
      forcedChangeQueue.record(bookId, {
        kind: 'tension',
        targetLabel: `Relationship: ${relationship.relationLabel}`,
        changeSummary: `张力向量 → class=${parsed.data.currentTension.class} info=${parsed.data.currentTension.info} emotion=${parsed.data.currentTension.emotion}`,
        reason: parsed.data.reason,
      });
      return c.json({ ok: true, relationship });
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 409);
    }
  });

  routes.post('/:bookId/director/plant-hook', async (c) => {
    const parsed = await parseBody(c, directorHookPlanterInput);
    if (!parsed.ok) return parsed.response;

    const bookId = c.req.param('bookId');
    const hook = await hookPlanter.plant(bookId, parsed.data);
    forcedChangeQueue.record(bookId, {
      kind: 'hook',
      targetLabel: `ChekhovHook: ${hook.description}`,
      changeSummary: `投放 ${hook.type} 钩子 (urgency=${hook.urgency})`,
      reason: `作者主动投放钩子`,
    });
    return c.json({ ok: true, hook }, 201);
  });

  routes.get('/:bookId/offscreen-actions', async (c) => {
    const chapterId = c.req.query('chapterId') ?? undefined;
    const rows = await store.listOffscreenActions(c.req.param('bookId'), chapterId);
    return c.json({ ok: true, actions: rows });
  });

  routes.post('/:bookId/offscreen-ticker/run', async (c) => {
    if (!tickScheduler) {
      return c.json({ error: 'OffscreenTicker not configured' }, 501);
    }
    const bodySchema = z.object({
      chapterId: z.string().min(1),
      force: z.boolean().optional(),
    });
    const parsed = await parseBody(c, bodySchema);
    if (!parsed.ok) return parsed.response;

    const bookId = c.req.param('bookId');
    if (!parsed.data.force) {
      const existing = await store.listOffscreenActions(bookId, parsed.data.chapterId);
      if (existing.length > 0) {
        return c.json({
          ok: true,
          skipped: true,
          reason: 'offscreen actions already exist for this chapter; pass force=true to re-run',
          actions: existing,
        });
      }
    }

    try {
      const result = await tickScheduler.tickChapter({ bookId, chapterId: parsed.data.chapterId });
      return c.json({ ok: true, skipped: false, result });
    } catch (error) {
      return c.json({ error: errorMessage(error) }, 400);
    }
  });

  routes.get('/:bookId/causal-graph', async (c) => {
    const links = await store.listCausalLinks(c.req.param('bookId'));
    return c.json({ ok: true, links });
  });

  routes.get('/:bookId/causal-graph/impact', async (c) => {
    const changedScene = c.req.query('changedScene');
    if (!changedScene) {
      return c.json({ error: 'changedScene query param is required' }, 400);
    }
    const maxDepthRaw = c.req.query('maxDepth');
    const maxDepth = maxDepthRaw ? Number.parseInt(maxDepthRaw, 10) : 8;
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 32) {
      return c.json({ error: 'maxDepth must be 1..32' }, 400);
    }

    const links = await store.listCausalLinks(c.req.param('bookId'));
    const adjacency = new Map<string, Array<{ to: string; type: string; description: string }>>();
    for (const link of links) {
      if (!link.fromSceneRef) continue;
      const arr = adjacency.get(link.fromSceneRef) ?? [];
      arr.push({ to: link.toSceneRef, type: link.type, description: link.description });
      adjacency.set(link.fromSceneRef, arr);
    }

    const impacted: Array<{
      sceneRef: string;
      distance: number;
      via: { from: string; type: string; description: string };
    }> = [];
    const visited = new Set<string>([changedScene]);
    let frontier: string[] = [changedScene];
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const edge of adjacency.get(node) ?? []) {
          if (visited.has(edge.to)) continue;
          visited.add(edge.to);
          impacted.push({
            sceneRef: edge.to,
            distance: depth,
            via: { from: node, type: edge.type, description: edge.description },
          });
          next.push(edge.to);
        }
      }
      frontier = next;
    }

    return c.json({ ok: true, changedScene, impacted });
  });

  routes.post('/:bookId/scenes/suggest-next', async (c) => {
    if (!nextSceneSuggester) {
      return c.json({ error: 'NextSceneSuggester not configured' }, 501);
    }
    const chapterId = c.req.query('chapterId');
    if (!chapterId) {
      return c.json({ error: 'chapterId query param is required' }, 400);
    }
    try {
      const result = await nextSceneSuggester.suggest({
        bookId: c.req.param('bookId'),
        chapterId,
      });
      return c.json({ ok: true, ...(result as object) });
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:bookId/scenes/simulate', async (c) => {
    if (!engineCoordinator) {
      return c.json({ error: 'SimulationEngine not configured' }, 501);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const rawBody = typeof body === 'object' && body !== null ? body : {};
    const pressureSources =
      'pressureSources' in rawBody && Array.isArray(rawBody.pressureSources)
        ? rawBody.pressureSources
        : [];
    const parsed = sceneInitialConditionsSchema.safeParse({
      ...rawBody,
      bookId: c.req.param('bookId'),
      pressureSources: [...pressureSources, ...eventInjector.listPending(c.req.param('bookId'))],
    });
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    try {
      const bookId = c.req.param('bookId');
      const authorForcedChanges = forcedChangeQueue.listPending(bookId);
      const result = await engineCoordinator.runScene(parsed.data, { authorForcedChanges });
      eventInjector.clearPending(bookId);
      forcedChangeQueue.clearPending(bookId);
      return c.json(result, 201);
    } catch (error) {
      logRouteError('scenes/simulate', error, { bookId: c.req.param('bookId') });
      const message = errorMessage(error);
      const code = (error as { code?: string } | null)?.code;
      if (code === 'MULTI_AGENT_NOT_IMPLEMENTED') {
        return c.json({ error: message, code }, 400);
      }
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:bookId/scenes/:id/reroll', async (c) => {
    if (!engineCoordinator?.rerollScene) {
      return c.json({ error: 'SimulationEngine not configured' }, 501);
    }
    const reroll = engineCoordinator.rerollScene.bind(engineCoordinator);
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      rawBody = text ? JSON.parse(text) : {};
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const parsed = rerollSceneOverridesSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    try {
      const bookId = c.req.param('bookId');
      const authorForcedChanges = forcedChangeQueue.listPending(bookId);
      const result = await reroll({
        bookId,
        simulationId: c.req.param('id'),
        overrides: parsed.data,
        authorForcedChanges,
      });
      forcedChangeQueue.clearPending(bookId);
      return c.json(result, 201);
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 400);
    }
  });

  routes.post('/:bookId/scenes/:id/adopt', async (c) => {
    const parsed = await parseBody(c, adoptSceneSchema);
    if (!parsed.ok) return parsed.response;

    try {
      const result = await store.adoptSceneBranch({
        bookId: c.req.param('bookId'),
        simulationId: c.req.param('id'),
        branchLabel: parsed.data.branchLabel,
        narrativeOverride: parsed.data.narrativeOverride,
      });
      return c.json(result);
    } catch (error) {
      const message = errorMessage(error);
      if (message.includes('not found')) return notFound(c);
      return c.json({ error: message }, 409);
    }
  });

  return routes;
}
