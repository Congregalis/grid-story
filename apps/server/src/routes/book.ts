import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { createBookInput, updateBookInput } from '@grid-story/schema';
import { db } from '../db/connection';
import { books } from '../db/book-tables';

function now() {
  return new Date().toISOString();
}

export const bookRoutes = new Hono();

bookRoutes.get('/', async (c) => {
  const rows = await db.select().from(books).orderBy(asc(books.createdAt));
  return c.json(rows);
});

bookRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rows = await db.select().from(books).where(eq(books.id, id));
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

bookRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createBookInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const id = parsed.data.id ?? uuidv4();
  const ts = now();
  const row = { ...parsed.data, id, createdAt: ts, updatedAt: ts };
  await db.insert(books).values(row);

  const result = await db.select().from(books).where(eq(books.id, id));
  return c.json(result[0], 201);
});

bookRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateBookInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const existing = await db.select({ id: books.id }).from(books).where(eq(books.id, id));
  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  await db.update(books).set({
    ...parsed.data,
    updatedAt: now(),
  }).where(eq(books.id, id));

  const rows = await db.select().from(books).where(eq(books.id, id));
  return c.json(rows[0]);
});

bookRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const deleted = await db.delete(books).where(eq(books.id, id)).returning({ id: books.id });
  if (deleted.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json({ ok: true });
});
