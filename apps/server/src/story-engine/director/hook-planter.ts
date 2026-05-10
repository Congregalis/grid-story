import type { ChekhovHook, DirectorHookPlanterInput } from '@grid-story/schema';
import type { StoryEngineStore } from '../store';

export class HookPlanter {
  constructor(private readonly store: StoryEngineStore) {}

  async plant(bookId: string, input: DirectorHookPlanterInput): Promise<ChekhovHook> {
    return this.store.createHook(bookId, {
      type: input.type,
      description: input.description,
      involvedCharacters: input.involvedCharacters,
      involvedEntities: input.involvedEntities,
      plantedAtChapter: input.plantedAtChapter,
      plantedScene: input.plantedScene,
      preferredPayoffWindow: input.preferredPayoffWindow,
      urgency: input.urgency,
      status: 'planted',
      paidOffAtChapter: null,
      payoffNotes: null,
      source: 'author_planted',
      notes: input.notes,
    });
  }
}
