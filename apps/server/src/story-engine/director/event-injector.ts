import type {
  DirectorEventInjectorInput,
  DirectorEventInjectorResult,
  ScenePressureSource,
} from '@grid-story/schema';

export class EventInjector {
  private readonly pendingPressureSources = new Map<string, ScenePressureSource[]>();

  inject(bookId: string, input: DirectorEventInjectorInput): DirectorEventInjectorResult {
    const pressureSource: ScenePressureSource = {
      type: 'author_event',
      description: input.description,
      sourceId: input.scope === 'global' ? null : `${input.scope}:${input.targetId}`,
    };
    this.pendingPressureSources.set(bookId, [
      ...(this.pendingPressureSources.get(bookId) ?? []),
      pressureSource,
    ]);

    return {
      pressureSource,
      scope: input.scope,
      targetId: input.targetId,
      description: input.description,
      preset: input.preset,
    };
  }

  listPending(bookId: string): ScenePressureSource[] {
    return this.pendingPressureSources.get(bookId) ?? [];
  }

  clearPending(bookId: string) {
    this.pendingPressureSources.delete(bookId);
  }
}
