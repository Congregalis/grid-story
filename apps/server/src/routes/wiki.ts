import {
  type WikiDivergence,
  type WikiLintReportSummary,
  type WikiLintResult,
  type WikiQueryResult,
  wikiQueryContextSchema,
} from '@grid-story/schema';
import matter from 'gray-matter';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ProseSampleRequest, RunIngestResult, WikiHistoryEntry } from '../memory-wiki';

const ingestSchema = z.object({
  chapterId: z.string().min(1),
});

interface WikiIngestRunner {
  run(input: { bookId: string; chapterId: string }): Promise<RunIngestResult>;
}

interface WikiQueryRunner {
  query(input: { bookId: string; context: unknown }): Promise<WikiQueryResult>;
  listDivergences(bookId: string): Promise<WikiDivergence[]>;
  resolveDivergence(input: {
    bookId: string;
    id: string;
    decision: string;
    note?: string;
  }): Promise<WikiDivergence>;
}

interface WikiProseSampler {
  sample(bookId: string, request: ProseSampleRequest): Promise<unknown>;
}

interface WikiLintRunner {
  run(input: { bookId: string; force?: boolean }): Promise<WikiLintResult>;
  listReports(bookId: string): Promise<WikiLintReportSummary[]>;
}

interface WikiStoreAccess {
  ensureBase(): Promise<void>;
  readHistory(): Promise<WikiHistoryEntry[]>;
  rollbackStaging(runId: string): Promise<WikiHistoryEntry>;
  read(relativePath: string): Promise<string>;
  list(
    dir?: string,
    options?: { recursive?: boolean },
  ): Promise<string[]>;
  resolveLink(linkText: string): Promise<string>;
}

interface CreateWikiRoutesOptions {
  ingestRunner: WikiIngestRunner;
  queryNavigator?: WikiQueryRunner;
  proseSampler?: WikiProseSampler;
  lintRunner?: WikiLintRunner;
  wikiStoreFactory?: (bookId: string) => WikiStoreAccess;
}

const querySchema = z.object({
  context: wikiQueryContextSchema,
});

const resolveDivergenceSchema = z.object({
  decision: z.string().min(1),
  note: z.string().optional(),
});

const lintBodySchema = z.object({
  force: z.boolean().optional(),
});

const SAFE_PATH_RE = /^[a-zA-Z0-9._/-]+$/;

interface PageMeta {
  path: string;
  title: string | null;
  slug: string | null;
  page_type: string | null;
  bible_entity_id: string | null;
  updated_at: string | null;
  last_ingest_chapter: number | null;
  first_appearance: number | null;
  last_appearance: number | null;
  status: string | null;
  chapter_number: number | null;
  category: string | null;
  tags: string[] | null;
}

interface SearchHit {
  path: string;
  title: string;
  page_type: string | null;
  matches: { line: number; text: string }[];
}

export function createWikiRoutes(input: WikiIngestRunner | CreateWikiRoutesOptions) {
  const options = normalizeOptions(input);
  const routes = new Hono();

  routes.post('/:bookId/wiki/ingest', async (c) => {
    const bookId = c.req.param('bookId');
    const body = await c.req.json();
    const parsed = ingestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const result = await options.ingestRunner.run({
      bookId,
      chapterId: parsed.data.chapterId,
    });

    return c.json(result);
  });

  routes.post('/:bookId/wiki/query', async (c) => {
    if (!options.queryNavigator) {
      return c.json({ error: 'QueryNavigator not configured' }, 501);
    }

    const bookId = c.req.param('bookId');
    const body = await c.req.json();
    const parsed = querySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const result = await options.queryNavigator.query({
      bookId,
      context: parsed.data.context,
    });

    return c.json(result);
  });

  routes.get('/:bookId/wiki/prose-samples', async (c) => {
    if (!options.proseSampler) {
      return c.json({ error: 'ProseSampler not configured' }, 501);
    }

    const bookId = c.req.param('bookId');
    const url = new URL(c.req.url);
    const samples = await options.proseSampler.sample(bookId, {
      characters: queryList(url, 'characters'),
      recentChapters: queryNumber(url, 'recentChapters'),
      keyScenes: queryList(url, 'keyScenes'),
      maxSamples: queryNumber(url, 'maxSamples'),
      maxCharsPerSample: queryNumber(url, 'maxCharsPerSample'),
    });

    return c.json({ ok: true, samples });
  });

  routes.get('/:bookId/wiki/divergences', async (c) => {
    if (!options.queryNavigator) {
      return c.json({ error: 'QueryNavigator not configured' }, 501);
    }

    const divergences = await options.queryNavigator.listDivergences(c.req.param('bookId'));
    return c.json({ ok: true, divergences });
  });

  routes.post('/:bookId/wiki/divergences/:id/resolve', async (c) => {
    if (!options.queryNavigator) {
      return c.json({ error: 'QueryNavigator not configured' }, 501);
    }

    const body = await c.req.json();
    const parsed = resolveDivergenceSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const divergence = await options.queryNavigator.resolveDivergence({
      bookId: c.req.param('bookId'),
      id: c.req.param('id'),
      decision: parsed.data.decision,
      note: parsed.data.note,
    });

    return c.json({ ok: true, divergence });
  });

  routes.post('/:bookId/wiki/lint', async (c) => {
    if (!options.lintRunner) {
      return c.json({ error: 'LintRunner not configured' }, 501);
    }

    const url = new URL(c.req.url);
    const forceFromQuery = url.searchParams.get('force') === 'true';
    const body = await readOptionalJson(c.req);
    const parsed = lintBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const result = await options.lintRunner.run({
      bookId: c.req.param('bookId'),
      force: forceFromQuery || parsed.data.force === true,
    });

    return c.json(result);
  });

  routes.get('/:bookId/wiki/lint/reports', async (c) => {
    if (!options.lintRunner) {
      return c.json({ error: 'LintRunner not configured' }, 501);
    }

    const reports = await options.lintRunner.listReports(c.req.param('bookId'));
    return c.json({ ok: true, reports });
  });

  routes.get('/:bookId/wiki/history', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }

    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const history = await wikiStore.readHistory();
    return c.json({ ok: true, history });
  });

  routes.post('/:bookId/wiki/rollback/:runId', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }

    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const history = await wikiStore.rollbackStaging(c.req.param('runId'));
    return c.json({ ok: true, history });
  });

  // ── Sprint 4 read APIs ──────────────────────────────────────────────────

  routes.get('/:bookId/wiki/index', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const raw = await wikiStore.read('index/_root.md').catch(() => '');
    const parsed = matter(raw);
    return c.json({
      ok: true,
      path: 'index/_root.md',
      raw,
      frontmatter: parsed.data,
      content: parsed.content,
    });
  });

  routes.get('/:bookId/wiki/index/:category', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const category = c.req.param('category');
    if (!/^[a-z0-9-]+$/.test(category)) {
      return c.json({ error: 'Invalid category' }, 400);
    }
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const relPath = `index/${category}.md`;
    let raw: string;
    try {
      raw = await wikiStore.read(relPath);
    } catch {
      return c.json({ error: 'Category not found' }, 404);
    }
    const parsed = matter(raw);
    return c.json({
      ok: true,
      path: relPath,
      raw,
      frontmatter: parsed.data,
      content: parsed.content,
    });
  });

  routes.get('/:bookId/wiki/log', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const raw = await wikiStore.read('log.md').catch(() => '');
    const parsed = matter(raw);
    return c.json({ ok: true, raw, content: parsed.content });
  });

  routes.get('/:bookId/wiki/pages', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();
    const url = new URL(c.req.url);
    const dir = (url.searchParams.get('dir') ?? '').trim();
    const recursive = url.searchParams.get('recursive') !== 'false';

    const files = await wikiStore.list(dir, { recursive });
    const pages: PageMeta[] = [];
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await wikiStore.read(file).catch(() => '');
      if (!raw) continue;
      const fm = matter(raw).data as Record<string, unknown>;
      pages.push(extractPageMeta(file, fm));
    }
    pages.sort((a, b) => a.path.localeCompare(b.path));
    return c.json({ ok: true, pages });
  });

  routes.get('/:bookId/wiki/search', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const url = new URL(c.req.url);
    const q = (url.searchParams.get('q') ?? '').trim();
    if (!q) return c.json({ ok: true, hits: [] });
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();

    const files = await wikiStore.list('', { recursive: true });
    const needle = q.toLowerCase();
    const hits: SearchHit[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await wikiStore.read(file).catch(() => '');
      if (!raw) continue;

      const lines = raw.split('\n');
      const matchedLines: { line: number; text: string }[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(needle)) {
          matchedLines.push({ line: i + 1, text: lines[i].slice(0, 240) });
          if (matchedLines.length >= 3) break;
        }
      }
      if (matchedLines.length > 0) {
        const fm = matter(raw).data as Record<string, unknown>;
        hits.push({
          path: file,
          title: stringField(fm.title) ?? file,
          page_type: stringField(fm.page_type),
          matches: matchedLines,
        });
      }
      if (hits.length >= 50) break;
    }
    return c.json({ ok: true, hits });
  });

  // Wildcard: /page/<path-with-slashes>. Must come AFTER specific /page-* routes.
  routes.get('/:bookId/wiki/page/:pagePath{.+}', async (c) => {
    if (!options.wikiStoreFactory) {
      return c.json({ error: 'WikiStore not configured' }, 501);
    }
    const pagePath = c.req.param('pagePath');
    if (!pagePath || !SAFE_PATH_RE.test(pagePath) || pagePath.includes('..')) {
      return c.json({ error: 'Invalid page path' }, 400);
    }
    const wikiStore = options.wikiStoreFactory(c.req.param('bookId'));
    await wikiStore.ensureBase();

    const candidate = pagePath.endsWith('.md') ? pagePath : `${pagePath}.md`;
    let resolved = candidate;
    let raw: string;
    try {
      raw = await wikiStore.read(candidate);
    } catch {
      try {
        resolved = await wikiStore.resolveLink(pagePath);
        raw = await wikiStore.read(resolved);
      } catch {
        return c.json({ error: 'Page not found', requested: pagePath }, 404);
      }
    }

    const parsed = matter(raw);
    return c.json({
      ok: true,
      path: resolved,
      raw,
      frontmatter: parsed.data,
      content: parsed.content,
    });
  });

  return routes;
}

function normalizeOptions(
  input: WikiIngestRunner | CreateWikiRoutesOptions,
): CreateWikiRoutesOptions {
  if ('ingestRunner' in input) return input;
  return { ingestRunner: input };
}

function queryList(url: URL, name: string): string[] {
  return [...url.searchParams.getAll(name), ...url.searchParams.getAll(`${name}[]`)]
    .map((value) => value.trim())
    .filter(Boolean);
}

function queryNumber(url: URL, name: string): number | undefined {
  const value = url.searchParams.get(name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function readOptionalJson(req: {
  header(name: string): string | undefined;
  json(): Promise<unknown>;
}) {
  const contentType = req.header('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  return req.json().catch(() => ({}));
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function tagsField(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const tags = value.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
  return tags.length > 0 ? tags : null;
}

function extractPageMeta(path: string, fm: Record<string, unknown>): PageMeta {
  return {
    path,
    title: stringField(fm.title),
    slug: stringField(fm.slug),
    page_type: stringField(fm.page_type),
    bible_entity_id: stringField(fm.bible_entity_id),
    updated_at: stringField(fm.updated_at),
    last_ingest_chapter: numberField(fm.last_ingest_chapter),
    first_appearance: numberField(fm.first_appearance),
    last_appearance: numberField(fm.last_appearance),
    status: stringField(fm.status),
    chapter_number: numberField(fm.chapter_number),
    category: stringField(fm.category),
    tags: tagsField(fm.tags),
  };
}
