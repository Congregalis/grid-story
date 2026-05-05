import { createFeedbackRecordInput, feedbackRecordSchema } from '@grid-story/schema';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { feedbackRecords } from '../db/bible-tables';
import { db } from '../db/connection';

function now() {
  return new Date().toISOString();
}

export const feedbackRoutes = new Hono();

feedbackRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createFeedbackRecordInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const row = {
    ...parsed.data,
    id: uuidv4(),
    createdAt: now(),
  };
  await db.insert(feedbackRecords).values(row);

  const result = await db.select().from(feedbackRecords).where(eq(feedbackRecords.id, row.id));
  return c.json(feedbackRecordSchema.parse(result[0]), 201);
});

feedbackRoutes.get('/', async (c) => {
  const bookId = c.req.query('bookId');
  if (!bookId) return c.json({ error: 'bookId query parameter is required' }, 400);
  const chapterRootId = c.req.query('chapterRootId');

  const rows = await db
    .select()
    .from(feedbackRecords)
    .where(
      chapterRootId
        ? and(eq(feedbackRecords.bookId, bookId), eq(feedbackRecords.chapterRootId, chapterRootId))
        : eq(feedbackRecords.bookId, bookId),
    )
    .orderBy(desc(feedbackRecords.createdAt));

  return c.json(rows.map((row) => feedbackRecordSchema.parse(row)));
});

feedbackRoutes.get('/export', async (c) => {
  const bookId = c.req.query('bookId');
  if (!bookId) return c.json({ error: 'bookId query parameter is required' }, 400);

  const rows = await db
    .select()
    .from(feedbackRecords)
    .where(eq(feedbackRecords.bookId, bookId))
    .orderBy(desc(feedbackRecords.createdAt));
  const records = rows.map((row) => feedbackRecordSchema.parse(row));

  c.header('Content-Disposition', `attachment; filename="feedback-${bookId}.json"`);
  return c.json({
    ok: true,
    bookId,
    exportedAt: now(),
    count: records.length,
    records,
  });
});
