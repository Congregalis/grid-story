import { eq, asc, SQL, isNull } from 'drizzle-orm';
import { db } from './connection';
import * as t from './bible-tables';
import type { BibleSlice, OutlineNode } from '@grid-story/composer';

export function eqNull(col: typeof t.outlines.parentId, val: string | null): SQL | undefined {
  return val !== null ? eq(col, val) : isNull(col);
}

export async function fetchBibleSlice(bookId: string): Promise<BibleSlice> {
  const [characters, locations, timelineEvents, concepts] = await Promise.all([
    db.select().from(t.characters).where(eq(t.characters.bookId, bookId)),
    db.select().from(t.locations).where(eq(t.locations.bookId, bookId)),
    db.select().from(t.timelineEvents).where(eq(t.timelineEvents.bookId, bookId)),
    db.select().from(t.concepts).where(eq(t.concepts.bookId, bookId)),
  ]);

  return { characters, locations, timelineEvents, concepts };
}

export async function fetchOutlineTree(bookId: string): Promise<OutlineNode[]> {
  const rows = await db.select()
    .from(t.outlines)
    .where(eq(t.outlines.bookId, bookId))
    .orderBy(asc(t.outlines.order));

  const nodeMap = new Map<string, OutlineNode>();
  const roots: OutlineNode[] = [];

  for (const row of rows) {
    nodeMap.set(row.id, { id: row.id, type: row.type, title: row.title, summary: row.summary, order: row.order, children: [] });
  }

  for (const row of rows) {
    const node = nodeMap.get(row.id)!;
    if (row.parentId && nodeMap.has(row.parentId)) {
      nodeMap.get(row.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
