import {
  type WikiDivergence,
  type WikiQueryResult,
  wikiQueryContextSchema,
} from '@grid-story/schema';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ProseSampleRequest, RunIngestResult } from '../memory-wiki';

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

interface CreateWikiRoutesOptions {
  ingestRunner: WikiIngestRunner;
  queryNavigator?: WikiQueryRunner;
  proseSampler?: WikiProseSampler;
}

const querySchema = z.object({
  context: wikiQueryContextSchema,
});

const resolveDivergenceSchema = z.object({
  decision: z.string().min(1),
  note: z.string().optional(),
});

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
