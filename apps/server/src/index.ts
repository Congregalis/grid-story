import './env';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { db } from './db/connection';
import { testDoc, testVector } from './db/schema';
import { writeFile, readFile, deleteFile } from './storage/file';

const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok', name: 'grid-story server' }));

// --- T0.2 storage verification ---

// Relational: insert + read
app.post('/storage/relational', async (c) => {
  const inserted = await db.insert(testDoc).values({
    title: 'test-' + Date.now(),
    content: 'Hello from relational storage',
  }).returning();

  const rows = await db.select().from(testDoc).where(eq(testDoc.id, inserted[0].id));

  return c.json({ ok: true, inserted: inserted[0], readBack: rows[0] });
});

// Vector: insert embedding + similarity search
app.post('/storage/vector', async (c) => {
  const emb = Array.from({ length: 1536 }, () => Math.random());

  const inserted = await db.insert(testVector).values({
    content: 'vector test ' + Date.now(),
    embedding: emb,
  }).returning();

  // similarity search using cosine distance
  const results = await db.execute(sql`
    SELECT id, content, embedding <=> ${`[${emb.join(',')}]`}::vector AS distance
    FROM test_vector
    ORDER BY distance
    LIMIT 3
  `);

  return c.json({ ok: true, inserted: inserted[0], searchResults: results.rows });
});

// File: write + read
app.post('/storage/file', async (c) => {
  const key = `test/${Date.now()}.txt`;
  await writeFile(key, 'Hello from file storage');
  const content = await readFile(key);
  await deleteFile(key);

  return c.json({ ok: true, key, content });
});

// All-in-one health check
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

  const allOk = Object.values(results).every((r) => r && typeof r === 'object' && 'ok' in r && r.ok === true);
  return c.json({ allOk, results });
});

// --- T0.3 ModelRouter verification ---

import { ModelRouter } from '@grid-story/llm';
import type { RouterConfig } from '@grid-story/llm';

function getRouter(): ModelRouter {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not set');

  const config: RouterConfig = {
    apiKeys: {
      anthropic: anthropicKey,
    },
    taskModelMap: {},
    defaultModel: { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
  };
  return new ModelRouter(config);
}

app.post('/llm/opus', async (c) => {
  const router = getRouter();
  const result = await router.generate({
    messages: [
      { role: 'system', content: '只用中文回复。' },
      { role: 'user', content: '用一句话介绍你自己（不超过30字）' },
    ],
    maxTokens: 128,
  }, 'draft');
  return c.json({ ok: true, model: 'claude-opus-4-7', ...result });
});

app.post('/llm/haiku', async (c) => {
  const router = getRouter();
  const result = await router.generate({
    messages: [
      { role: 'system', content: '只用中文回复。' },
      { role: 'user', content: '用一句话介绍你自己（不超过30字）' },
    ],
    maxTokens: 128,
  }, 'summary');
  return c.json({ ok: true, model: 'claude-haiku-4-5-20251001', ...result });
});

app.post('/llm/cached', async (c) => {
  const router = getRouter();
  // First call — should populate cache
  const r1 = await router.generate({
    messages: [
      { role: 'system', content: '你是一个小说创作助手。你的核心设定是：1) 只用中文交流 2) 风格偏文学性 3) 回答尽量简洁。' },
      { role: 'user', content: '你好' },
    ],
    maxTokens: 64,
    cacheSystemPrompt: true,
  }, 'summary');

  // Second call with same system prompt — should hit cache
  const r2 = await router.generate({
    messages: [
      { role: 'system', content: '你是一个小说创作助手。你的核心设定是：1) 只用中文交流 2) 风格偏文学性 3) 回答尽量简洁。' },
      { role: 'user', content: '再回复一次，用不同的话' },
    ],
    maxTokens: 64,
    cacheSystemPrompt: true,
  }, 'summary');

  return c.json({
    ok: true,
    call1: { content: r1.content, usage: r1.usage },
    call2: { content: r2.content, usage: r2.usage },
    cacheHit: (r2.usage.cacheReadInputTokens ?? 0) > 0,
  });
});

const port = Number(process.env.PORT) || 8432;
serve({ fetch: app.fetch, port });

console.log(`grid-story server running on http://localhost:${port}`);
