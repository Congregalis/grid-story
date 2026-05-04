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

  it('runs wiki query navigation', async () => {
    const app = new Hono();
    app.route(
      '/books',
      createWikiRoutes({
        ingestRunner: {
          async run() {
            throw new Error('should not ingest');
          },
        },
        queryNavigator: {
          async query(input: { bookId: string; context: unknown }) {
            expect(input.bookId).toBe('book-1');
            return {
              ok: true as const,
              selected_categories: ['characters' as const],
              selected_pages: [
                {
                  path: 'entities/characters/zhang-san.md',
                  category: 'characters' as const,
                  reason: '核心角色',
                },
              ],
              blocks: {
                wiki: {
                  characters: [
                    {
                      path: 'entities/characters/zhang-san.md',
                      title: '张三',
                      content: '# 张三',
                    },
                  ],
                  locations: [],
                  organizations: [],
                  items: [],
                  concepts: [],
                  recent_summaries: [],
                  global_state: null,
                  loose_threads: [],
                },
                prose: [],
                divergences: [],
              },
              assembled_context: '# MemoryWiki 上下文',
              warnings: [],
            };
          },
          async listDivergences() {
            return [];
          },
          async resolveDivergence() {
            throw new Error('should not resolve');
          },
        },
      }),
    );

    const res = await app.request('/books/book-1/wiki/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          task: 'writing.first-draft',
          scene_brief: '张三入城。',
          characters: ['张三'],
        },
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      assembled_context: '# MemoryWiki 上下文',
    });
  });

  it('returns prose samples and resolves divergences', async () => {
    const app = new Hono();
    const resolved: string[] = [];
    app.route(
      '/books',
      createWikiRoutes({
        ingestRunner: {
          async run() {
            throw new Error('should not ingest');
          },
        },
        proseSampler: {
          async sample(bookId, request) {
            return [{ bookId, request, text: '张三站在雨里。' }];
          },
        },
        queryNavigator: {
          async query() {
            throw new Error('should not query');
          },
          async listDivergences() {
            return [
              {
                id: 'div-1',
                page_path: 'entities/characters/zhang-san.md',
                kind: 'wiki_conflict' as const,
                new_observation: '称呼不一致',
              },
            ];
          },
          async resolveDivergence(input) {
            resolved.push(input.id);
            return {
              id: input.id,
              page_path: 'entities/characters/zhang-san.md',
              kind: 'wiki_conflict' as const,
              new_observation: input.decision,
            };
          },
        },
      }),
    );

    const samplesRes = await app.request(
      '/books/book-1/wiki/prose-samples?characters=张三&recentChapters=2',
    );
    const divergencesRes = await app.request('/books/book-1/wiki/divergences');
    const resolveRes = await app.request('/books/book-1/wiki/divergences/div-1/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: '以 Bible 为准' }),
    });

    expect(samplesRes.status).toBe(200);
    await expect(samplesRes.json()).resolves.toMatchObject({ ok: true });
    expect(divergencesRes.status).toBe(200);
    await expect(divergencesRes.json()).resolves.toMatchObject({
      divergences: [{ id: 'div-1' }],
    });
    expect(resolveRes.status).toBe(200);
    expect(resolved).toEqual(['div-1']);
  });

  it('runs lint, lists lint reports, exposes history, and rolls back by run id', async () => {
    const app = new Hono();
    const rolledBack: string[] = [];
    app.route(
      '/books',
      createWikiRoutes({
        ingestRunner: {
          async run() {
            throw new Error('should not ingest');
          },
        },
        lintRunner: {
          async run(input) {
            expect(input).toEqual({ bookId: 'book-1', force: true });
            return {
              ok: true as const,
              skipped: false,
              reportPath: 'tracking/lint/report-20260504T120000Z.md',
              generatedAt: '2026-05-04T12:00:00.000Z',
              counts: { critical: 0, warning: 1, info: 0 },
              issues: [
                {
                  id: 'lint-1',
                  check: 'dead_wikilink',
                  severity: 'warning' as const,
                  title: '死链',
                  message: '无法解析链接',
                  source: 'deterministic' as const,
                  auto_fixable: false,
                },
              ],
            };
          },
          async listReports() {
            return [
              {
                path: 'tracking/lint/report-20260504T120000Z.md',
                title: 'MemoryWiki Lint Report',
                generatedAt: '2026-05-04T12:00:00.000Z',
                issueCount: 1,
                critical: 0,
                warning: 1,
                info: 0,
              },
            ];
          },
        },
        wikiStoreFactory: () => ({
          async ensureBase() {},
          async readHistory() {
            return [
              {
                run_id: 'run-1',
                ts: '2026-05-04T10:00:00.000Z',
                run_type: 'ingest' as const,
                files_changed: ['chapters/ch-1.md'],
                file_hashes_before: {},
                file_hashes_after: {},
              },
            ];
          },
          async rollbackStaging(runId: string) {
            rolledBack.push(runId);
            return {
              run_id: 'rollback-run-1',
              ts: '2026-05-04T12:00:00.000Z',
              run_type: 'rollback' as const,
              rollback_of: runId,
              files_changed: [],
              file_hashes_before: {},
              file_hashes_after: {},
            };
          },
        }),
      }),
    );

    const lintRes = await app.request('/books/book-1/wiki/lint?force=true', {
      method: 'POST',
    });
    const reportsRes = await app.request('/books/book-1/wiki/lint/reports');
    const historyRes = await app.request('/books/book-1/wiki/history');
    const rollbackRes = await app.request('/books/book-1/wiki/rollback/run-1', {
      method: 'POST',
    });

    expect(lintRes.status).toBe(200);
    await expect(lintRes.json()).resolves.toMatchObject({
      ok: true,
      reportPath: 'tracking/lint/report-20260504T120000Z.md',
    });
    expect(reportsRes.status).toBe(200);
    await expect(reportsRes.json()).resolves.toMatchObject({
      reports: [{ issueCount: 1 }],
    });
    expect(historyRes.status).toBe(200);
    await expect(historyRes.json()).resolves.toMatchObject({
      history: [{ run_id: 'run-1' }],
    });
    expect(rollbackRes.status).toBe(200);
    expect(rolledBack).toEqual(['run-1']);
  });
});
