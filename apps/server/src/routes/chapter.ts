import { Hono } from 'hono';
import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { chapters as table } from '../db/bible-tables';
import { validateTransition } from '../workflow/engine';
import type { ChapterStatus } from '@grid-story/schema';

export const chapterRoutes = new Hono();

// -- List all versions of a chapter --
chapterRoutes.get('/:chapterRootId/versions', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');

  const rows = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId))
    .orderBy(desc(table.version));

  if (rows.length === 0) return c.json({ error: 'Chapter not found' }, 404);

  return c.json({
    chapterRootId,
    latestVersion: rows[0].version,
    versions: rows.map((r) => ({
      id: r.id,
      version: r.version,
      status: r.status,
      wordCount: r.wordCount,
      parentVersionId: r.parentVersionId,
      createdAt: r.createdAt,
    })),
  });
});

// -- Get a specific version --
chapterRoutes.get('/:chapterRootId/versions/:version', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const version = Number(c.req.param('version'));

  const rows = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId));

  const target = rows.find((r) => r.version === version);
  if (!target) return c.json({ error: `Version ${version} not found` }, 404);

  // also return which version is the latest
  const latest = rows.reduce((a, b) => (a.version > b.version ? a : b));

  return c.json({
    ...target,
    isLatest: target.id === latest.id,
    latestVersion: latest.version,
  });
});

// -- Create a new version (based on latest) --
const newVersionSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1),
  status: z.enum(['draft', 'review', 'revised', 'final', 'published']).optional(),
  outlineSceneId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

chapterRoutes.post('/:chapterRootId/new-version', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const body = await c.req.json();
  const parsed = newVersionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  // Get the latest version
  const existing = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId))
    .orderBy(desc(table.version))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Chapter not found' }, 404);

  const prev = existing[0];
  const ts = new Date().toISOString();

  const row = {
    id: uuidv4(),
    bookId: prev.bookId,
    chapterRootId,
    title: parsed.data.title ?? prev.title,
    content: parsed.data.content,
    version: prev.version + 1,
    parentVersionId: prev.id,
    status: parsed.data.status ?? prev.status,
    wordCount: parsed.data.content.length,
    order: prev.order,
    outlineSceneId:
      parsed.data.outlineSceneId !== undefined ? parsed.data.outlineSceneId : prev.outlineSceneId,
    notes: parsed.data.notes ?? null,
    createdAt: ts,
    updatedAt: ts,
  };

  await db.insert(table).values(row);

  const result = await db.select().from(table).where(eq(table.id, row.id));
  return c.json(result[0], 201);
});

// -- Restore a specific version (creates a NEW version with old content) --
const restoreSchema = z.object({
  notes: z.string().nullable().optional(),
});

chapterRoutes.post('/:chapterRootId/restore/:version', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const versionToRestore = Number(c.req.param('version'));
  const body = await c.req.json();
  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  // Find the target version
  const allVersions = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId));

  const target = allVersions.find((r) => r.version === versionToRestore);
  if (!target) return c.json({ error: `Version ${versionToRestore} not found` }, 404);

  const latest = allVersions.reduce((a, b) => (a.version > b.version ? a : b));

  // Create a new version carrying the old content forward
  const ts = new Date().toISOString();
  const row = {
    id: uuidv4(),
    bookId: target.bookId,
    chapterRootId,
    title: target.title,
    content: target.content,
    version: latest.version + 1,
    parentVersionId: latest.id,
    status: 'draft' as const,
    wordCount: target.content.length,
    order: target.order,
    outlineSceneId: target.outlineSceneId,
    notes: parsed.data.notes ?? `Restored from version ${versionToRestore}`,
    createdAt: ts,
    updatedAt: ts,
  };

  await db.insert(table).values(row);

  const result = await db.select().from(table).where(eq(table.id, row.id));
  return c.json(result[0], 201);
});

// -- Transition the latest version to a new status --
const transitionSchema = z.object({
  status: z.enum(['draft', 'review', 'revised', 'final', 'published']),
});

chapterRoutes.post('/:chapterRootId/transition', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const body = await c.req.json();
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const existing = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId))
    .orderBy(desc(table.version))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Chapter not found' }, 404);

  const current = existing[0];
  const error = validateTransition(current.status as ChapterStatus, parsed.data.status);
  if (error) return c.json({ error }, 409);

  const ts = new Date().toISOString();
  await db.update(table)
    .set({ status: parsed.data.status, updatedAt: ts })
    .where(eq(table.id, current.id));

  const result = await db.select().from(table).where(eq(table.id, current.id));
  return c.json({ ok: true, from: current.status, to: parsed.data.status, chapter: result[0] });
});

// -- Bind / unbind an outline scene on the latest version (no new version created) --
const bindSceneSchema = z.object({
  outlineSceneId: z.string().nullable(),
});

chapterRoutes.patch('/:chapterRootId/scene', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const body = await c.req.json();
  const parsed = bindSceneSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const existing = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId))
    .orderBy(desc(table.version))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Chapter not found' }, 404);

  const ts = new Date().toISOString();
  await db.update(table)
    .set({ outlineSceneId: parsed.data.outlineSceneId, updatedAt: ts })
    .where(eq(table.id, existing[0].id));

  const result = await db.select().from(table).where(eq(table.id, existing[0].id));
  return c.json({ ok: true, chapter: result[0] });
});

// -- Update latest draft in-place (no version bump) --
const updateDraftSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(0),
});

chapterRoutes.put('/:chapterRootId/draft', async (c) => {
  const chapterRootId = c.req.param('chapterRootId');
  const body = await c.req.json();
  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const existing = await db.select()
    .from(table)
    .where(eq(table.chapterRootId, chapterRootId))
    .orderBy(desc(table.version))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Chapter not found' }, 404);

  const current = existing[0];
  if (current.status !== 'draft') {
    return c.json({ error: 'Only draft chapters can be updated in-place' }, 409);
  }

  const ts = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: ts };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content !== undefined) {
    updates.content = parsed.data.content;
    updates.wordCount = parsed.data.content.length;
  }

  await db.update(table).set(updates).where(eq(table.id, current.id));

  const result = await db.select().from(table).where(eq(table.id, current.id));
  return c.json({ ok: true, chapter: result[0] });
});
