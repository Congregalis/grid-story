import type { BibleSlice } from '@grid-story/composer';
import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import type { ScenePressureSource, SceneSimulationRecord } from '@grid-story/schema';
import { fetchBibleSlice } from '../db/queries';
import type { StoryEngineStore } from './store';

export interface NextSceneSuggesterRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

export interface NextSceneSuggesterPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface NextSceneSuggestion {
  presentCharacterIds: string[];
  locationId: string | null;
  timeContext: string;
  pressureSources: ScenePressureSource[];
  authorConstraints: string[] | null;
  alternativeCount: number;
}

export interface SuggestNextSceneResult {
  suggestion: NextSceneSuggestion;
  shouldEndChapter: boolean;
  reasoning: string;
  tokenUsage: number;
}

const SYSTEM_PROMPT =
  '你是 StoryEngine 的下一场建议器。只输出 JSON，严格遵循输入约束。';

export type BibleFetcher = (bookId: string) => Promise<BibleSlice>;

export class NextSceneSuggester {
  constructor(
    private readonly store: StoryEngineStore,
    private readonly router: NextSceneSuggesterRouter,
    private readonly prompts: NextSceneSuggesterPromptRegistry,
    private readonly bibleFetcher: BibleFetcher = fetchBibleSlice,
  ) {}

  async suggest(input: {
    bookId: string;
    chapterId: string;
  }): Promise<SuggestNextSceneResult> {
    const [bible, simulations, drives, relationships, worldVariables, hooks, pacing] =
      await Promise.all([
        this.bibleFetcher(input.bookId),
        this.store.listSceneSimulationsForChapter(input.bookId, input.chapterId),
        this.store.listDrives(input.bookId),
        this.store.listRelationships(input.bookId),
        this.store.listWorldVariables(input.bookId),
        this.store.listHooks(input.bookId),
        this.store.listPacingEvaluations(input.bookId),
      ]);

    const adopted = simulations
      .filter((sim) => sim.status === 'adopted')
      .sort((a, b) => a.sceneIndex - b.sceneIndex);

    const characters = (bible.characters ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      personality: row.personality ?? null,
      motivation: row.motivation ?? null,
    }));
    const locations = (bible.locations ?? []).map((row) => ({
      id: row.id,
      name: row.name,
    }));

    const context = {
      adoptedScenes: adopted.map((sim) => summarizeAdoptedScene(sim)),
      sceneCount: adopted.length,
      characters,
      locations,
      drives: drives
        .filter((row) => row.status === 'active')
        .map((row) => ({
          id: row.id,
          characterId: row.characterId,
          horizon: row.horizon,
          description: row.description,
          progress: row.progress,
          priority: row.priority,
        })),
      relationships: relationships.map((row) => ({
        id: row.id,
        from: row.fromCharacterId,
        to: row.toCharacterId,
        label: row.relationLabel,
        currentTension: row.currentTension,
      })),
      worldVariables: worldVariables.map((row) => ({
        id: row.id,
        name: row.name,
        currentValue: row.currentValue,
      })),
      pendingHooks: hooks
        .filter((row) => row.status === 'planted' || row.status === 'developing')
        .map((row) => ({
          id: row.id,
          type: row.type,
          description: row.description,
          urgency: row.urgency,
          preferredPayoffWindow: row.preferredPayoffWindow,
        })),
      recentPacing: pacing.slice(-3).map((row) => ({
        chapterNumber: row.chapterNumber,
        conflictDensity: row.score.conflictDensity,
        emotionalIntensity: row.score.emotionalIntensity,
        informationDensity: row.score.informationDensity,
        recommendation: row.score.recommendation,
        warning: row.warning,
      })),
    };

    const prompt = this.prompts.render('story-engine', 'next-scene-suggest', {
      context_json: JSON.stringify(context, null, 2),
    });

    const output = await this.router.generate(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        maxTokens: 1024,
        temperature: 0.5,
      },
      'summary',
    );

    const parsed = parseJsonStrict(output.content);
    return validateAndCoerce(parsed, {
      bibleCharacterIds: new Set(characters.map((c) => c.id)),
      bibleLocationIds: new Set(locations.map((l) => l.id)),
      sceneCount: adopted.length,
      tokenUsage: output.usage.inputTokens + output.usage.outputTokens,
    });
  }
}

function summarizeAdoptedScene(sim: SceneSimulationRecord) {
  const branch =
    sim.adoptedBranchLabel === sim.result.primaryBranch.branchLabel
      ? sim.result.primaryBranch
      : sim.result.alternativeBranches.find((b) => b.branchLabel === sim.adoptedBranchLabel) ??
        sim.result.primaryBranch;
  return {
    sceneIndex: sim.sceneIndex,
    branchLabel: sim.adoptedBranchLabel,
    narrativeExcerpt: branch.narrative.slice(0, 400),
    stateDeltaSummary: {
      relationshipChanges: branch.stateDelta.relationships.length,
      driveChanges: branch.stateDelta.drives.length,
      worldVariableChanges: branch.stateDelta.worldVariables.length,
      plantedHooks: branch.stateDelta.plantedHooks.length,
      paidOffHooks: branch.stateDelta.paidOffHooks.length,
    },
  };
}

function parseJsonStrict(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw);
}

function validateAndCoerce(
  parsed: unknown,
  ctx: {
    bibleCharacterIds: Set<string>;
    bibleLocationIds: Set<string>;
    sceneCount: number;
    tokenUsage: number;
  },
): SuggestNextSceneResult {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('NextSceneSuggester: 输出不是对象');
  }
  const obj = parsed as Record<string, unknown>;
  const suggestionRaw = obj.suggestion;
  if (!suggestionRaw || typeof suggestionRaw !== 'object') {
    throw new Error('NextSceneSuggester: 缺少 suggestion 字段');
  }
  const s = suggestionRaw as Record<string, unknown>;

  const presentCharacterIds = (Array.isArray(s.presentCharacterIds) ? s.presentCharacterIds : [])
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => ctx.bibleCharacterIds.has(id));
  if (presentCharacterIds.length === 0) {
    throw new Error('NextSceneSuggester: presentCharacterIds 为空或全不在 Bible');
  }

  const locationId =
    typeof s.locationId === 'string' && ctx.bibleLocationIds.has(s.locationId)
      ? s.locationId
      : null;

  const timeContext =
    typeof s.timeContext === 'string' && s.timeContext.trim().length > 0
      ? s.timeContext.trim()
      : '紧接上场';

  const rawPressure = Array.isArray(s.pressureSources) ? s.pressureSources : [];
  const pressureSources: ScenePressureSource[] = rawPressure
    .map((row): ScenePressureSource | null => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const type = r.type;
      if (
        type !== 'author_event' &&
        type !== 'world_variable_shift' &&
        type !== 'hook_payoff' &&
        type !== 'driven_by_npc'
      ) {
        return null;
      }
      const description =
        typeof r.description === 'string' && r.description.trim().length > 0
          ? r.description.trim()
          : null;
      if (!description) return null;
      return {
        type,
        description,
        sourceId: typeof r.sourceId === 'string' ? r.sourceId : null,
      };
    })
    .filter((row): row is ScenePressureSource => row !== null);
  if (pressureSources.length === 0) {
    pressureSources.push({
      type: 'author_event',
      description: '继续推进上一场未完的余波',
      sourceId: null,
    });
  }

  const authorConstraintsRaw = s.authorConstraints;
  const authorConstraints =
    Array.isArray(authorConstraintsRaw) && authorConstraintsRaw.length > 0
      ? authorConstraintsRaw.filter((item): item is string => typeof item === 'string')
      : null;

  const altCountRaw = s.alternativeCount;
  const alternativeCount =
    typeof altCountRaw === 'number' && altCountRaw >= 2 && altCountRaw <= 4
      ? Math.floor(altCountRaw)
      : 2;

  let shouldEndChapter = obj.shouldEndChapter === true;
  if (ctx.sceneCount < 2) shouldEndChapter = false;

  const reasoning =
    typeof obj.reasoning === 'string' && obj.reasoning.trim().length > 0
      ? obj.reasoning.trim()
      : '';

  return {
    suggestion: {
      presentCharacterIds,
      locationId,
      timeContext,
      pressureSources,
      authorConstraints,
      alternativeCount,
    },
    shouldEndChapter,
    reasoning,
    tokenUsage: ctx.tokenUsage,
  };
}
