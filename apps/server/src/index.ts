import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => c.json({ status: 'ok', name: 'grid-story server' }));

const port = Number(process.env.PORT) || 8432;
serve({ fetch: app.fetch, port });

console.log(`grid-story server running on http://localhost:${port}`);
