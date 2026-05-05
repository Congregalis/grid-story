import './env';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContextComposer } from '@grid-story/composer';
import type { RouterConfig } from '@grid-story/llm';
import { ModelRouter, PromptRegistry } from '@grid-story/llm';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { BibleAgent } from './agents/bible-agent';
import { OutlineAgent } from './agents/outline-agent';
import { WritingAgent } from './agents/writing-agent';
import { db } from './db/connection';
import { testDoc, testVector } from './db/schema';
import {
  DrizzleChapterStore,
  EntityMounter,
  IngestPipeline,
  LintRunner,
  onBibleEntityChanged,
  ProseSampler,
  QueryNavigator,
  WikiSchema,
  WikiStore,
} from './memory-wiki';
import { createAgentRoutes } from './routes/agent';
import { bibleRoutes } from './routes/bible';
import { bookRoutes } from './routes/book';
import { chapterRoutes } from './routes/chapter';
import { createComposeRoutes } from './routes/compose';
import { outlineRoutes } from './routes/outline';
import { createWikiRoutes } from './routes/wiki';
import { deleteFile, readFile, writeFile } from './storage/file';
import { onChapterFinalized } from './workflow/engine';

const promptsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../packages/prompts');
const prompts = new PromptRegistry(promptsDir);
const composer = new ContextComposer(prompts);

const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok', name: 'grid-story server' }));
app.route('/book', bookRoutes);
app.route('/bible', bibleRoutes);
app.route('/outline', outlineRoutes);
app.route('/chapter', chapterRoutes);
app.route('/compose', createComposeRoutes(composer));

// --- T0.2 storage verification ---

app.post('/storage/relational', async (c) => {
  const inserted = await db
    .insert(testDoc)
    .values({
      title: 'test-' + Date.now(),
      content: 'Hello from relational storage',
    })
    .returning();

  const rows = await db.select().from(testDoc).where(eq(testDoc.id, inserted[0].id));

  return c.json({ ok: true, inserted: inserted[0], readBack: rows[0] });
});

app.post('/storage/vector', async (c) => {
  const emb = Array.from({ length: 1536 }, () => Math.random());

  const inserted = await db
    .insert(testVector)
    .values({
      content: 'vector test ' + Date.now(),
      embedding: emb,
    })
    .returning();

  const results = await db.execute(sql`
    SELECT id, content, embedding <=> ${`[${emb.join(',')}]`}::vector AS distance
    FROM test_vector
    ORDER BY distance
    LIMIT 3
  `);

  return c.json({ ok: true, inserted: inserted[0], searchResults: results.rows });
});

app.post('/storage/file', async (c) => {
  const key = `test/${Date.now()}.txt`;
  await writeFile(key, 'Hello from file storage');
  const content = await readFile(key);
  await deleteFile(key);

  return c.json({ ok: true, key, content });
});

app.get('/storage/health', async (c) => {
  const results: Record<string, unknown> = {};

  try {
    const doc = await db.insert(testDoc).values({ title: 'health', content: 'ok' }).returning();
    results.relational = { ok: true, id: doc[0].id };
  } catch (e) {
    results.relational = { ok: false, error: String(e) };
  }

  try {
    const emb = Array.from({ length: 1536 }, () => 0.1);
    await db.insert(testVector).values({ content: 'health', embedding: emb });
    results.vector = { ok: true };
  } catch (e) {
    results.vector = { ok: false, error: String(e) };
  }

  try {
    await writeFile('health.txt', 'health');
    await readFile('health.txt');
    await deleteFile('health.txt');
    results.file = { ok: true };
  } catch (e) {
    results.file = { ok: false, error: String(e) };
  }

  const allOk = Object.values(results).every(
    (r) => r && typeof r === 'object' && 'ok' in r && r.ok === true,
  );
  return c.json({ allOk, results });
});

// --- T0.3 ModelRouter verification ---

function getRouter(): ModelRouter {
  const config: RouterConfig = {
    apiKeys: {},
    taskModelMap: {},
    defaultModel: { provider: 'deepseek', modelId: 'deepseek-v4-pro' },
  };

  if (process.env.DEEPSEEK_API_KEY) {
    config.apiKeys['deepseek'] = process.env.DEEPSEEK_API_KEY;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    config.apiKeys['anthropic'] = process.env.ANTHROPIC_API_KEY;
  }

  if (Object.keys(config.apiKeys).length === 0) {
    throw new Error(
      'No API keys configured. Set DEEPSEEK_API_KEY and/or ANTHROPIC_API_KEY in .env',
    );
  }

  return new ModelRouter(config);
}

// Show which providers are configured
app.get('/llm/status', (c) => {
  const providers: Record<string, boolean> = {};
  if (process.env.DEEPSEEK_API_KEY) providers.deepseek = true;
  if (process.env.ANTHROPIC_API_KEY) providers.anthropic = true;
  return c.json({ providers });
});

// Test primary provider (Deepseek): v4-pro + v4-flash
app.post('/llm/test', async (c) => {
  const router = getRouter();

  const pro = await router.generate(
    {
      messages: [
        { role: 'system', content: '只用中文回复，不超过30字。' },
        { role: 'user', content: '用一句话介绍你自己' },
      ],
      maxTokens: 128,
    },
    'draft',
  );

  const flash = await router.generate(
    {
      messages: [
        { role: 'system', content: '只用中文回复，不超过30字。' },
        { role: 'user', content: '用一句话介绍你自己' },
      ],
      maxTokens: 128,
    },
    'summary',
  );

  return c.json({
    ok: true,
    pro: { model: 'deepseek-v4-pro', content: pro.content, usage: pro.usage },
    flash: { model: 'deepseek-v4-flash', content: flash.content, usage: flash.usage },
  });
});

// Test Anthropic fallback: Opus + Haiku (requires ANTHROPIC_API_KEY)
app.post('/llm/anthropic', async (c) => {
  const router = getRouter();

  const opus = await router.generate({
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    messages: [
      { role: 'system', content: '只用中文回复，不超过30字。' },
      { role: 'user', content: '用一句话介绍你自己' },
    ],
    maxTokens: 128,
  });

  const haiku = await router.generate({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    messages: [
      { role: 'system', content: '只用中文回复，不超过30字。' },
      { role: 'user', content: '用一句话介绍你自己' },
    ],
    maxTokens: 128,
  });

  return c.json({
    ok: true,
    opus: { model: 'claude-opus-4-7', content: opus.content, usage: opus.usage },
    haiku: { model: 'claude-haiku-4-5-20251001', content: haiku.content, usage: haiku.usage },
  });
});

// Prompt cache test (Anthropic only)
app.post('/llm/cached', async (c) => {
  const router = getRouter();

  const sysPrompt = '你是一个小说创作助手。1) 只用中文 2) 风格偏文学性 3) 回答简洁。';

  const r1 = await router.generate({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: '你好' },
    ],
    maxTokens: 64,
    cacheSystemPrompt: true,
  });

  const r2 = await router.generate({
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: '再回复一次' },
    ],
    maxTokens: 64,
    cacheSystemPrompt: true,
  });

  return c.json({
    ok: true,
    call1: { content: r1.content, usage: r1.usage },
    call2: { content: r2.content, usage: r2.usage },
    cacheHit: (r2.usage.cacheReadInputTokens ?? 0) > 0,
  });
});

// --- T0.4 PromptRegistry verification ---

await prompts.loadAll();

app.get('/prompts', (c) => c.json(prompts.list()));

app.get('/prompts/:agent/:task', (c) => {
  const { agent, task } = c.req.param();
  const version = c.req.query('v') ? Number(c.req.query('v')) : undefined;
  const content = prompts.get(agent, task, version);
  return c.text(content);
});

app.post('/prompts/render', async (c) => {
  const { agent, task, vars, version } = await c.req.json<{
    agent: string;
    task: string;
    vars: Record<string, string>;
    version?: number;
  }>();
  const rendered = prompts.render(agent, task, vars, version);
  return c.json({ ok: true, rendered });
});

// --- Agent routes ---

const router = getRouter();
const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId });
const proseSampler = new ProseSampler();
const queryNavigator = new QueryNavigator({
  wikiStoreFactory,
  proseSampler,
  router,
  prompts,
});
const lintRunner = new LintRunner({
  wikiStoreFactory,
  router,
  prompts,
});
const outlineAgent = new OutlineAgent(composer, router, queryNavigator);
const writingAgent = new WritingAgent(composer, router, queryNavigator);
const bibleAgent = new BibleAgent(composer, router);
app.route('/agent', createAgentRoutes(outlineAgent, writingAgent, bibleAgent));

const memoryWiki = new IngestPipeline({
  wikiStoreFactory,
  wikiSchema: new WikiSchema(),
  router,
  prompts,
  chapterStore: new DrizzleChapterStore(),
});

onChapterFinalized(async (event) => {
  await memoryWiki.run({ bookId: event.bookId, chapterId: event.chapterId });
});

onBibleEntityChanged(async (event) => {
  await memoryWiki.createEntityPageIfMissing(event);
});

app.route(
  '/books',
  createWikiRoutes({
    ingestRunner: memoryWiki,
    queryNavigator,
    proseSampler,
    lintRunner,
    wikiStoreFactory,
    entityMounter: new EntityMounter({ wikiStoreFactory }),
  }),
);

const port = Number(process.env.PORT) || 8432;
serve({ fetch: app.fetch, port });

console.log(`grid-story server running on http://localhost:${port}`);
