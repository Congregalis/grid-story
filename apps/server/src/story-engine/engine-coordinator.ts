import type { BibleSlice } from '@grid-story/composer';
import type {
  AuthorForcedChange,
  DecisionProfile,
  RerollSceneOverrides,
  ReviewIssue,
  SceneInitialConditions,
  SceneSimulationRecord,
  SceneSimulationResult,
} from '@grid-story/schema';
import type { CharacterHijackDetector } from '../agents/review-agent/character-hijack-detector';
import { fetchBibleSlice } from '../db/queries';
import type { HookStore } from './hooks-pool/hook-store';
import type { PacingEvaluator } from './pacing-critic/pacing-evaluator';
import type { SceneRunner } from './simulation-engine/scene-runner';
import type { StoryEngineStore } from './store';

interface StoryEngineQueryNavigator {
  query(input: { bookId: string; context: unknown }): Promise<{
    assembled_context?: string;
    warnings?: string[];
  }>;
}

export interface EngineCoordinatorOptions {
  store: StoryEngineStore;
  sceneRunner: SceneRunner;
  queryNavigator?: StoryEngineQueryNavigator;
  characterHijackDetector?: CharacterHijackDetector;
  hookStore?: HookStore;
  pacingEvaluator?: PacingEvaluator;
}

export interface RunSceneResult {
  simulation: SceneSimulationRecord;
  result: SceneSimulationResult;
  hijackIssues: ReviewIssue[];
  wikiWarnings: string[];
}

export class EngineCoordinator {
  constructor(private options: EngineCoordinatorOptions) {}

  async runScene(
    initialConditions: SceneInitialConditions,
    options?: { authorForcedChanges?: AuthorForcedChange[] },
  ): Promise<RunSceneResult> {
    const executed = await this.executeSimulation(initialConditions, options?.authorForcedChanges);
    const simulation = await this.options.store.saveSceneSimulation({
      bookId: initialConditions.bookId,
      result: executed.result,
      status: 'pending_author_review',
    });
    return {
      simulation,
      result: executed.result,
      hijackIssues: executed.hijackIssues,
      wikiWarnings: executed.wikiWarnings,
    };
  }

  async rerollScene(input: {
    bookId: string;
    simulationId: string;
    overrides?: RerollSceneOverrides;
    authorForcedChanges?: AuthorForcedChange[];
  }): Promise<RunSceneResult> {
    const previous = await this.options.store.getSceneSimulation(input.bookId, input.simulationId);
    if (!previous) throw new Error(`Scene simulation not found: ${input.simulationId}`);
    if (previous.status === 'adopted') {
      throw new Error('Cannot reroll an adopted simulation');
    }

    const initialConditions = mergeRerollOverrides(
      previous.result.initialConditions,
      input.overrides,
    );
    const executed = await this.executeSimulation(initialConditions, input.authorForcedChanges);
    const simulation = await this.options.store.rerollSceneSimulation({
      bookId: input.bookId,
      fromSimulationId: previous.id,
      result: executed.result,
    });
    return {
      simulation,
      result: executed.result,
      hijackIssues: executed.hijackIssues,
      wikiWarnings: executed.wikiWarnings,
    };
  }

  private async executeSimulation(
    initialConditions: SceneInitialConditions,
    authorForcedChanges?: AuthorForcedChange[],
  ): Promise<{
    result: SceneSimulationResult;
    hijackIssues: ReviewIssue[];
    wikiWarnings: string[];
  }> {
    const bookId = initialConditions.bookId;
    const [bible, decisionProfiles, drives, relationships, worldVariables] = await Promise.all([
      fetchBibleSlice(bookId),
      this.options.store.listDecisionProfiles(bookId),
      this.options.store.listDrives(bookId),
      this.options.store.listRelationships(bookId),
      this.options.store.listWorldVariables(bookId),
    ]);

    validateInitialConditions(initialConditions, bible);

    const currentChapter =
      (await this.options.store.getChapterNumber(bookId, initialConditions.chapterId)) ??
      inferChapterNumber(initialConditions.chapterId) ??
      1;
    const rankedHooks = this.options.hookStore
      ? await this.options.hookStore.candidatesForScene({
          bookId,
          initialConditions,
          currentChapter,
          limit: 3,
        })
      : (await this.options.store.listHooks(bookId))
          .filter((hook) => hook.status === 'planted')
          .map((hook) => ({ hook, score: hook.urgency, reasons: ['fallback'] }));
    const candidateHooks = rankedHooks.map((item) => item.hook);
    const initialConditionsForSimulation = {
      ...initialConditions,
      pressureSources: [
        ...initialConditions.pressureSources,
        ...candidateHooks.map((hook) => ({
          type: 'hook_payoff' as const,
          description: `候选钩子：${hook.description}`,
          sourceId: hook.id,
        })),
      ],
    };
    const pacingTarget =
      (await this.options.pacingEvaluator?.recommendForScene({
        bookId,
        initialConditions: initialConditionsForSimulation,
        currentChapter,
        candidateHooks,
      })) ?? null;

    const wiki = await this.queryWikiContext(initialConditionsForSimulation, bible);
    const result = await this.options.sceneRunner.run({
      initialConditions: initialConditionsForSimulation,
      bible,
      wikiContext: wiki.context,
      decisionProfiles: selectProfiles(
        decisionProfiles,
        initialConditionsForSimulation.presentCharacterIds,
      ),
      drives,
      relationships,
      worldVariables,
      candidateHooks,
      pacingTarget,
      authorForcedChanges: authorForcedChanges ?? [],
    });
    const hijackIssues = await this.checkCharacterHijack(
      initialConditionsForSimulation,
      result,
      decisionProfiles,
    );
    await this.options.pacingEvaluator?.evaluateChapter({
      bookId,
      chapterId: initialConditionsForSimulation.chapterId,
      chapterNumber: currentChapter,
    });

    return { result, hijackIssues, wikiWarnings: wiki.warnings };
  }

  private async queryWikiContext(
    initialConditions: SceneInitialConditions,
    bible: BibleSlice,
  ): Promise<{ context: string | null; warnings: string[] }> {
    if (!this.options.queryNavigator) return { context: null, warnings: [] };

    const characterNames = new Map((bible.characters ?? []).map((item) => [item.id, item.name]));
    const locationNames = new Map((bible.locations ?? []).map((item) => [item.id, item.name]));
    const sceneBrief = [
      `时间：${initialConditions.timeContext}`,
      initialConditions.locationId
        ? `地点：${locationNames.get(initialConditions.locationId) ?? initialConditions.locationId}`
        : null,
      ...initialConditions.pressureSources.map((source) => source.description),
      ...(initialConditions.authorConstraints ?? []),
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.options.queryNavigator.query({
      bookId: initialConditions.bookId,
      context: {
        task: 'story-engine.simulate-scene',
        chapter_id: initialConditions.chapterId,
        scene_brief: sceneBrief,
        characters: initialConditions.presentCharacterIds.map((id) => characterNames.get(id) ?? id),
        locations: initialConditions.locationId
          ? [locationNames.get(initialConditions.locationId) ?? initialConditions.locationId]
          : [],
        recentChapters: 3,
        maxPages: 12,
        maxSamples: 6,
      },
    });

    return {
      context: result.assembled_context ?? null,
      warnings: result.warnings ?? [],
    };
  }

  private async checkCharacterHijack(
    initialConditions: SceneInitialConditions,
    result: SceneSimulationResult,
    decisionProfiles: DecisionProfile[],
  ): Promise<ReviewIssue[]> {
    if (!this.options.characterHijackDetector) return [];
    return this.options.characterHijackDetector.check({
      initialConditions,
      branch: result.primaryBranch,
      decisionProfiles,
    });
  }
}

function validateInitialConditions(initialConditions: SceneInitialConditions, bible: BibleSlice) {
  const characterIds = new Set((bible.characters ?? []).map((item) => item.id));
  for (const characterId of initialConditions.presentCharacterIds) {
    if (!characterIds.has(characterId)) {
      throw new Error(`Unknown presentCharacterId: ${characterId}`);
    }
  }

  if (initialConditions.locationId) {
    const locationIds = new Set((bible.locations ?? []).map((item) => item.id));
    if (!locationIds.has(initialConditions.locationId)) {
      throw new Error(`Unknown locationId: ${initialConditions.locationId}`);
    }
  }
}

function selectProfiles(
  profiles: DecisionProfile[],
  presentCharacterIds: string[],
): DecisionProfile[] {
  const present = new Set(presentCharacterIds);
  return profiles.filter((profile) => present.has(profile.characterId));
}

function mergeRerollOverrides(
  base: SceneInitialConditions,
  overrides?: RerollSceneOverrides,
): SceneInitialConditions {
  if (!overrides) return base;
  return {
    ...base,
    pressureSources: overrides.pressureSources ?? base.pressureSources,
    authorConstraints:
      overrides.authorConstraints !== undefined
        ? overrides.authorConstraints
        : base.authorConstraints,
    simulationMode: overrides.simulationMode ?? base.simulationMode,
    alternativeCount: overrides.alternativeCount ?? base.alternativeCount,
    timeContext: overrides.timeContext ?? base.timeContext,
  };
}

function inferChapterNumber(chapterId: string): number | null {
  const match = chapterId.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}
