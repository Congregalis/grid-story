import { describe, expect, it } from 'vitest';
import { parseSceneSimulationOutput } from '../output-parser';

const initialConditions = {
  bookId: 'book-1',
  chapterId: 'chapter-1',
  sceneIndex: 0,
  presentCharacterIds: ['char-1'],
  locationId: null,
  timeContext: '次日清晨',
  pressureSources: [],
  authorConstraints: null,
  simulationMode: 'group' as const,
  alternativeCount: 2,
};

const branch = {
  branchLabel: '主走向',
  narrative: '林听雪把断剑放在桌上。',
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
      choiceSummary: '没有立即动手。',
      decisionProfileMatchScore: 8,
      rationale: '符合先查证再反击的决策风格。',
    },
  ],
};

describe('parseSceneSimulationOutput', () => {
  it('extracts fenced JSON and fills runtime metadata', () => {
    const result = parseSceneSimulationOutput(
      `\`\`\`json
{
  "primaryBranch": ${JSON.stringify(branch)},
  "alternativeBranches": [
    ${JSON.stringify({ ...branch, branchLabel: '更激烈' })},
    ${JSON.stringify({ ...branch, branchLabel: '更隐忍' })}
  ],
  "pacingScore": {
    "conflictDensity": 5,
    "emotionalIntensity": 6,
    "informationDensity": 4,
    "recommendation": null
  }
}
\`\`\``,
      {
        initialConditions,
        modelUsed: 'test-model',
        costTokens: 42,
        references: {
          relationships: [],
          drives: [],
          worldVariables: [],
          hooks: [],
        },
      },
    );

    expect(result.sceneId).toBe('chapter-1:scene-0');
    expect(result.modelUsed).toBe('test-model');
    expect(result.costTokens).toBe(42);
    expect(result.initialConditions).toEqual(initialConditions);
  });

  it('rejects stateDelta references that do not exist', () => {
    const badBranch = {
      ...branch,
      stateDelta: {
        ...branch.stateDelta,
        relationships: [
          {
            relationshipId: 'missing-rel',
            axis: 'emotion',
            delta: -2,
            reason: '冲突升级',
          },
        ],
      },
    };

    expect(() =>
      parseSceneSimulationOutput(
        JSON.stringify({
          primaryBranch: badBranch,
          alternativeBranches: [
            { ...branch, branchLabel: '更激烈' },
            { ...branch, branchLabel: '更隐忍' },
          ],
          pacingScore: {
            conflictDensity: 5,
            emotionalIntensity: 6,
            informationDensity: 4,
            recommendation: null,
          },
        }),
        {
          initialConditions,
          modelUsed: 'test-model',
          costTokens: 42,
          references: {
            relationships: [],
            drives: [],
            worldVariables: [],
            hooks: [],
          },
        },
      ),
    ).toThrow(/Unknown relationshipId/);
  });
});
