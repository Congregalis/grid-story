import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import * as t from '../db/bible-tables';
import {
  characterSchema, locationSchema, organizationSchema,
  itemSchema, timelineEventSchema, conceptSchema,
  outlineSchema, chapterSchema,
  createCharacterInput, createLocationInput, createOrganizationInput,
  createItemInput, createTimelineEventInput, createConceptInput,
  createOutlineInput, createChapterInput,
  updateCharacterInput, updateLocationInput, updateOrganizationInput,
  updateItemInput, updateTimelineEventInput, updateConceptInput,
  updateOutlineInput, updateChapterInput,
} from '@grid-story/schema';

// Map entity path name → Drizzle table + schemas
const registry = {
  characters: {
    table: t.characters,
    schema: characterSchema,
    createInput: createCharacterInput,
    updateInput: updateCharacterInput,
  },
  locations: {
    table: t.locations,
    schema: locationSchema,
    createInput: createLocationInput,
    updateInput: updateLocationInput,
  },
  organizations: {
    table: t.organizations,
    schema: organizationSchema,
    createInput: createOrganizationInput,
    updateInput: updateOrganizationInput,
  },
  items: {
    table: t.items,
    schema: itemSchema,
    createInput: createItemInput,
    updateInput: updateItemInput,
  },
  outlines: {
    table: t.outlines,
    schema: outlineSchema,
    createInput: createOutlineInput,
    updateInput: updateOutlineInput,
  },
  chapters: {
    table: t.chapters,
    schema: chapterSchema,
    createInput: createChapterInput,
    updateInput: updateChapterInput,
  },
  'timeline-events': {
    table: t.timelineEvents,
    schema: timelineEventSchema,
    createInput: createTimelineEventInput,
    updateInput: updateTimelineEventInput,
  },
  concepts: {
    table: t.concepts,
    schema: conceptSchema,
    createInput: createConceptInput,
    updateInput: updateConceptInput,
  },
} as const;

type EntityKey = keyof typeof registry;

function now() {
  return new Date().toISOString();
}

export const bibleRoutes = new Hono();

// GET /bible/:entity — list by bookId
bibleRoutes.get('/:entity', async (c) => {
  const entity = c.req.param('entity') as EntityKey;
  const cfg = registry[entity];
  if (!cfg) return c.json({ error: 'Unknown entity type' }, 400);

  const bookId = c.req.query('bookId');
  if (!bookId) return c.json({ error: 'bookId query parameter is required' }, 400);

  const rows = await db.select().from(cfg.table).where(eq(cfg.table.bookId, bookId));
  return c.json(rows);
});

// GET /bible/:entity/:id
bibleRoutes.get('/:entity/:id', async (c) => {
  const entity = c.req.param('entity') as EntityKey;
  const id = c.req.param('id');
  const cfg = registry[entity];
  if (!cfg) return c.json({ error: 'Unknown entity type' }, 400);

  const rows = await db.select().from(cfg.table).where(eq(cfg.table.id, id));
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

// POST /bible/:entity — create
bibleRoutes.post('/:entity', async (c) => {
  const entity = c.req.param('entity') as EntityKey;
  const cfg = registry[entity];
  if (!cfg) return c.json({ error: 'Unknown entity type' }, 400);

  const body = await c.req.json();
  const parsed = cfg.createInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  const id = uuidv4();
  const ts = now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row: any = { ...parsed.data, id, createdAt: ts, updatedAt: ts };
  await db.insert(cfg.table).values(row);

  const result = await db.select().from(cfg.table).where(eq(cfg.table.id, id));
  return c.json(result[0], 201);
});

// PUT /bible/:entity/:id — update
bibleRoutes.put('/:entity/:id', async (c) => {
  const entity = c.req.param('entity') as EntityKey;
  const id = c.req.param('id');
  const cfg = registry[entity];
  if (!cfg) return c.json({ error: 'Unknown entity type' }, 400);

  const body = await c.req.json();
  const parsed = cfg.updateInput.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
  }

  await db.update(cfg.table).set({
    ...parsed.data,
    updatedAt: now(),
  }).where(eq(cfg.table.id, id));

  const rows = await db.select().from(cfg.table).where(eq(cfg.table.id, id));
  if (rows.length === 0) return c.json({ error: 'Not found' }, 404);
  return c.json(rows[0]);
});

// DELETE /bible/:entity/:id
bibleRoutes.delete('/:entity/:id', async (c) => {
  const entity = c.req.param('entity') as EntityKey;
  const id = c.req.param('id');
  const cfg = registry[entity];
  if (!cfg) return c.json({ error: 'Unknown entity type' }, 400);

  await db.delete(cfg.table).where(eq(cfg.table.id, id));
  return c.json({ ok: true });
});

// GET /bible/characters/:id/relationships — bidirectional query
bibleRoutes.get('/characters/:id/relationships', async (c) => {
  const charId = c.req.param('id');

  // Get the character
  const rows = await db.select().from(t.characters).where(eq(t.characters.id, charId));
  if (rows.length === 0) return c.json({ error: 'Character not found' }, 404);

  const char = rows[0];

  // Outgoing: relationships defined on this character
  const outgoing = char.relationships;

  // Incoming: scan all characters in the same book for relationships pointing to this char
  const allChars = await db.select().from(t.characters).where(eq(t.characters.bookId, char.bookId));
  const incoming: { fromId: string; fromName: string; type: string; description: string }[] = [];
  for (const other of allChars) {
    if (other.id === charId) continue;
    for (const rel of other.relationships) {
      if (rel.targetId === charId) {
        incoming.push({ fromId: other.id, fromName: other.name, type: rel.type, description: rel.description });
      }
    }
  }

  return c.json({
    character: { id: char.id, name: char.name },
    outgoing,
    incoming,
  });
});
