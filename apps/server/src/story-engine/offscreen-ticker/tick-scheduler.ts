import type { Character } from '@grid-story/schema';
import { eq } from 'drizzle-orm';
import { characters as charactersTable } from '../../db/bible-tables';
import { db } from '../../db/connection';
import type { StoryEngineStore } from '../store';
import type { NpcSimulator, OffscreenCharacter, TickResult } from './npc-simulator';

export interface TickSchedulerInput {
  bookId: string;
  chapterId: string;
}

export class TickScheduler {
  constructor(
    private readonly store: StoryEngineStore,
    private readonly simulator: NpcSimulator,
  ) {}

  async tickChapter(input: TickSchedulerInput): Promise<TickResult | null> {
    const chapterNumber = await this.store.getChapterNumber(input.bookId, input.chapterId);
    if (!chapterNumber) return null;

    const [characterRows, drives, relationships, hooks, simulations] = await Promise.all([
      db.select().from(charactersTable).where(eq(charactersTable.bookId, input.bookId)),
      this.store.listDrives(input.bookId),
      this.store.listRelationships(input.bookId),
      this.store.listHooks(input.bookId),
      this.store.listSceneSimulationsForChapter(input.bookId, input.chapterId),
    ]);

    const onstage = new Set<string>();
    for (const sim of simulations) {
      for (const id of sim.result.initialConditions.presentCharacterIds) onstage.add(id);
    }

    const characters: OffscreenCharacter[] = characterRows.map((row) =>
      toOffscreenCharacter(row as unknown as Character),
    );

    return this.simulator.tick({
      bookId: input.bookId,
      chapterId: input.chapterId,
      chapterNumber,
      onstageCharacterIds: [...onstage],
      characters,
      drives,
      relationships,
      hooks,
    });
  }
}

function toOffscreenCharacter(row: Character): OffscreenCharacter {
  return {
    id: row.id,
    name: row.name,
    importance: row.importance ?? 'tier2',
    personality: row.personality,
    motivation: row.motivation,
  };
}
