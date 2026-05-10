import type { ChekhovHook, SceneInitialConditions } from '@grid-story/schema';
import { describe, expect, it } from 'vitest';
import { PayoffSelector } from '../payoff-selector';

const ts = '2026-05-06T00:00:00.000Z';

function hook(input: Partial<ChekhovHook> & Pick<ChekhovHook, 'id' | 'urgency'>): ChekhovHook {
  return {
    id: input.id,
    bookId: 'book-1',
    type: 'secret_knowledge',
    description: input.description ?? input.id,
    involvedCharacters: input.involvedCharacters ?? [],
    involvedEntities: input.involvedEntities ?? [],
    plantedAtChapter: input.plantedAtChapter ?? 1,
    plantedScene: null,
    preferredPayoffWindow: input.preferredPayoffWindow ?? {
      earliestChapter: 2,
      latestChapter: 4,
    },
    urgency: input.urgency,
    status: input.status ?? 'planted',
    paidOffAtChapter: null,
    payoffNotes: null,
    source: 'author_planted',
    notes: null,
    createdAt: ts,
    updatedAt: ts,
  };
}

describe('PayoffSelector', () => {
  it('ranks hooks by urgency, relevance and payoff window distance', () => {
    const initialConditions: SceneInitialConditions = {
      bookId: 'book-1',
      chapterId: 'chapter-3',
      sceneIndex: 0,
      presentCharacterIds: ['char-1'],
      locationId: 'loc-1',
      timeContext: '夜里',
      pressureSources: [],
      authorConstraints: null,
      simulationMode: 'group',
      alternativeCount: 2,
    };

    const result = new PayoffSelector().select({
      hooks: [
        hook({ id: 'low', urgency: 2 }),
        hook({
          id: 'due',
          urgency: 7,
          involvedCharacters: ['char-1'],
          preferredPayoffWindow: { earliestChapter: 2, latestChapter: 3 },
        }),
        hook({ id: 'paid', urgency: 10, status: 'paid_off' }),
      ],
      initialConditions,
      currentChapter: 3,
      limit: 2,
    });

    expect(result.map((item) => item.hook.id)).toEqual(['due', 'low']);
    expect(result[0].reasons).toContain('present-character');
  });
});
