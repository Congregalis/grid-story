import { Hono } from 'hono';
import { z } from 'zod';
import type { RunIngestResult } from '../memory-wiki';

const ingestSchema = z.object({
  chapterId: z.string().min(1),
});

interface WikiIngestRunner {
  run(input: { bookId: string; chapterId: string }): Promise<RunIngestResult>;
}

export function createWikiRoutes(pipeline: WikiIngestRunner) {
  const routes = new Hono();

  routes.post('/:bookId/wiki/ingest', async (c) => {
    const bookId = c.req.param('bookId');
    const body = await c.req.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const result = await pipeline.run({
      bookId,
      chapterId: parsed.data.chapterId,
    });

    return c.json(result);
  });

  return routes;
}
