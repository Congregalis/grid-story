import type { GenerateInput, TaskType } from '@grid-story/llm';
import { describe, expect, it, vi } from 'vitest';
import { CharacterHijackDetector } from '../character-hijack-detector';

describe('CharacterHijackDetector', () => {
  it('flags decisions when detector score diverges from simulation score', async () => {
    let task: TaskType | undefined;
    let generateInput: GenerateInput | undefined;
    const detector = new CharacterHijackDetector(
      {
        generate: vi.fn(async (input: GenerateInput, t?: TaskType) => {
          generateInput = input;
          task = t;
          return {
            content: JSON.stringify({
              characterId: 'char-1',
              matchScore: 3,
              reason: '该角色一贯隐忍，这里突然当众翻脸缺少外部压力。',
              flagged: true,
            }),
            usage: { inputTokens: 1, outputTokens: 1 },
          };
        }),
      },
      {
        render(_agent, taskName, vars) {
          expect(taskName).toBe('character-hijack-detect');
          return vars.context_json;
        },
      },
    );

    const issues = await detector.check({
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
      branch: {
        branchLabel: '主走向',
        narrative: '他当众翻脸。',
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
            choiceSummary: '当众翻脸。',
            decisionProfileMatchScore: 8,
            rationale: '模拟认为符合。',
          },
        ],
      },
      decisionProfiles: [
        {
          id: 'profile-1',
          bookId: 'book-1',
          characterId: 'char-1',
          archetype: '隐忍派',
          responses: [],
          hardConstraints: [],
          blindSpots: [],
          growthArcHints: null,
          notes: null,
          createdAt: '2026-05-07T00:00:00.000Z',
          updatedAt: '2026-05-07T00:00:00.000Z',
        },
      ],
    });

    expect(task).toBe('review');
    expect(generateInput?.messages[1]?.content).toContain('当众翻脸');
    expect(issues).toMatchObject([
      {
        dimension: 'character_hijack',
        severity: 'major',
      },
    ]);
  });
});
