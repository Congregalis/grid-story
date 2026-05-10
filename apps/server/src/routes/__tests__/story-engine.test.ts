import type {
  ChekhovHook,
  DecisionProfile,
  Drive,
  PacingEvaluation,
  Relationship,
  SceneSimulationRecord,
  WorldVariable,
} from '@grid-story/schema';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { StoryEngineStore } from '../../story-engine/store';
import { createStoryEngineRoutes } from '../story-engine';

const ts = '2026-05-06T00:00:00.000Z';

async function unexpected(): Promise<never> {
  throw new Error('unexpected store call');
}

function makeStore(overrides: Partial<StoryEngineStore>): StoryEngineStore {
  return {
    listDecisionProfiles: unexpected,
    getDecisionProfile: unexpected,
    upsertDecisionProfile: unexpected,
    updateDecisionProfile: unexpected,
    deleteDecisionProfile: unexpected,
    listDrives: unexpected,
    createDrive: unexpected,
    updateDrive: unexpected,
    deleteDrive: unexpected,
    listRelationships: unexpected,
    createRelationship: unexpected,
    updateRelationship: unexpected,
    deleteRelationship: unexpected,
    getRelationshipHistory: unexpected,
    listWorldVariables: unexpected,
    createWorldVariable: unexpected,
    updateWorldVariable: unexpected,
    deleteWorldVariable: unexpected,
    getWorldVariableHistory: unexpected,
    listHooks: unexpected,
    createHook: unexpected,
    updateHook: unexpected,
    deleteHook: unexpected,
    listCausalLinks: unexpected,
    getChapterNumber: unexpected,
    saveSceneSimulation: unexpected,
    getSceneSimulation: unexpected,
    listSceneSimulationsForChapter: unexpected,
    rerollSceneSimulation: unexpected,
    listPacingEvaluations: unexpected,
    upsertPacingEvaluation: unexpected,
    adoptSceneBranch: unexpected,
    listOffscreenActions: unexpected,
    appendOffscreenActions: unexpected,
    ...overrides,
  };
}

describe('story engine routes', () => {
  it('upserts a character decision profile from the book-scoped path', async () => {
    const row: DecisionProfile = {
      id: 'profile-1',
      bookId: 'book-1',
      characterId: 'char-1',
      archetype: '务实派',
      responses: [],
      hardConstraints: [],
      blindSpots: [],
      growthArcHints: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async upsertDecisionProfile(bookId, characterId, input) {
            expect(bookId).toBe('book-1');
            expect(characterId).toBe('char-1');
            expect(input.archetype).toBe('务实派');
            return row;
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/characters/char-1/decision-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        archetype: '务实派',
        responses: [],
        hardConstraints: [],
        blindSpots: [],
        growthArcHints: null,
        notes: null,
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: 'profile-1',
      bookId: 'book-1',
      characterId: 'char-1',
    });
  });

  it('validates drive status query', async () => {
    const app = new Hono();
    app.route('/books', createStoryEngineRoutes(makeStore({})));

    const res = await app.request('/books/book-1/drives?status=wandering');

    expect(res.status).toBe(400);
  });

  it('creates a drive with zod-validated body', async () => {
    const row: Drive = {
      id: 'drive-1',
      bookId: 'book-1',
      characterId: 'char-1',
      horizon: 'short',
      description: '拿到城门卷宗',
      goalState: '找到卷宗并读完',
      motivation: '确认师父失踪当天发生了什么',
      priority: 8,
      progress: 0,
      status: 'active',
      blockers: [],
      evolvedFrom: null,
      createdChapter: 1,
      resolvedChapter: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async createDrive(bookId, input) {
            expect(bookId).toBe('book-1');
            expect(input.characterId).toBe('char-1');
            return row;
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/drives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterId: 'char-1',
        horizon: 'short',
        description: '拿到城门卷宗',
        goalState: '找到卷宗并读完',
        motivation: '确认师父失踪当天发生了什么',
        priority: 8,
        progress: 0,
        status: 'active',
        blockers: [],
        evolvedFrom: null,
        createdChapter: 1,
        resolvedChapter: null,
        notes: null,
      }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({ id: 'drive-1' });
  });

  it('rejects invalid world variable body before touching the store', async () => {
    const app = new Hono();
    app.route('/books', createStoryEngineRoutes(makeStore({})));

    const res = await app.request('/books/book-1/world-variables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'season' }),
    });

    expect(res.status).toBe(400);
  });

  it('runs scene simulation through the coordinator', async () => {
    const simulation: SceneSimulationRecord = {
      id: 'sim-1',
      bookId: 'book-1',
      sceneId: 'chapter-1:scene-0',
      chapterId: 'chapter-1',
      sceneIndex: 0,
      status: 'pending_author_review',
      result: {
        sceneId: 'chapter-1:scene-0',
        initialConditions: {
          bookId: 'book-1',
          chapterId: 'chapter-1',
          sceneIndex: 0,
          presentCharacterIds: ['char-1'],
          locationId: null,
          timeContext: '次日清晨',
          pressureSources: [],
          authorConstraints: null,
          simulationMode: 'group',
          alternativeCount: 2,
        },
        primaryBranch: {
          branchLabel: '主走向',
          narrative: '林听雪收起断剑。',
          stateDelta: {
            relationships: [],
            drives: [],
            worldVariables: [],
            plantedHooks: [],
            paidOffHooks: [],
            causalLinks: [],
          },
          characterChoiceJustifications: [
            {
              characterId: 'char-1',
              choiceSummary: '暂时忍住。',
              decisionProfileMatchScore: 8,
              rationale: '符合其先查证再动手的习惯。',
            },
          ],
        },
        alternativeBranches: [],
        pacingScore: {
          conflictDensity: 5,
          emotionalIntensity: 6,
          informationDensity: 4,
          recommendation: null,
        },
        modelUsed: 'test',
        costTokens: 12,
      },
      adoptedBranchLabel: null,
      rerolledFrom: null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes({
        store: makeStore({}),
        engineCoordinator: {
          async runScene(input) {
            expect(input.bookId).toBe('book-1');
            expect(input.presentCharacterIds).toEqual(['char-1']);
            return {
              simulation,
              result: simulation.result,
              hijackIssues: [],
              wikiWarnings: [],
            };
          },
        },
      }),
    );

    const res = await app.request('/books/book-1/scenes/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterId: 'chapter-1',
        sceneIndex: 0,
        presentCharacterIds: ['char-1'],
        locationId: null,
        timeContext: '次日清晨',
        pressureSources: [],
        authorConstraints: null,
      }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      simulation: { id: 'sim-1' },
      hijackIssues: [],
    });
  });

  it('rerolls a simulated scene through the coordinator', async () => {
    const app = new Hono();
    let captured: { bookId: string; simulationId: string; overrides?: unknown } | null = null;
    app.route(
      '/books',
      createStoryEngineRoutes({
        store: makeStore({}),
        engineCoordinator: {
          async runScene() {
            throw new Error('runScene should not be called');
          },
          async rerollScene(input) {
            captured = input;
            return { simulation: { id: 'sim-2' }, result: {}, hijackIssues: [], wikiWarnings: [] };
          },
        },
      }),
    );

    const res = await app.request('/books/book-1/scenes/sim-1/reroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alternativeCount: 3 }),
    });

    expect(res.status).toBe(201);
    expect(captured).toMatchObject({
      bookId: 'book-1',
      simulationId: 'sim-1',
      overrides: { alternativeCount: 3 },
    });
  });

  it('adopts a simulated scene branch', async () => {
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async adoptSceneBranch(input) {
            expect(input.bookId).toBe('book-1');
            expect(input.simulationId).toBe('sim-1');
            expect(input.branchLabel).toBe('primary');
            return {
              simulation: {} as SceneSimulationRecord,
              chapter: {
                id: 'chapter-version-1',
                chapterRootId: 'chapter-1',
                title: '第一章',
                content: '正文',
                wordCount: 2,
                status: 'draft',
              },
              applied: {
                relationships: 0,
                drives: 0,
                worldVariables: 0,
                plantedHooks: 0,
                paidOffHooks: 0,
                causalLinks: 0,
              },
            };
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/scenes/sim-1/adopt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchLabel: 'primary' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      chapter: { id: 'chapter-version-1' },
    });
  });

  it('lists causal graph links', async () => {
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async listCausalLinks(bookId) {
            expect(bookId).toBe('book-1');
            return [
              {
                fromSceneRef: null,
                toSceneRef: 'chapter-1:scene-0',
                type: 'trigger',
                description: '初始压力触发场景。',
              },
            ];
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/causal-graph');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      links: [{ toSceneRef: 'chapter-1:scene-0' }],
    });
  });

  it('lists pacing timeline evaluations', async () => {
    const row: PacingEvaluation = {
      id: 'pace-1',
      bookId: 'book-1',
      chapterId: 'chapter-1',
      chapterNumber: 1,
      sceneSimulationIds: ['sim-1'],
      score: {
        conflictDensity: 2.5,
        emotionalIntensity: 5,
        informationDensity: 4,
        recommendation: '下一章加压。',
      },
      warning: {
        severity: 'warning',
        message: '本章冲突密度偏低。',
      },
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async listPacingEvaluations(bookId) {
            expect(bookId).toBe('book-1');
            return [row];
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/pacing-timeline');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      evaluations: [{ id: 'pace-1', warning: { severity: 'warning' } }],
    });
  });

  it('injects a Director event as a reusable pressure source', async () => {
    const app = new Hono();
    app.route('/books', createStoryEngineRoutes(makeStore({})));

    const res = await app.request('/books/book-1/director/inject-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'character',
        targetId: 'char-1',
        description: '亲人病危的消息送到门外',
        preset: '亲人病危',
      }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      pressureSource: {
        type: 'author_event',
        description: '亲人病危的消息送到门外',
        sourceId: 'character:char-1',
      },
    });
  });

  it('adds pending Director events to the next scene simulation once', async () => {
    const seenPressureSources: unknown[] = [];
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes({
        store: makeStore({}),
        engineCoordinator: {
          async runScene(input) {
            seenPressureSources.push(input.pressureSources);
            return { pressureSources: input.pressureSources };
          },
        },
      }),
    );

    await app.request('/books/book-1/director/inject-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'global',
        targetId: null,
        description: '城门突然戒严',
        preset: null,
      }),
    });

    const body = {
      chapterId: 'chapter-1',
      sceneIndex: 0,
      presentCharacterIds: ['char-1'],
      locationId: null,
      timeContext: '清晨',
      pressureSources: [],
      authorConstraints: null,
    };

    const first = await app.request('/books/book-1/scenes/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const second = await app.request('/books/book-1/scenes/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(seenPressureSources).toEqual([
      [{ type: 'author_event', description: '城门突然戒严', sourceId: null }],
      [],
    ]);
  });

  it('tunes world variable pressure and appends history', async () => {
    const variable: WorldVariable = {
      id: 'wv-1',
      bookId: 'book-1',
      name: '雪夜城舆论',
      type: 'public_opinion',
      scope: { type: 'global', locationId: null },
      currentValue: '戒备',
      scale: [],
      affects: [],
      history: [],
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async listWorldVariables(bookId) {
            expect(bookId).toBe('book-1');
            return [variable];
          },
          async updateWorldVariable(bookId, id, input) {
            expect(bookId).toBe('book-1');
            expect(id).toBe('wv-1');
            expect(input.currentValue).toBe('全城戒严');
            expect(input.history).toEqual([
              {
                chapter: 2,
                fromValue: '戒备',
                toValue: '全城戒严',
                cause: '作者提升外部压力',
              },
            ]);
            return { ...variable, currentValue: '全城戒严', history: input.history ?? [] };
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/director/tune-pressure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worldVariableId: 'wv-1',
        toValue: '全城戒严',
        chapter: 2,
        reason: '作者提升外部压力',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      worldVariable: { id: 'wv-1', currentValue: '全城戒严' },
    });
  });

  it('requires a Director reason when editing drives', async () => {
    const app = new Hono();
    app.route('/books', createStoryEngineRoutes(makeStore({})));

    const res = await app.request('/books/book-1/director/edit-drive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveId: 'drive-1',
        characterId: 'char-1',
        priority: 10,
      }),
    });

    expect(res.status).toBe(400);
  });

  it('updates relationship tension and appends history', async () => {
    const relationship: Relationship = {
      id: 'rel-1',
      bookId: 'book-1',
      fromCharacterId: 'char-1',
      toCharacterId: 'char-2',
      relationLabel: '同盟',
      currentTension: { class: 0, info: 0, emotion: 1 },
      targetTrajectory: null,
      history: [],
      isPublicKnowledge: false,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async listRelationships(bookId) {
            expect(bookId).toBe('book-1');
            return [relationship];
          },
          async updateRelationship(bookId, id, input) {
            expect(bookId).toBe('book-1');
            expect(id).toBe('rel-1');
            expect(input.currentTension).toEqual({ class: 3, info: -2, emotion: 7 });
            expect(input.history).toEqual([
              {
                chapter: 3,
                vector: { class: 3, info: -2, emotion: 7 },
                trigger: '公开翻脸',
              },
            ]);
            return {
              ...relationship,
              currentTension: input.currentTension ?? relationship.currentTension,
              history: input.history ?? [],
            };
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/director/tune-tension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relationshipId: 'rel-1',
        currentTension: { class: 3, info: -2, emotion: 7 },
        chapter: 3,
        reason: '公开翻脸',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      relationship: { id: 'rel-1', currentTension: { emotion: 7 } },
    });
  });

  it('plants author Chekhov hooks through DirectorPanel API', async () => {
    const row: ChekhovHook = {
      id: 'hook-1',
      bookId: 'book-1',
      type: 'secret_knowledge',
      description: '卷宗缺页',
      involvedCharacters: ['char-1'],
      involvedEntities: [],
      plantedAtChapter: 2,
      plantedScene: null,
      preferredPayoffWindow: { earliestChapter: 4, latestChapter: 6 },
      urgency: 8,
      status: 'planted',
      paidOffAtChapter: null,
      payoffNotes: null,
      source: 'author_planted',
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    };
    const app = new Hono();
    app.route(
      '/books',
      createStoryEngineRoutes(
        makeStore({
          async createHook(bookId, input) {
            expect(bookId).toBe('book-1');
            expect(input.source).toBe('author_planted');
            expect(input.status).toBe('planted');
            return row;
          },
        }),
      ),
    );

    const res = await app.request('/books/book-1/director/plant-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'secret_knowledge',
        description: '卷宗缺页',
        involvedCharacters: ['char-1'],
        involvedEntities: [],
        plantedAtChapter: 2,
        plantedScene: null,
        preferredPayoffWindow: { earliestChapter: 4, latestChapter: 6 },
        urgency: 8,
      }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      hook: { id: 'hook-1', source: 'author_planted' },
    });
  });
});
