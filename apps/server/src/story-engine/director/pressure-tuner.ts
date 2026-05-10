import type { DirectorPressureTunerInput, WorldVariable } from '@grid-story/schema';
import type { StoryEngineStore } from '../store';

export class PressureTuner {
  constructor(private readonly store: StoryEngineStore) {}

  async tune(bookId: string, input: DirectorPressureTunerInput): Promise<WorldVariable> {
    const variable = (await this.store.listWorldVariables(bookId)).find(
      (row) => row.id === input.worldVariableId,
    );
    if (!variable) throw new Error(`WorldVariable not found: ${input.worldVariableId}`);

    const updated = await this.store.updateWorldVariable(bookId, input.worldVariableId, {
      currentValue: input.toValue,
      history: [
        ...variable.history,
        {
          chapter: input.chapter,
          fromValue: variable.currentValue,
          toValue: input.toValue,
          cause: input.reason,
        },
      ],
    });
    if (!updated) throw new Error(`WorldVariable not found: ${input.worldVariableId}`);
    return updated;
  }
}
