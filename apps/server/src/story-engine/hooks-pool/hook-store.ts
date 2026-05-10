import type { ChekhovHook, SceneInitialConditions } from '@grid-story/schema';
import type { StoryEngineStore } from '../store';
import { PayoffSelector, type RankedHook } from './payoff-selector';

export interface HookStoreCandidatesInput {
  bookId: string;
  initialConditions: SceneInitialConditions;
  currentChapter: number;
  limit?: number;
}

export class HookStore {
  constructor(
    private readonly store: StoryEngineStore,
    private readonly selector = new PayoffSelector(),
  ) {}

  async listActive(bookId: string): Promise<ChekhovHook[]> {
    const hooks = await this.store.listHooks(bookId);
    return hooks.filter((hook) => hook.status === 'planted' || hook.status === 'developing');
  }

  async candidatesForScene(input: HookStoreCandidatesInput): Promise<RankedHook[]> {
    const hooks = await this.listActive(input.bookId);
    return this.selector.select({
      hooks,
      initialConditions: input.initialConditions,
      currentChapter: input.currentChapter,
      limit: input.limit,
    });
  }
}
