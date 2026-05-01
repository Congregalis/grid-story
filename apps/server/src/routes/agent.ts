import { Hono } from 'hono';
import { z } from 'zod';
import { fetchBibleSlice, fetchBookCharter, fetchOutlineTree } from '../db/queries';
import { OutlineAgent } from '../agents/outline-agent';
import { WritingAgent } from '../agents/writing-agent';
import { BibleAgent } from '../agents/bible-agent';
import { BIBLE_ENTITIES } from '@grid-story/schema';

const generateSchema = z.object({
  bookId: z.string(),
  idea: z.string().min(1),
  style: z.string().min(1),
});

const expandSceneSchema = z.object({
  bookId: z.string(),
  sceneOutline: z.string().min(1),
  style: z.string().min(1),
});

const firstDraftSchema = z.object({
  bookId: z.string(),
  sceneBrief: z.string().min(1),
  style: z.string().min(1),
  pov: z.string().default('第三人称'),
  minWords: z.number().int().positive().default(2000),
  previousEnding: z.string().optional(),
});

const continueSchema = z.object({
  bookId: z.string(),
  previousContent: z.string().min(1),
  direction: z.string().min(1),
  style: z.string().min(1),
  pov: z.string().default('第三人称'),
  minWords: z.number().int().positive().default(1000),
});

const bibleGenerateSchema = z.object({
  bookId: z.string(),
  entityType: z.enum(BIBLE_ENTITIES),
  description: z.string().min(1),
});

const bibleRefineSchema = z.object({
  bookId: z.string(),
  entityType: z.enum(BIBLE_ENTITIES),
  current: z.unknown(),
  feedback: z.string().min(1),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAgentRoutes(
  outlineAgent: OutlineAgent,
  writingAgent: WritingAgent,
  bibleAgent: BibleAgent,
) {
  const routes = new Hono();

  // -- Outline --

  routes.post('/outline/generate', async (c) => {
    const body = await c.req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, idea, style } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const generated = await outlineAgent.generateFullOutline({
      idea,
      style,
      bookId,
      bible,
      outline,
      charter,
    });

    let sceneCount = 0;
    let chapterCount = 0;
    for (const arc of generated.arcs) {
      for (const vol of arc.volumes) {
        chapterCount += vol.chapters.length;
        for (const ch of vol.chapters) sceneCount += ch.scenes.length;
      }
    }

    return c.json({
      ok: true, bookId,
      counts: { arcs: generated.arcs.length, volumes: generated.arcs.reduce((s, a) => s + a.volumes.length, 0), chapters: chapterCount, scenes: sceneCount },
      outline: generated,
    });
  });

  routes.post('/outline/expand-scene', async (c) => {
    const body = await c.req.json();
    const parsed = expandSceneSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, sceneOutline, style } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const expanded = await outlineAgent.expandScene({
      sceneOutline,
      style,
      bookId,
      bible,
      outline,
      charter,
    });
    return c.json({ ok: true, expanded });
  });

  // -- Writing --

  routes.post('/writing/first-draft', async (c) => {
    const body = await c.req.json();
    const parsed = firstDraftSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, sceneBrief, style, pov, minWords, previousEnding } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const content = await writingAgent.writeFirstDraft({
      sceneBrief,
      style,
      pov,
      minWords,
      previousEnding,
      bookId,
      bible,
      outline,
      charter,
    });

    return c.json({ ok: true, wordCount: content.length, content });
  });

  routes.post('/writing/continue', async (c) => {
    const body = await c.req.json();
    const parsed = continueSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, previousContent, direction, style, pov, minWords } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const content = await writingAgent.continueWriting({
      previousContent,
      direction,
      style,
      pov,
      minWords,
      bookId,
      bible,
      outline,
      charter,
    });

    return c.json({ ok: true, wordCount: content.length, content });
  });

  // -- Bible --

  routes.post('/bible/generate', async (c) => {
    const body = await c.req.json();
    const parsed = bibleGenerateSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, entityType, description } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);

    try {
      const entity = await bibleAgent.generateEntity(entityType, description, {
        bookId,
        bible,
        outline,
        charter,
      });
      return c.json({ ok: true, bookId, entityType, entity });
    } catch (error) {
      return c.json({ error: 'BibleAgent generate failed', details: errorMessage(error) }, 500);
    }
  });

  routes.post('/bible/refine', async (c) => {
    const body = await c.req.json();
    const parsed = bibleRefineSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, entityType, current, feedback } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);

    try {
      const entity = await bibleAgent.refineEntity(entityType, current, feedback, {
        bookId,
        bible,
        outline,
        charter,
      });
      return c.json({ ok: true, bookId, entityType, entity });
    } catch (error) {
      return c.json({ error: 'BibleAgent refine failed', details: errorMessage(error) }, 500);
    }
  });

  return routes;
}
