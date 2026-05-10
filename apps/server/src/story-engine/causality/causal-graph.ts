import type { CausalLink } from '@grid-story/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db/connection';
import { causalLinks } from '../../db/story-engine-tables';

export interface CausalGraphQuery {
  bookId: string;
  fromSceneRef?: string;
  toSceneRef?: string;
}

export class CausalGraph {
  async addLinks(input: {
    bookId: string;
    sceneSimulationId: string;
    links: CausalLink[];
  }): Promise<void> {
    if (input.links.length === 0) return;
    const ts = new Date().toISOString();
    await db.insert(causalLinks).values(
      input.links.map((link) => ({
        id: uuidv4(),
        bookId: input.bookId,
        sceneSimulationId: input.sceneSimulationId,
        fromSceneRef: link.fromSceneRef,
        toSceneRef: link.toSceneRef,
        type: link.type,
        description: link.description,
        createdAt: ts,
      })),
    );
  }

  async query(input: CausalGraphQuery): Promise<CausalLink[]> {
    const conditions = [eq(causalLinks.bookId, input.bookId)];
    if (input.fromSceneRef) conditions.push(gte(causalLinks.fromSceneRef, input.fromSceneRef));
    if (input.toSceneRef) conditions.push(lte(causalLinks.toSceneRef, input.toSceneRef));

    const rows = await db
      .select()
      .from(causalLinks)
      .where(and(...conditions));

    return rows.map((row) => ({
      fromSceneRef: row.fromSceneRef,
      toSceneRef: row.toSceneRef,
      type: row.type,
      description: row.description,
    }));
  }
}
