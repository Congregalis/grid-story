import { eq, asc, SQL, isNull } from 'drizzle-orm';
import { db } from './connection';
import * as t from './bible-tables';
import { normalizeBookCharter } from '@grid-story/composer';
import { books } from './book-tables';
import type { BibleSlice, BookCharter, OutlineNode } from '@grid-story/composer';

export function eqNull(col: typeof t.outlines.parentId, val: string | null): SQL | undefined {
  return val !== null ? eq(col, val) : isNull(col);
}

export async function fetchBibleSlice(bookId: string): Promise<BibleSlice> {
  const [characters, locations, organizations, items, timelineEvents, concepts] = await Promise.all([
    db.select().from(t.characters).where(eq(t.characters.bookId, bookId)),
    db.select().from(t.locations).where(eq(t.locations.bookId, bookId)),
    db.select().from(t.organizations).where(eq(t.organizations.bookId, bookId)),
    db.select().from(t.items).where(eq(t.items.bookId, bookId)),
    db.select().from(t.timelineEvents).where(eq(t.timelineEvents.bookId, bookId)),
    db.select().from(t.concepts).where(eq(t.concepts.bookId, bookId)),
  ]);

  return { characters, locations, organizations, items, timelineEvents, concepts };
}

export async function fetchBookCharter(bookId: string): Promise<BookCharter> {
  const rows = await db.select({
    worldview: books.worldview,
    era: books.era,
    themes: books.themes,
    hook: books.hook,
    pov: books.pov,
    tone: books.tone,
    rules: books.rules,
    avoid: books.avoid,
  })
    .from(books)
    .where(eq(books.id, bookId))
    .limit(1);

  return normalizeBookCharter(rows[0] ?? null);
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
