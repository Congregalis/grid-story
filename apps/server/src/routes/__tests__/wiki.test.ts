import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createWikiRoutes } from '../wiki';

describe('wiki routes', () => {
  it('runs manual ingest for a book chapter', async () => {
    const app = new Hono();
    const pipeline = {
      async run(input: { bookId: string; chapterId: string }) {
        return {
          ok: true as const,
          runId: 'run-1',
          chapterId: input.chapterId,
          chapterNumber: 1,
          updatedPages: [],
          divergencesCount: 0,
          history: {
            run_id: 'run-1',
            ts: '2026-05-04T12:00:00.000Z',
            run_type: 'ingest' as const,
            files_changed: [],
            file_hashes_before: {},
            file_hashes_after: {},
          },
        };
      },
    };
    app.route('/books', createWikiRoutes(pipeline));

    const res = await app.request('/books/book-1/wiki/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapterId: 'chapter-1' }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      runId: 'run-1',
      chapterId: 'chapter-1',
    });
  });

  it('validates ingest request body', async () => {
    const app = new Hono();
    const pipeline = {
      async run() {
        throw new Error('should not run');
      },
    };
    app.route('/books', createWikiRoutes(pipeline));

    const res = await app.request('/books/book-1/wiki/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(422);
  });
});
