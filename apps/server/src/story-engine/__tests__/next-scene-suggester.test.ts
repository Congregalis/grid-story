import type { BibleSlice } from '@grid-story/composer';
import type { GenerateInput, GenerateOutput } from '@grid-story/llm';
import type {
  ChekhovHook,
  Drive,
  PacingEvaluation,
  Relationship,
  SceneSimulationRecord,
  WorldVariable,
} from '@grid-story/schema';
import { describe, expect, it, vi } from 'vitest';
import { NextSceneSuggester } from '../next-scene-suggester';
import type { StoryEngineStore } from '../store';

const ts = '2026-05-09T00:00:00.000Z';

function bibleSlice(): BibleSlice {
  return {
    characters: [
      {
        id: 'char-hero',
        bookId: 'book-1',
        name: '苏砚白',
        aliases: [],
        gender: null,
        age: null,
        species: null,
        appearance: null,
        personality: '沉静寡言',
        background: null,
        motivation: null,
        abilities: [],
        relationships: [],
        locationId: null,
        organizationIds: [],
        isProtagonist: true,
        importance: 'tier1',
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      } as never,
      {
        id: 'char-friend',
        bookId: 'book-1',
        name: '林听雪',
        aliases: [],
        gender: null,
        age: null,
        species: null,
        appearance: null,
        personality: null,
        background: null,
        motivation: null,
        abilities: [],
        relationships: [],
        locationId: null,
        organizationIds: [],
        isProtagonist: false,
        importance: 'tier1',
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      } as never,
    ],
    locations: [
      {
        id: 'loc-1',
        bookId: 'book-1',
        name: '渡口',
        type: '地点',
        parentId: null,
        description: null,
        atmosphere: null,
        significance: null,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      } as never,
    ],
    organizations: [],
    items: [],
    timelineEvents: [],
    concepts: [],
  };
}

function adoptedSim(sceneIndex: number): SceneSimulationRecord {
  return {
    id: `sim-${sceneIndex}`,
    bookId: 'book-1',
    sceneId: `chapter-1:scene-${sceneIndex}`,
    chapterId: 'chapter-1',
    sceneIndex,
    status: 'adopted',
    adoptedBranchLabel: '主走向',
    rerolledFrom: null,
    notes: null,
    createdAt: ts,
    updatedAt: ts,
    result: {
      sceneId: `chapter-1:scene-${sceneIndex}`,
      initialConditions: {
        bookId: 'book-1',
        chapterId: 'chapter-1',
        sceneIndex,
        presentCharacterIds: ['char-hero'],
        locationId: 'loc-1',
        timeContext: '白天',
        pressureSources: [],
        authorConstraints: null,
        simulationMode: 'group',
        alternativeCount: 2,
      },
      primaryBranch: {
        branchLabel: '主走向',
        narrative: `第 ${sceneIndex} 场的正文`,
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
            characterId: 'char-hero',
            choiceSummary: '继续走',
            decisionProfileMatchScore: 8,
            rationale: 'OK',
          },
        ],
      },
      alternativeBranches: [
        {
          branchLabel: '候选 1',
          narrative: 'alt 1',
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
              characterId: 'char-hero',
              choiceSummary: 'alt',
              decisionProfileMatchScore: 7,
              rationale: 'OK',
            },
          ],
        },
        {
          branchLabel: '候选 2',
          narrative: 'alt 2',
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
              characterId: 'char-hero',
              choiceSummary: 'alt',
              decisionProfileMatchScore: 7,
              rationale: 'OK',
            },
          ],
        },
      ],
      pacingScore: {
        conflictDensity: 5,
        emotionalIntensity: 5,
        informationDensity: 5,
        recommendation: null,
      },
      modelUsed: 'test',
      costTokens: 1,
    },
  };
}

function makeStore(scenes: SceneSimulationRecord[]): StoryEngineStore {
  const drives: Drive[] = [];
  const relationships: Relationship[] = [];
  const worldVariables: WorldVariable[] = [];
  const hooks: ChekhovHook[] = [];
  const pacing: PacingEvaluation[] = [];
  return {
    listSceneSimulationsForChapter: vi.fn().mockResolvedValue(scenes),
    listDrives: vi.fn().mockResolvedValue(drives),
    listRelationships: vi.fn().mockResolvedValue(relationships),
    listWorldVariables: vi.fn().mockResolvedValue(worldVariables),
    listHooks: vi.fn().mockResolvedValue(hooks),
    listPacingEvaluations: vi.fn().mockResolvedValue(pacing),
  } as unknown as StoryEngineStore;
}

function makeRouter(jsonOutput: unknown) {
  return {
    generate: vi.fn(async (_input: GenerateInput): Promise<GenerateOutput> => ({
      content: JSON.stringify(jsonOutput),
      usage: { inputTokens: 100, outputTokens: 200 },
    })),
  };
}

const prompts = {
  render: (_agent: string, _task: string, vars: Record<string, string>) => vars.context_json,
};

describe('NextSceneSuggester', () => {
  it('forces shouldEndChapter=false when sceneCount < 2', async () => {
    const router = makeRouter({
      suggestion: {
        presentCharacterIds: ['char-hero'],
        locationId: null,
        timeContext: '稍后',
        pressureSources: [
          { type: 'author_event', description: '后续余波', sourceId: null },
        ],
        authorConstraints: null,
        alternativeCount: 2,
      },
      shouldEndChapter: true, // LLM 想结束，但 sceneCount=1，应被否决
      reasoning: '本应继续',
    });
    const sut = new NextSceneSuggester(
      makeStore([adoptedSim(0)]),
      router,
      prompts,
      async () => bibleSlice(),
    );

    const result = await sut.suggest({ bookId: 'book-1', chapterId: 'chapter-1' });
    expect(result.shouldEndChapter).toBe(false);
    expect(result.suggestion.presentCharacterIds).toEqual(['char-hero']);
    expect(result.suggestion.pressureSources).toHaveLength(1);
  });

  it('respects shouldEndChapter=true when sceneCount >= 2', async () => {
    const router = makeRouter({
      suggestion: {
        presentCharacterIds: ['char-hero', 'char-friend'],
        locationId: 'loc-1',
        timeContext: '深夜',
        pressureSources: [{ type: 'hook_payoff', description: '兑现钩子', sourceId: 'h1' }],
        authorConstraints: ['不死人'],
        alternativeCount: 3,
      },
      shouldEndChapter: true,
      reasoning: '钩子已动作，节奏到位',
    });
    const sut = new NextSceneSuggester(
      makeStore([adoptedSim(0), adoptedSim(1), adoptedSim(2)]),
      router,
      prompts,
      async () => bibleSlice(),
    );

    const result = await sut.suggest({ bookId: 'book-1', chapterId: 'chapter-1' });
    expect(result.shouldEndChapter).toBe(true);
    expect(result.suggestion.alternativeCount).toBe(3);
    expect(result.suggestion.locationId).toBe('loc-1');
    expect(result.suggestion.authorConstraints).toEqual(['不死人']);
  });

  it('rejects character ids not in Bible and falls back to author_event when pressure missing', async () => {
    const router = makeRouter({
      suggestion: {
        presentCharacterIds: ['char-hero', 'char-not-exist'],
        locationId: 'loc-not-exist',
        timeContext: '',
        pressureSources: [], // 空，应被填充默认
        authorConstraints: null,
        alternativeCount: 99, // 越界，应被夹到 2..4
      },
      shouldEndChapter: false,
      reasoning: '继续',
    });
    const sut = new NextSceneSuggester(
      makeStore([adoptedSim(0)]),
      router,
      prompts,
      async () => bibleSlice(),
    );

    const result = await sut.suggest({ bookId: 'book-1', chapterId: 'chapter-1' });
    expect(result.suggestion.presentCharacterIds).toEqual(['char-hero']);
    expect(result.suggestion.locationId).toBeNull();
    expect(result.suggestion.timeContext.length).toBeGreaterThan(0);
    expect(result.suggestion.pressureSources).toHaveLength(1);
    expect(result.suggestion.alternativeCount).toBe(2);
  });

  it('throws when LLM output has zero valid character ids', async () => {
    const router = makeRouter({
      suggestion: {
        presentCharacterIds: ['unknown-1', 'unknown-2'],
        locationId: null,
        timeContext: '夜',
        pressureSources: [{ type: 'author_event', description: 'x', sourceId: null }],
        authorConstraints: null,
        alternativeCount: 2,
      },
      shouldEndChapter: false,
      reasoning: 'x',
    });
    const sut = new NextSceneSuggester(
      makeStore([adoptedSim(0)]),
      router,
      prompts,
      async () => bibleSlice(),
    );

    await expect(sut.suggest({ bookId: 'book-1', chapterId: 'chapter-1' })).rejects.toThrow(
      /presentCharacterIds/,
    );
  });
});
