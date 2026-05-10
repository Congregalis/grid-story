import type {
  ChekhovHook,
  PacingEvaluation,
  PacingScore,
  PacingTarget,
  SceneInitialConditions,
  SceneSimulationRecord,
} from '@grid-story/schema';
import { pacingTargetSchema } from '@grid-story/schema';
import type { StoryEngineStore } from '../store';

export interface EvaluateChapterInput {
  bookId: string;
  chapterId: string;
  chapterNumber?: number | null;
}

export interface RecommendForSceneInput {
  bookId: string;
  initialConditions: SceneInitialConditions;
  currentChapter: number;
  candidateHooks: ChekhovHook[];
}

export class PacingEvaluator {
  constructor(private readonly store: StoryEngineStore) {}

  async evaluateChapter(input: EvaluateChapterInput): Promise<PacingEvaluation | null> {
    const chapterNumber =
      input.chapterNumber ??
      (await this.store.getChapterNumber(input.bookId, input.chapterId)) ??
      inferChapterNumber(input.chapterId);
    if (!chapterNumber) return null;

    const simulations = await this.store.listSceneSimulationsForChapter(
      input.bookId,
      input.chapterId,
    );
    if (simulations.length === 0) return null;

    const score = aggregateScores(simulations);
    const [history, hooks] = await Promise.all([
      this.store.listPacingEvaluations(input.bookId),
      this.store.listHooks(input.bookId),
    ]);
    const warning = buildWarning({ score, chapterNumber, history, hooks });

    return this.store.upsertPacingEvaluation(input.bookId, {
      chapterId: input.chapterId,
      chapterNumber,
      sceneSimulationIds: simulations.map((simulation) => simulation.id),
      score,
      warning,
      notes: null,
    });
  }

  async recommendForScene(input: RecommendForSceneInput): Promise<PacingTarget> {
    const history = await this.store.listPacingEvaluations(input.bookId);
    const recent = history.filter((item) => item.chapterNumber < input.currentChapter).slice(-3);
    const lowConflictStreak =
      recent.length >= 2 && recent.slice(-2).every((item) => item.score.conflictDensity < 3);
    const noExternalPressure = input.initialConditions.pressureSources.length === 0;
    const dueHooks = input.candidateHooks.filter(
      (hook) => hook.preferredPayoffWindow.latestChapter <= input.currentChapter + 1,
    );
    const last = recent.at(-1);

    const conflictTarget = lowConflictStreak || noExternalPressure ? 7 : 6;
    const emotionalTarget = last && last.score.emotionalIntensity > 8 ? 5 : 6;
    const informationTarget = last && last.score.informationDensity > 7 ? 3 : 5;
    const hookIds =
      dueHooks.length > 0
        ? dueHooks.map((hook) => hook.id)
        : input.candidateHooks.map((hook) => hook.id);
    const paceHint =
      dueHooks.length > 0
        ? `优先考虑兑现接近窗口上限的钩子：${dueHooks.map((hook) => hook.description).join('；')}`
        : lowConflictStreak
          ? '连续低冲突后需要提高外部压力，至少给出一个更激烈的候选分支。'
          : '保持角色驱动，让冲突、情绪和信息增量服务当前场景。';

    return pacingTargetSchema.parse({
      conflictTarget,
      emotionalTarget,
      informationTarget,
      hookIds,
      paceHint,
    });
  }
}

function aggregateScores(simulations: SceneSimulationRecord[]): PacingScore {
  const count = simulations.length;
  const total = simulations.reduce(
    (acc, simulation) => {
      const score = simulation.result.pacingScore;
      return {
        conflictDensity: acc.conflictDensity + score.conflictDensity,
        emotionalIntensity: acc.emotionalIntensity + score.emotionalIntensity,
        informationDensity: acc.informationDensity + score.informationDensity,
      };
    },
    { conflictDensity: 0, emotionalIntensity: 0, informationDensity: 0 },
  );

  let recommendation: string | null = null;
  if (total.conflictDensity / count < 3) {
    recommendation = '下一章需要引入更明确的外部压力或关系冲突。';
  } else if (total.informationDensity / count > 8) {
    recommendation = '下一章降低信息灌入，让角色行动消化已有线索。';
  }

  return {
    conflictDensity: round1(total.conflictDensity / count),
    emotionalIntensity: round1(total.emotionalIntensity / count),
    informationDensity: round1(total.informationDensity / count),
    recommendation,
  };
}

function buildWarning(input: {
  score: PacingScore;
  chapterNumber: number;
  history: PacingEvaluation[];
  hooks: ChekhovHook[];
}): PacingEvaluation['warning'] {
  const previous = input.history
    .filter((item) => item.chapterNumber < input.chapterNumber)
    .slice(-2);
  const lowConflictStreak =
    input.score.conflictDensity < 3 &&
    previous.length === 2 &&
    previous.every((item) => item.score.conflictDensity < 3);
  if (lowConflictStreak) {
    return {
      severity: 'critical',
      message: '连续 3 章冲突密度低于 3，下一章必须注入外部压力或兑现钩子。',
    };
  }

  const dueHooks = input.hooks.filter(
    (hook) =>
      (hook.status === 'planted' || hook.status === 'developing') &&
      hook.preferredPayoffWindow.latestChapter <= input.chapterNumber + 1,
  );
  if (dueHooks.length > 0) {
    return {
      severity: 'warning',
      message: `有 ${dueHooks.length} 个钩子接近兑现窗口上限。`,
    };
  }

  if (input.score.conflictDensity < 3) {
    return {
      severity: 'warning',
      message: '本章冲突密度偏低，建议下章提高压力。',
    };
  }

  return null;
}

function inferChapterNumber(chapterId: string): number | null {
  const match = chapterId.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
