import { Hono } from 'hono';
import { z } from 'zod';
import { ContextComposer } from '@grid-story/composer';
import { fetchBibleSlice, fetchOutlineTree } from '../db/queries';

const composeSchema = z.object({
  agent: z.string(),
  task: z.string(),
  bookId: z.string(),
  vars: z.record(z.string(), z.string()).optional(),
});

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
