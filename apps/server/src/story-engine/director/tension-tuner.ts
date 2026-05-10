import type { DirectorTensionTunerInput, Relationship } from '@grid-story/schema';
import type { StoryEngineStore } from '../store';

export class TensionTuner {
  constructor(private readonly store: StoryEngineStore) {}

  async tune(bookId: string, input: DirectorTensionTunerInput): Promise<Relationship> {
    const relationship = (await this.store.listRelationships(bookId)).find(
      (row) => row.id === input.relationshipId,
    );
    if (!relationship) throw new Error(`Relationship not found: ${input.relationshipId}`);

    const updated = await this.store.updateRelationship(bookId, input.relationshipId, {
      currentTension: input.currentTension,
      history: [
        ...relationship.history,
        {
          chapter: input.chapter,
          vector: input.currentTension,
          trigger: input.reason,
        },
      ],
    });
    if (!updated) throw new Error(`Relationship not found: ${input.relationshipId}`);
    return updated;
  }
}
