import { BIBLE_ENTITIES } from '@grid-story/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type BibleAgent, REFINE_FIELD_ACTIONS } from '../agents/bible-agent';
import type { OutlineAgent } from '../agents/outline-agent';
import type { ChapterWritingContext, WritingAgent } from '../agents/writing-agent';
import { chapters as chapterTable } from '../db/bible-tables';
import { db } from '../db/connection';
import { fetchBibleSlice, fetchBookCharter, fetchOutlineTree } from '../db/queries';

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
  chapterRootId: z.string().min(1).optional(),
  currentTitle: z.string().optional(),
  currentContent: z.string().optional(),
  sceneBrief: z.string().min(1),
  style: z.string().min(1),
  pov: z.string().default('第三人称'),
  minWords: z.number().int().positive().default(2000),
  // Deprecated: kept for old clients. Chapter continuity now comes from chapterRootId/currentContent.
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

const reviewSchema = z.object({
  bookId: z.string(),
  chapterRootId: z.string().min(1),
  content: z.string(),
});

const rewriteSchema = z.object({
  bookId: z.string(),
  chapterRootId: z.string().min(1).optional(),
  currentTitle: z.string().optional(),
  currentContent: z.string().optional(),
  selectedText: z.string().min(1),
  instruction: z.string().min(1),
  contextText: z.string().optional(),
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

const bibleRefineFieldSchema = z.object({
  bookId: z.string(),
  entityType: z.enum(BIBLE_ENTITIES),
  current: z.unknown(),
  targetField: z.string().min(1),
  action: z.enum(REFINE_FIELD_ACTIONS),
  hint: z.string().optional(),
});

const bibleStarterSchema = z.object({
  bookId: z.string(),
});

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function buildChapterWritingContext(input: {
  bookId: string;
  chapterRootId?: string;
  currentTitle?: string;
  currentContent?: string;
}): Promise<ChapterWritingContext> {
  const fallback: ChapterWritingContext = {
    currentChapterRootId: input.chapterRootId,
    currentChapterTitle: input.currentTitle,
    currentContent: input.currentContent ?? '',
  };

  if (!input.chapterRootId) return fallback;

  const currentRows = await db
    .select()
    .from(chapterTable)
    .where(
      and(
        eq(chapterTable.bookId, input.bookId),
        eq(chapterTable.chapterRootId, input.chapterRootId),
      ),
    )
    .orderBy(desc(chapterTable.version))
    .limit(1);

  const current = currentRows[0];
  if (!current) return fallback;

  const context: ChapterWritingContext = {
    currentChapterRootId: current.chapterRootId,
    currentChapterTitle: input.currentTitle?.trim() || current.title,
    currentChapterNumber: current.order,
    currentContent: input.currentContent ?? current.content,
  };

  if (current.order <= 1) return context;

  const previousRows = await db
    .select()
    .from(chapterTable)
    .where(
      and(
        eq(chapterTable.bookId, input.bookId),
        eq(chapterTable.order, current.order - 1),
        inArray(chapterTable.status, ['final', 'published']),
      ),
    )
    .orderBy(desc(chapterTable.version))
    .limit(1);

  const previous = previousRows[0];
  if (!previous) return context;

  return {
    ...context,
    previousFinalChapterTitle: previous.title,
    previousFinalChapterNumber: previous.order,
    previousFinalChapterContent: previous.content,
  };
}

function starterCounts(starterBible: Awaited<ReturnType<BibleAgent['generateStarterBible']>>) {
  return {
    characters: starterBible.characters.length,
    locations: starterBible.locations.length,
    organizations: starterBible.organizations.length,
    items: starterBible.items.length,
    concepts: starterBible.concepts.length,
    timelineEvents: starterBible.timeline_events.length,
    total:
      starterBible.characters.length +
      starterBible.locations.length +
      starterBible.organizations.length +
      starterBible.items.length +
      starterBible.concepts.length +
      starterBible.timeline_events.length,
  };
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
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

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
      ok: true,
      bookId,
      counts: {
        arcs: generated.arcs.length,
        volumes: generated.arcs.reduce((s, a) => s + a.volumes.length, 0),
        chapters: chapterCount,
        scenes: sceneCount,
      },
      outline: generated,
    });
  });

  routes.post('/outline/expand-scene', async (c) => {
    const body = await c.req.json();
    const parsed = expandSceneSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

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
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const {
      bookId,
      chapterRootId,
      currentTitle,
      currentContent,
      sceneBrief,
      style,
      pov,
      minWords,
    } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const chapterContext = await buildChapterWritingContext({
      bookId,
      chapterRootId,
      currentTitle,
      currentContent,
    });
    const content = await writingAgent.writeFirstDraft({
      sceneBrief,
      style,
      pov,
      minWords,
      bookId,
      bible,
      outline,
      charter,
      chapterContext,
    });

    return c.json({ ok: true, wordCount: content.length, content });
  });

  routes.post('/writing/continue', async (c) => {
    const body = await c.req.json();
    const parsed = continueSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

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

  routes.post('/writing/rewrite', async (c) => {
    const body = await c.req.json();
    const parsed = rewriteSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const {
      bookId,
      chapterRootId,
      currentTitle,
      currentContent,
      selectedText,
      instruction,
      contextText,
    } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const chapterContext = await buildChapterWritingContext({
      bookId,
      chapterRootId,
      currentTitle,
      currentContent: currentContent ?? contextText,
    });
    const rewritten = await writingAgent.rewriteSection({
      selectedText,
      instruction,
      contextText,
      bookId,
      bible,
      outline,
      charter,
      chapterContext,
    });

    return c.json({ ok: true, rewritten });
  });

  routes.post('/writing/review', async (c) => {
    const body = await c.req.json();
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, content } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);
    const reviewResult = await writingAgent.reviewChapter({
      chapterContent: content,
      bookId,
      bible,
      outline,
      charter,
    });

    return c.json({ ok: true, review: reviewResult });
  });

  // -- Bible --

  routes.post('/bible/generate', async (c) => {
    const body = await c.req.json();
    const parsed = bibleGenerateSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

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
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

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

  routes.post('/bible/refine-field', async (c) => {
    const body = await c.req.json();
    const parsed = bibleRefineFieldSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId, entityType, current, targetField, action, hint } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);

    try {
      const value = await bibleAgent.refineField(
        {
          type: entityType,
          current,
          targetField,
          action,
          hint,
        },
        {
          bookId,
          bible,
          outline,
          charter,
        },
      );
      return c.json({ ok: true, bookId, entityType, targetField, action, value });
    } catch (error) {
      return c.json({ error: 'BibleAgent field refine failed', details: errorMessage(error) }, 500);
    }
  });

  routes.post('/bible/generate-starter', async (c) => {
    const body = await c.req.json();
    const parsed = bibleStarterSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);

    const { bookId } = parsed.data;
    const [bible, outline, charter] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
      fetchBookCharter(bookId),
    ]);

    try {
      const starterBible = await bibleAgent.generateStarterBible({
        bookId,
        bible,
        outline,
        charter,
      });
      return c.json({
        ok: true,
        bookId,
        counts: starterCounts(starterBible),
        starterBible,
      });
    } catch (error) {
      return c.json(
        { error: 'BibleAgent starter generation failed', details: errorMessage(error) },
        500,
      );
    }
  });

  return routes;
}
