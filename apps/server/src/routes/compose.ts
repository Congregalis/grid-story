import { Hono } from 'hono';
import { z } from 'zod';
import { eq, asc, and, or, SQL, isNull } from 'drizzle-orm';
import { db } from '../db/connection';
import * as t from '../db/bible-tables';
import { ContextComposer } from '@grid-story/composer';
import type { BibleSlice, OutlineNode } from '@grid-story/composer';

const composeSchema = z.object({
  agent: z.string(),
  task: z.string(),
  bookId: z.string(),
  vars: z.record(z.string(), z.string()).optional(),
});

function eqNull(col: typeof t.outlines.parentId, val: string | null): SQL | undefined {
  return val !== null ? eq(col, val) : isNull(col);
}

async function fetchBibleSlice(bookId: string): Promise<BibleSlice> {
  const [characters, locations, timelineEvents, concepts] = await Promise.all([
    db.select().from(t.characters).where(eq(t.characters.bookId, bookId)),
    db.select().from(t.locations).where(eq(t.locations.bookId, bookId)),
    db.select().from(t.timelineEvents).where(eq(t.timelineEvents.bookId, bookId)),
    db.select().from(t.concepts).where(eq(t.concepts.bookId, bookId)),
  ]);

  return { characters, locations, timelineEvents, concepts };
}

async function fetchOutlineTree(bookId: string): Promise<OutlineNode[]> {
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

export function createComposeRoutes(composer: ContextComposer) {
  const routes = new Hono();

  routes.post('/', async (c) => {
    const body = await c.req.json();
    const parsed = composeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const { agent, task, bookId, vars } = parsed.data;

    const [bible, outline] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
    ]);

    const result = composer.compose({ agent, task, bible, outline, vars });

    return c.json({
      ok: true,
      agent,
      task,
      bookId,
      entityCounts: {
        characters: bible.characters?.length ?? 0,
        locations: bible.locations?.length ?? 0,
        timelineEvents: bible.timelineEvents?.length ?? 0,
        concepts: bible.concepts?.length ?? 0,
        outlineNodes: outline.length,
      },
      prompt: result.prompt,
    });
  });

  return routes;
}
