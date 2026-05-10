import type { PacingEvaluation, SceneSimulationRecord } from '@grid-story/schema';
import { describe, expect, it } from 'vitest';
import type { StoryEngineStore } from '../../store';
import { PacingEvaluator } from '../pacing-evaluator';

const ts = '2026-05-06T00:00:00.000Z';

async function unexpected(): Promise<never> {
  throw new Error('unexpected store call');
}

function simulation(score: {
  conflictDensity: number;
  emotionalIntensity: number;
  informationDensity: number;
}): SceneSimulationRecord {
  return {
    id: 'sim-1',
    bookId: 'book-1',
    sceneId: 'chapter-3:scene-0',
    chapterId: 'chapter-3',
    sceneIndex: 0,
    status: 'pending_author_review',
    result: {
      sceneId: 'chapter-3:scene-0',
      initialConditions: {
        bookId: 'book-1',
        chapterId: 'chapter-3',
        sceneIndex: 0,
        presentCharacterIds: ['char-1'],
        locationId: null,
        timeContext: '夜里',
        pressureSources: [],
        authorConstraints: null,
        simulationMode: 'group',
        alternativeCount: 2,
      },
      primaryBranch: {
        branchLabel: '主走向',
        narrative: '短场景。',
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
            choiceSummary: '继续等待。',
            decisionProfileMatchScore: 8,
            rationale: '符合谨慎性格。',
          },
        ],
      },
      alternativeBranches: [],
      pacingScore: { ...score, recommendation: null },
      modelUsed: 'test',
      costTokens: 1,
    },
    adoptedBranchLabel: null,
    rerolledFrom: null,
    notes: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

function pacing(chapterNumber: number, conflictDensity: number): PacingEvaluation {
  return {
    id: `pace-${chapterNumber}`,
    bookId: 'book-1',
    chapterId: `chapter-${chapterNumber}`,
    chapterNumber,
    sceneSimulationIds: [`sim-${chapterNumber}`],
    score: {
      conflictDensity,
      emotionalIntensity: 4,
      informationDensity: 4,
      recommendation: null,
    },
    warning: null,
    notes: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

describe('PacingEvaluator', () => {
  it('aggregates scene pacing and flags a three-chapter low-conflict streak', async () => {
    const store = {
      listSceneSimulationsForChapter: async () => [
        simulation({ conflictDensity: 2, emotionalIntensity: 5, informationDensity: 4 }),
      ],
      listPacingEvaluations: async () => [pacing(1, 2.5), pacing(2, 2.7)],
      listHooks: async () => [],
      getChapterNumber: async () => 3,
      upsertPacingEvaluation: async (
        _bookId: string,
        input: Omit<PacingEvaluation, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
      ) => ({
        ...input,
        id: 'pace-3',
        bookId: 'book-1',
        createdAt: ts,
        updatedAt: ts,
      }),
    } as Partial<StoryEngineStore> as StoryEngineStore;

    const result = await new PacingEvaluator(store).evaluateChapter({
      bookId: 'book-1',
      chapterId: 'chapter-3',
    });

    expect(result?.score.conflictDensity).toBe(2);
    expect(result?.warning?.severity).toBe('critical');
  });

  it('recommends higher conflict when scene has no pressure', async () => {
    const store = {
      listPacingEvaluations: async () => [],
      listSceneSimulationsForChapter: unexpected,
      listHooks: unexpected,
      getChapterNumber: unexpected,
      upsertPacingEvaluation: unexpected,
    } as Partial<StoryEngineStore> as StoryEngineStore;

    const target = await new PacingEvaluator(store).recommendForScene({
      bookId: 'book-1',
      currentChapter: 2,
      candidateHooks: [],
      initialConditions: {
        bookId: 'book-1',
        chapterId: 'chapter-2',
        sceneIndex: 0,
        presentCharacterIds: ['char-1'],
        locationId: null,
        timeContext: '清晨',
        pressureSources: [],
        authorConstraints: null,
        simulationMode: 'group',
        alternativeCount: 2,
      },
    });

    expect(target.conflictTarget).toBe(7);
  });
});
