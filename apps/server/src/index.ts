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

const port = Number(process.env.PORT) || 8432;
serve({ fetch: app.fetch, port });

console.log(`grid-story server running on http://localhost:${port}`);
