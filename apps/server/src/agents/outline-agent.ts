import { z } from 'zod';
import type { ContextComposer } from '@grid-story/composer';
import type { BibleSlice, OutlineNode } from '@grid-story/composer';
import type { ModelRouter } from '@grid-story/llm';

// -- Zod schemas for LLM output validation --

const generatedSceneSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
});

const generatedChapterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  scenes: z.array(generatedSceneSchema).min(2).max(4),
});

const generatedVolumeSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  chapters: z.array(generatedChapterSchema).min(1),
});

const generatedArcSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  volumes: z.array(generatedVolumeSchema).min(1),
});

const generatedOutlineSchema = z.object({
  arcs: z.array(generatedArcSchema).min(1),
});

export type GeneratedOutline = z.infer<typeof generatedOutlineSchema>;
export type GeneratedArc = z.infer<typeof generatedArcSchema>;
export type GeneratedVolume = z.infer<typeof generatedVolumeSchema>;
export type GeneratedChapter = z.infer<typeof generatedChapterSchema>;
export type GeneratedScene = z.infer<typeof generatedSceneSchema>;

// -- JSON extraction from LLM output --

function extractJson(text: string): string {
  // Try ```json ... ``` first
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try ``` ... ``` (no language tag)
  const generic = text.match(/```\s*([\s\S]*?)```/);
  if (generic) return generic[1].trim();

  // Try to find JSON object boundaries
  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }

  return text.trim();
}

// -- OutlineAgent --

const GEN_SYSTEM = '你是一个专业的小说大纲设计师。严格按照格式要求输出，不添加任何多余解释。';

export class OutlineAgent {
  constructor(
    private composer: ContextComposer,
    private router: ModelRouter,
  ) {}

  /** Generate full outline hierarchy from a story idea. */
  async generateFullOutline(input: {
    idea: string;
    style: string;
    bookId: string;
    bible: BibleSlice;
    outline: OutlineNode[];
  }): Promise<GeneratedOutline> {
    const { prompt } = this.composer.compose({
      agent: 'outline-agent',
      task: 'structure-outline',
      bible: input.bible,
      outline: input.outline,
      vars: {
        idea: input.idea,
        style: input.style,
      },
    });

    const result = await this.router.generate({
      messages: [
        { role: 'system', content: GEN_SYSTEM },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4096,
    }, 'draft');

    const json = extractJson(result.content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${result.content.slice(0, 500)}`);
    }

    const validated = generatedOutlineSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`Outline structure validation failed: ${validated.error.message}\nParsed:\n${JSON.stringify(parsed, null, 2).slice(0, 500)}`);
    }

    return validated.data;
  }

  /** Expand a scene brief into a detailed scene outline. */
  async expandScene(input: {
    sceneOutline: string;
    style: string;
    bookId: string;
    bible: BibleSlice;
    outline: OutlineNode[];
  }): Promise<string> {
    const { prompt } = this.composer.compose({
      agent: 'outline-agent',
      task: 'expand-scene',
      bible: input.bible,
      outline: input.outline,
      vars: {
        scene_outline: input.sceneOutline,
        style: input.style,
      },
    });

    const result = await this.router.generate({
      messages: [
        { role: 'user', content: prompt },
      ],
      maxTokens: 2048,
    }, 'summary');

    return result.content;
  }
}
