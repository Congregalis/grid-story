import { Hono } from 'hono';
import { z } from 'zod';
import { fetchBibleSlice, fetchOutlineTree } from '../db/queries';
import { OutlineAgent } from '../agents/outline-agent';

const generateSchema = z.object({
  bookId: z.string(),
  idea: z.string().min(1),
  style: z.string().min(1),
});

const expandSceneSchema = z.object({
  bookId: z.string(),
  sceneOutline: z.string().min(1),
  style: z.string().min(1),
});

export function createAgentRoutes(agent: OutlineAgent) {
  const routes = new Hono();

  // POST /agent/outline/generate — idea → full outline tree (arc→volume→chapter→scene)
  routes.post('/outline/generate', async (c) => {
    const body = await c.req.json();
    const parsed = generateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const { bookId, idea, style } = parsed.data;

    const [bible, outline] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
    ]);

    const generated = await agent.generateFullOutline({ idea, style, bookId, bible, outline });

    // Count total nodes
    let sceneCount = 0;
    let chapterCount = 0;
    for (const arc of generated.arcs) {
      for (const vol of arc.volumes) {
        chapterCount += vol.chapters.length;
        for (const ch of vol.chapters) {
          sceneCount += ch.scenes.length;
        }
      }
    }

    return c.json({
      ok: true,
      bookId,
      counts: {
        arcs: generated.arcs.length,
        volumes: generated.arcs.reduce((s, a) => s + a.volumes.length, 0),
        chapters: chapterCount,
        scenes: sceneCount,
      },
      outline: generated,
    });
  });

  // POST /agent/outline/expand-scene — expand a scene brief into detailed scene outline
  routes.post('/outline/expand-scene', async (c) => {
    const body = await c.req.json();
    const parsed = expandSceneSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 422);
    }

    const { bookId, sceneOutline, style } = parsed.data;

    const [bible, outline] = await Promise.all([
      fetchBibleSlice(bookId),
      fetchOutlineTree(bookId),
    ]);

    const expanded = await agent.expandScene({ sceneOutline, style, bookId, bible, outline });

    return c.json({ ok: true, expanded });
  });

  return routes;
}
