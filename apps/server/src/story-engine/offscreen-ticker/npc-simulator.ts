import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import type {
  ChekhovHook,
  Drive,
  OffscreenAction,
  OffscreenDriveDelta,
  OffscreenTier,
  Relationship,
} from '@grid-story/schema';
import { z } from 'zod';
import type { StoryEngineStore } from '../store';

const TIER1_MAX_PER_CHAPTER = 5;
const SYSTEM_PROMPT =
  '你是 StoryEngine 的幕后推演器。只输出 JSON，遵守输入的字段约束，不要写正文叙事。';

export interface NpcSimulatorRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

export interface NpcSimulatorPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface OffscreenCharacter {
  id: string;
  name: string;
  importance: OffscreenTier;
  personality?: string | null;
  motivation?: string | null;
}

export interface TickInput {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  onstageCharacterIds: string[];
  characters: OffscreenCharacter[];
  drives: Drive[];
  relationships: Relationship[];
  hooks: ChekhovHook[];
  worldSummary?: string;
}

export interface TickResult {
  actions: OffscreenAction[];
  tokenUsage: number;
}

const tier1OutputSchema = z
  .object({
    summary: z.string().min(1),
    driveDeltas: z
      .array(
        z.object({
          driveId: z.string(),
          progressDelta: z.number().int().min(-20).max(20),
          rationale: z.string().nullable().default(null),
        }),
      )
      .min(1)
      .max(3),
    hookIds: z.array(z.string()).default([]),
  })
  .strict();

const tier2OutputSchema = z
  .object({
    actions: z.array(
      z
        .object({
          characterId: z.string(),
          summary: z.string().min(1),
          driveDeltas: z
            .array(
              z.object({
                driveId: z.string(),
                progressDelta: z.number().int().min(-10).max(10),
                rationale: z.string().nullable().default(null),
              }),
            )
            .max(1)
            .default([]),
          hookIds: z.array(z.string()).default([]),
        })
        .strict(),
    ),
  })
  .strict();

export class NpcSimulator {
  constructor(
    private readonly store: StoryEngineStore,
    private readonly router: NpcSimulatorRouter,
    private readonly prompts: NpcSimulatorPromptRegistry,
  ) {}

  async tick(input: TickInput): Promise<TickResult> {
    const onstage = new Set(input.onstageCharacterIds);
    const offstage = input.characters.filter((c) => !onstage.has(c.id));

    const tier1 = offstage.filter((c) => c.importance === 'tier1').slice(0, TIER1_MAX_PER_CHAPTER);
    const tier2 = offstage.filter((c) => c.importance === 'tier2');
    // tier3 skipped entirely.

    const drivesByCharacter = groupBy(input.drives, (d) => d.characterId);
    const validDriveIds = new Set(input.drives.map((d) => d.id));
    const validHookIds = new Set(input.hooks.map((h) => h.id));
    let tokenUsage = 0;
    const collected: Array<Omit<OffscreenAction, 'id' | 'bookId' | 'createdAt'>> = [];

    for (const character of tier1) {
      const charDrives = drivesByCharacter.get(character.id) ?? [];
      if (charDrives.length === 0) continue;

      const ctx = {
        chapter: input.chapterNumber,
        character: redactCharacter(character),
        drives: charDrives.map(briefDrive),
        relationships: input.relationships
          .filter((r) => r.fromCharacterId === character.id || r.toCharacterId === character.id)
          .map(briefRelationship),
        candidateHooks: input.hooks.filter((h) => h.status === 'planted').map(briefHook),
        worldSummary: input.worldSummary ?? null,
      };
      const prompt = this.prompts.render('story-engine', 'offscreen-tier1', {
        context_json: JSON.stringify(ctx, null, 2),
      });
      const output = await this.router.generate(
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          maxTokens: 512,
          temperature: 0.6,
        },
        'summary',
      );
      tokenUsage += output.usage.inputTokens + output.usage.outputTokens;
      const parsed = tier1OutputSchema.parse(extractJson(output.content));
      collected.push({
        chapterId: input.chapterId,
        characterId: character.id,
        tier: 'tier1',
        summary: parsed.summary,
        driveDeltas: parsed.driveDeltas.filter((d) => validDriveIds.has(d.driveId)),
        hookIds: parsed.hookIds.filter((id) => validHookIds.has(id)),
      });
    }

    if (tier2.length > 0) {
      const ctx = {
        chapter: input.chapterNumber,
        characters: tier2.map((c) => ({
          ...redactCharacter(c),
          drives: (drivesByCharacter.get(c.id) ?? []).map(briefDrive),
        })),
        candidateHooks: input.hooks.filter((h) => h.status === 'planted').map(briefHook),
        worldSummary: input.worldSummary ?? null,
      };
      const prompt = this.prompts.render('story-engine', 'offscreen-tier2-batch', {
        context_json: JSON.stringify(ctx, null, 2),
      });
      const output = await this.router.generate(
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          maxTokens: Math.min(2048, 256 + tier2.length * 64),
          temperature: 0.5,
        },
        'summary',
      );
      tokenUsage += output.usage.inputTokens + output.usage.outputTokens;
      const parsed = tier2OutputSchema.parse(extractJson(output.content));
      const validIds = new Set(tier2.map((c) => c.id));
      for (const action of parsed.actions) {
        if (!validIds.has(action.characterId)) continue;
        collected.push({
          chapterId: input.chapterId,
          characterId: action.characterId,
          tier: 'tier2',
          summary: action.summary,
          driveDeltas: action.driveDeltas.filter((d) => validDriveIds.has(d.driveId)),
          hookIds: action.hookIds.filter((id) => validHookIds.has(id)),
        });
      }
    }

    const persisted = await this.store.appendOffscreenActions(input.bookId, collected);
    await this.applyDriveDeltas(input.bookId, input.drives, collected);
    return { actions: persisted, tokenUsage };
  }

  private async applyDriveDeltas(
    bookId: string,
    drives: Drive[],
    actions: Array<Omit<OffscreenAction, 'id' | 'bookId' | 'createdAt'>>,
  ): Promise<void> {
    const aggregated = new Map<string, number>();
    for (const action of actions) {
      for (const delta of action.driveDeltas) {
        aggregated.set(delta.driveId, (aggregated.get(delta.driveId) ?? 0) + delta.progressDelta);
      }
    }
    const driveById = new Map(drives.map((d) => [d.id, d]));
    for (const [driveId, total] of aggregated.entries()) {
      const drive = driveById.get(driveId);
      if (!drive) continue;
      const next = clampProgress(drive.progress + total);
      if (next === drive.progress) continue;
      await this.store.updateDrive(bookId, driveId, { progress: next });
    }
  }
}

function redactCharacter(c: OffscreenCharacter) {
  return {
    id: c.id,
    name: c.name,
    importance: c.importance,
    personality: c.personality ?? null,
    motivation: c.motivation ?? null,
  };
}

function briefDrive(d: Drive) {
  return {
    id: d.id,
    horizon: d.horizon,
    description: d.description,
    goalState: d.goalState,
    priority: d.priority,
    progress: d.progress,
    status: d.status,
  };
}

function briefRelationship(r: Relationship) {
  return {
    id: r.id,
    from: r.fromCharacterId,
    to: r.toCharacterId,
    label: r.relationLabel,
    tension: r.currentTension,
  };
}

function briefHook(h: ChekhovHook) {
  return {
    id: h.id,
    description: h.description,
    type: h.type,
    urgency: h.urgency,
    plantedAtChapter: h.plantedAtChapter,
    preferredPayoffWindow: h.preferredPayoffWindow,
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw);
}

export type { OffscreenDriveDelta };
