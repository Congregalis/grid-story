import { z } from 'zod';
import type { BibleSlice, BookCharter, ContextComposer, OutlineNode } from '@grid-story/composer';
import type { ChatMessageContent, ModelRouter, TaskType } from '@grid-story/llm';
import {
  createCharacterInput,
  createConceptInput,
  createItemInput,
  createLocationInput,
  createOrganizationInput,
  createTimelineEventInput,
} from '@grid-story/schema';
import type { BibleEntityType } from '@grid-story/schema';

const BIBLE_SYSTEM =
  '你是 StoryBible 设定库助理。只输出一个合法 JSON 对象，不要 Markdown，不要解释。';

const ENTITY_SCHEMAS = {
  character: createCharacterInput,
  location: createLocationInput,
  organization: createOrganizationInput,
  item: createItemInput,
  timelineEvent: createTimelineEventInput,
  concept: createConceptInput,
} satisfies Record<BibleEntityType, z.ZodTypeAny>;

const GENERATE_TASKS = {
  character: 'generate-character',
  location: 'generate-location',
  organization: 'generate-organization',
  item: 'generate-item',
  timelineEvent: 'generate-timeline-event',
  concept: 'generate-concept',
} satisfies Record<BibleEntityType, string>;

const ENTITY_LABELS = {
  character: '角色',
  location: '地点',
  organization: '组织',
  item: '物品',
  timelineEvent: '时间线事件',
  concept: '概念',
} satisfies Record<BibleEntityType, string>;

const ENTITY_SCHEMA_HINTS = {
  character: [
    'bookId: string',
    'name: string',
    'aliases: string[]',
    'gender: "male" | "female" | "other" | null',
    'age: string | null',
    'species: string | null',
    'appearance: string | null',
    'personality: string | null',
    'background: string | null',
    'motivation: string | null',
    'abilities: string[]',
    'relationships: { targetId: string; type: string; description: string }[]',
    'locationId: string | null',
    'organizationIds: string[]',
    'notes: string | null',
  ],
  location: [
    'bookId: string',
    'name: string',
    'type: string',
    'parentId: string | null',
    'description: string | null',
    'atmosphere: string | null',
    'significance: string | null',
    'notes: string | null',
  ],
  organization: [
    'bookId: string',
    'name: string',
    'type: string',
    'description: string | null',
    'leaderId: string | null',
    'memberIds: string[]',
    'goals: string | null',
    'structure: string | null',
    'locationId: string | null',
    'notes: string | null',
  ],
  item: [
    'bookId: string',
    'name: string',
    'type: string',
    'description: string | null',
    'ownerId: string | null',
    'origin: string | null',
    'abilities: string[]',
    'significance: string | null',
    'notes: string | null',
  ],
  timelineEvent: [
    'bookId: string',
    'title: string',
    'description: string | null',
    'timestamp: string | null',
    'order: integer',
    'relatedCharacterIds: string[]',
    'relatedLocationIds: string[]',
    'causeEventIds: string[]',
    'effectEventIds: string[]',
    'notes: string | null',
  ],
  concept: [
    'bookId: string',
    'name: string',
    'category: string',
    'description: string | null',
    'rules: string | null',
    'examples: string | null',
    'notes: string | null',
  ],
} satisfies Record<BibleEntityType, string[]>;

export type GeneratedBibleEntity = z.infer<(typeof ENTITY_SCHEMAS)[BibleEntityType]>;

export interface BibleAgentContext {
  bookId: string;
  bible: BibleSlice;
  outline: OutlineNode[];
  charter: BookCharter;
}

function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const generic = text.match(/```\s*([\s\S]*?)```/);
  if (generic) return generic[1].trim();

  const objStart = text.indexOf('{');
  const objEnd = text.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return text.slice(objStart, objEnd + 1);
  }

  return text.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapEntity(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.entity)) return value.entity;
  return value;
}

function stripServerManagedFields(entity: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...entity };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class BibleAgent {
  constructor(
    private composer: ContextComposer,
    private router: ModelRouter,
  ) {}

  async generateEntity(
    type: BibleEntityType,
    description: string,
    ctx: BibleAgentContext,
  ): Promise<GeneratedBibleEntity> {
    const composed = this.composer.compose({
      agent: 'bible-agent',
      task: GENERATE_TASKS[type],
      bookId: ctx.bookId,
      charter: ctx.charter,
      bible: ctx.bible,
      outline: ctx.outline,
      vars: {
        book_id: ctx.bookId,
        entity_type: type,
        entity_label: ENTITY_LABELS[type],
        entity_schema: ENTITY_SCHEMA_HINTS[type].join('\n'),
        description,
        bible_context: '',
        outline_context: '',
      },
    });

    return this.generateValidatedEntity({
      prompt: composed.prompt,
      promptContent: composed.promptContent,
      type,
      bookId: ctx.bookId,
      task: 'draft',
    });
  }

  async refineEntity(
    type: BibleEntityType,
    current: unknown,
    feedback: string,
    ctx: BibleAgentContext,
  ): Promise<GeneratedBibleEntity> {
    const normalizedCurrent = this.normalizeEntity(type, current, ctx.bookId);
    const composed = this.composer.compose({
      agent: 'bible-agent',
      task: 'refine',
      bookId: ctx.bookId,
      charter: ctx.charter,
      bible: ctx.bible,
      outline: ctx.outline,
      vars: {
        book_id: ctx.bookId,
        entity_type: type,
        entity_label: ENTITY_LABELS[type],
        entity_schema: ENTITY_SCHEMA_HINTS[type].join('\n'),
        current_entity: JSON.stringify(normalizedCurrent, null, 2),
        feedback,
        bible_context: '',
        outline_context: '',
      },
    });

    return this.generateValidatedEntity({
      prompt: composed.prompt,
      promptContent: composed.promptContent,
      type,
      bookId: ctx.bookId,
      task: 'rewrite',
    });
  }

  private normalizeEntity(
    type: BibleEntityType,
    entity: unknown,
    bookId: string,
  ): GeneratedBibleEntity {
    const unwrapped = unwrapEntity(entity);
    if (!isRecord(unwrapped)) {
      throw new Error('Current entity must be a JSON object.');
    }

    const candidate = {
      ...stripServerManagedFields(unwrapped),
      bookId,
    };

    const parsed = ENTITY_SCHEMAS[type].safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `Current ${type} entity validation failed: ${parsed.error.message}`,
      );
    }
    return parsed.data as GeneratedBibleEntity;
  }

  private async generateValidatedEntity(input: {
    prompt: string;
    promptContent: ChatMessageContent;
    type: BibleEntityType;
    bookId: string;
    task: TaskType;
  }): Promise<GeneratedBibleEntity> {
    let lastError: Error | null = null;
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? input.promptContent
          : `${input.prompt}\n\n上一次输出未通过校验：${lastError?.message ?? '未知错误'}\n请只返回修正后的完整 JSON 对象。`;

      const result = await this.router.generate({
        messages: [
          { role: 'system', content: BIBLE_SYSTEM },
          { role: 'user', content: prompt },
        ],
        maxTokens: 3072,
        temperature: 0.4,
      }, input.task);

      lastRaw = result.content;

      try {
        return this.parseEntityOutput(input.type, input.bookId, result.content);
      } catch (error) {
        lastError = asError(error);
      }
    }

    throw new Error(
      `BibleAgent output validation failed after retry: ${lastError?.message ?? 'unknown error'}\nRaw output:\n${lastRaw.slice(0, 500)}`,
    );
  }

  private parseEntityOutput(
    type: BibleEntityType,
    bookId: string,
    content: string,
  ): GeneratedBibleEntity {
    const json = extractJson(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${content.slice(0, 500)}`);
    }

    const unwrapped = unwrapEntity(parsed);
    if (!isRecord(unwrapped)) {
      throw new Error('LLM output must be a JSON object.');
    }

    const candidate = {
      ...stripServerManagedFields(unwrapped),
      bookId,
    };

    const validated = ENTITY_SCHEMAS[type].safeParse(candidate);
    if (!validated.success) {
      throw new Error(
        `${type} entity validation failed: ${validated.error.message}\nParsed:\n${JSON.stringify(candidate, null, 2).slice(0, 500)}`,
      );
    }

    return validated.data as GeneratedBibleEntity;
  }
}
