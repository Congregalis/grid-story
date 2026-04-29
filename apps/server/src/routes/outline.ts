import { Hono } from 'hono';
import { and, asc, eq, isNull, or, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection';
import { outlines as table } from '../db/bible-tables';

/** Drizzle-safe nullable column comparison. */
function eqNull(col: typeof table.parentId, val: string | null): SQL | undefined {
  return val !== null ? eq(col, val) : isNull(col);
}

export const outlineRoutes = new Hono();

// -- Tree: return full nested tree for a book --
outlineRoutes.get('/tree', async (c) => {
  const bookId = c.req.query('bookId');
  if (!bookId) return c.json({ error: 'bookId query parameter is required' }, 400);

  const rows = await db.select().from(table)
    .where(eq(table.bookId, bookId))
    .orderBy(asc(table.order));

  const nodeMap = new Map<string, { node: typeof rows[number]; children: unknown[] }>();
  const roots: typeof rows[number][] = [];

  for (const row of rows) {
    nodeMap.set(row.id, { node: row, children: [] });
  }

  for (const row of rows) {
    if (row.parentId && nodeMap.has(row.parentId)) {
      nodeMap.get(row.parentId)!.children.push(nodeMap.get(row.id)!);
    } else {
      roots.push(row);
    }
  }

  return c.json({ bookId, roots: roots.map((r) => nodeMap.get(r.id)!) });
});

// -- Move a node to a new parent and position --
const moveSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  order: z.number().int().min(0),
});

outlineRoutes.post('/move', async (c) => {
  const body = await c.req.json();
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { id, parentId, order: targetOrder } = parsed.data;

  // Verify the node exists
  const target = await db.select().from(table).where(eq(table.id, id));
  if (target.length === 0) return c.json({ error: 'Node not found' }, 404);

  const node = target[0];

  // 1. Shift siblings at the target position to make room
  const siblings = await db.select().from(table)
    .where(eqNull(table.parentId, parentId))
    .orderBy(asc(table.order));

  let shift = targetOrder;
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i].id === id) {
      // This is the node being moved — skip it's new position
      continue;
    }
    if (siblings[i].order >= targetOrder) {
      await db.update(table)
        .set({ order: siblings[i].order + 1, updatedAt: new Date().toISOString() })
        .where(eq(table.id, siblings[i].id));
    }
  }

  // 2. Update the moved node
  const updatedAt = new Date().toISOString();
  await db.update(table)
    .set({ parentId, order: targetOrder, updatedAt })
    .where(eq(table.id, id));

  // 3. Close gaps in old sibling list
  const oldSiblings = await db.select().from(table)
    .where(eqNull(table.parentId, node.parentId))
    .orderBy(asc(table.order));

  for (let i = 0; i < oldSiblings.length; i++) {
    if (oldSiblings[i].order !== i) {
      await db.update(table)
        .set({ order: i, updatedAt: new Date().toISOString() })
        .where(eq(table.id, oldSiblings[i].id));
    }
  }

  const result = await db.select().from(table).where(eq(table.id, id));
  return c.json(result[0]);
});

// -- Reorder siblings by providing the full ordered ID list --
const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
});

outlineRoutes.post('/reorder', async (c) => {
  const body = await c.req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const { orderedIds } = parsed.data;

  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(table)
        .set({ order: i, updatedAt: new Date().toISOString() })
        .where(eq(table.id, orderedIds[i]));
    }
  });

  const rows = await db.select().from(table)
    .where(eq(table.id, orderedIds[0]))
    .limit(1);

  const bookId = rows[0]?.bookId;
  const refreshed = bookId
    ? await db.select().from(table)
        .where(eqNull(table.parentId, rows[0].parentId))
        .orderBy(asc(table.order))
    : [];

  return c.json({ ok: true, siblings: refreshed });
});
