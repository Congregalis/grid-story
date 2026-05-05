import type { BibleSlice, BookCharter, ContextComposer, OutlineNode } from '@grid-story/composer';
import type { ChatMessageContent, ModelRouter, TaskType } from '@grid-story/llm';
import type { BibleEntityType, BibleSuggestionResult, StarterBibleDraft } from '@grid-story/schema';
import {
  BIBLE_ENTITIES,
  bibleSuggestionResultSchema,
  createCharacterInput,
  createConceptInput,
  createItemInput,
  createLocationInput,
  createOrganizationInput,
  createTimelineEventInput,
  starterBibleDraftSchema,
} from '@grid-story/schema';
import { z } from 'zod';

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

export const REFINE_FIELD_ACTIONS = [
  'generate',
  'expand',
  'shrink',
  'polish',
  'rephrase',
  'custom',
] as const;

export type RefineFieldAction = (typeof REFINE_FIELD_ACTIONS)[number];
export type RefinedFieldValue = string | string[];

interface RefineFieldConfig {
  label: string;
  kind: 'string' | 'string[]';
  role: string;
}

const REFINE_FIELD_ACTION_LABELS = {
  generate: '生成',
  expand: '扩写',
  shrink: '缩写',
  polish: '润色',
  rephrase: '换语气',
  custom: '按自定义要求修改',
} satisfies Record<RefineFieldAction, string>;

const REFINE_FIELD_CONFIG = {
  character: {
    name: { label: '姓名', kind: 'string', role: '角色在作品中的主要称呼，要求简洁、可辨识。' },
    aliases: {
      label: '别名 / 称谓',
      kind: 'string[]',
      role: '角色可被不同群体使用的称呼、绰号或身份名。',
    },
    age: { label: '年龄', kind: 'string', role: '角色年龄或年龄段，应服务人物处境和叙事质感。' },
    species: { label: '种族 / 族群', kind: 'string', role: '角色所属物种、族群或社会身份标签。' },
    appearance: {
      label: '外貌',
      kind: 'string',
      role: '角色可被画面识别的外观特征，不只写抽象美丑。',
    },
    personality: { label: '性格', kind: 'string', role: '角色稳定行为倾向、缺陷和内在矛盾。' },
    background: {
      label: '背景',
      kind: 'string',
      role: '角色过去经历，应能制造冲突或解释当下选择。',
    },
    motivation: { label: '动机', kind: 'string', role: '角色会采取行动的具体欲望、目标或压力。' },
    abilities: {
      label: '能力 / 技能',
      kind: 'string[]',
      role: '角色具备的能力、技能或资源，控制为可入库短语。',
    },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
  location: {
    name: { label: '名称', kind: 'string', role: '地点在作品中的主要名称，要求简洁、可辨识。' },
    type: { label: '类型', kind: 'string', role: '地点类别，如城市、遗迹、学院、舰站等。' },
    description: {
      label: '描述 / 历史',
      kind: 'string',
      role: '地点的核心信息、历史来历和可被剧情使用的特征。',
    },
    atmosphere: { label: '氛围', kind: 'string', role: '地点带给读者的感官气质和情绪色彩。' },
    significance: {
      label: '重要性',
      kind: 'string',
      role: '地点在长篇结构、人物关系或冲突中的叙事功能。',
    },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
  organization: {
    name: { label: '名称', kind: 'string', role: '组织在作品中的主要名称，要求简洁、可辨识。' },
    type: { label: '类型', kind: 'string', role: '组织类别，如官署、帮派、宗门、公司、秘社等。' },
    description: { label: '描述', kind: 'string', role: '组织的核心定位、对外形象和剧情用途。' },
    goals: { label: '目标', kind: 'string', role: '组织真正想达成的目的，应能推动冲突。' },
    structure: {
      label: '权力结构',
      kind: 'string',
      role: '组织内部层级、派系、权责关系和张力来源。',
    },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
  item: {
    name: { label: '名称', kind: 'string', role: '物品在作品中的主要名称，要求简洁、可辨识。' },
    type: { label: '类型', kind: 'string', role: '物品类别，如法器、信物、武器、文件等。' },
    origin: { label: '来源', kind: 'string', role: '物品来历，应能关联人物、地点、组织或历史。' },
    abilities: {
      label: '能力',
      kind: 'string[]',
      role: '物品具备的功能、限制或用途，控制为可入库短语。',
    },
    description: { label: '描述', kind: 'string', role: '物品外观、状态和可被剧情使用的特征。' },
    significance: {
      label: '重要性 / 隐喻',
      kind: 'string',
      role: '物品在冲突、主题或人物命运中的象征意义。',
    },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
  timelineEvent: {
    title: { label: '事件标题', kind: 'string', role: '时间线事件标题，要求短、明确、可排序。' },
    timestamp: {
      label: '时间点',
      kind: 'string',
      role: '事件发生的时间描述，可为章节、年代或相对时间。',
    },
    description: {
      label: '描述 / 因果',
      kind: 'string',
      role: '事件发生了什么，以及它如何造成后续影响。',
    },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
  concept: {
    name: { label: '名称', kind: 'string', role: '概念在作品中的主要名称，要求简洁、可辨识。' },
    category: {
      label: '分类',
      kind: 'string',
      role: '概念类别，如魔法体系、社会制度、技术规则等。',
    },
    description: {
      label: '描述',
      kind: 'string',
      role: '概念的核心定义和读者需要理解的基本信息。',
    },
    rules: {
      label: '规则 / 边界',
      kind: 'string',
      role: '概念能做什么、不能做什么，以及使用代价或边界。',
    },
    examples: { label: '例子', kind: 'string', role: '概念在故事中的具体使用样例。' },
    notes: {
      label: '备注 / 自由字段',
      kind: 'string',
      role: '无法归入强字段但对创作有价值的补充信息。',
    },
  },
} satisfies Record<BibleEntityType, Record<string, RefineFieldConfig>>;

export type GeneratedBibleEntity = z.infer<(typeof ENTITY_SCHEMAS)[BibleEntityType]>;
export type GeneratedStarterBible = StarterBibleDraft;

export interface BibleAgentContext {
  bookId: string;
  bible: BibleSlice;
  outline: OutlineNode[];
  charter: BookCharter;
}

export interface StarterBibleOptions {
  targetCount?: number;
}

export interface SuggestChapterSettingsInput {
  chapterTitle?: string;
  chapterContent: string;
}

export interface RefineFieldInput {
  type: BibleEntityType;
  current: unknown;
  targetField: string;
  action: RefineFieldAction;
  hint?: string;
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

function unwrapStarterBible(value: unknown): unknown {
  if (isRecord(value) && isRecord(value.starterBible)) return value.starterBible;
  if (isRecord(value) && isRecord(value.starter_bible)) return value.starter_bible;
  if (isRecord(value) && isRecord(value.bible)) return value.bible;
  return value;
}

function normalizeStarterBibleKeys(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const copy = { ...value };
  if (!('timeline_events' in copy) && Array.isArray(copy.timelineEvents)) {
    copy.timeline_events = copy.timelineEvents;
  }
  delete copy.timelineEvents;
  return copy;
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

function getRefineFieldConfig(type: BibleEntityType, targetField: string): RefineFieldConfig {
  const fields = REFINE_FIELD_CONFIG[type] as Record<string, RefineFieldConfig>;
  const field = fields[targetField];
  if (!field) {
    throw new Error(`Field "${targetField}" does not support AI refinement for ${type}.`);
  }
  return field;
}

function parseRefinedFieldValue(value: unknown, field: RefineFieldConfig): RefinedFieldValue {
  const schema = field.kind === 'string[]' ? z.array(z.string()) : z.string();
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Refined field value must be ${field.kind}: ${parsed.error.message}`);
  }
  return parsed.data;
}

function normalizePartialEntity(entity: unknown, bookId: string): Record<string, unknown> {
  const unwrapped = unwrapEntity(entity);
  if (!isRecord(unwrapped)) {
    throw new Error('Current entity must be a JSON object.');
  }
  return {
    ...stripServerManagedFields(unwrapped),
    bookId,
  };
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSuggestionPayload(
  entityType: BibleEntityType,
  payload: unknown,
  bookId: string,
): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error(`Suggestion payload for ${entityType} must be a JSON object.`);
  }
  return {
    ...stripServerManagedFields(payload),
    bookId,
  };
}

function suggestionTitle(entityType: BibleEntityType, payload: Record<string, unknown>): string {
  if (entityType === 'timelineEvent') return stringOrFallback(payload.title, '新时间线事件');
  return stringOrFallback(payload.name, `新${ENTITY_LABELS[entityType]}`);
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

  async generateStarterBible(
    ctx: BibleAgentContext,
    options: StarterBibleOptions = {},
  ): Promise<GeneratedStarterBible> {
    const targetCount = options.targetCount ?? 10;
    const composed = this.composer.compose({
      agent: 'bible-agent',
      task: 'generate-starter',
      bookId: ctx.bookId,
      charter: ctx.charter,
      bible: ctx.bible,
      outline: ctx.outline,
      vars: {
        book_id: ctx.bookId,
        target_count: String(targetCount),
        bible_context: '',
        outline_context: '',
      },
    });

    return this.generateValidatedStarterBible({
      prompt: composed.prompt,
      promptContent: composed.promptContent,
      targetCount,
    });
  }

  async suggestChapterSettings(
    input: SuggestChapterSettingsInput,
    ctx: BibleAgentContext,
  ): Promise<BibleSuggestionResult> {
    const composed = this.composer.compose({
      agent: 'bible-agent',
      task: 'suggest-from-chapter',
      bookId: ctx.bookId,
      charter: ctx.charter,
      bible: ctx.bible,
      outline: ctx.outline,
      vars: {
        book_id: ctx.bookId,
        chapter_title: input.chapterTitle?.trim() || '（未命名章节）',
        chapter_content: input.chapterContent,
        bible_context: '',
        outline_context: '',
      },
    });

    return this.generateValidatedSuggestions({
      prompt: composed.prompt,
      promptContent: composed.promptContent,
      bookId: ctx.bookId,
    });
  }

  async refineField(input: RefineFieldInput, ctx: BibleAgentContext): Promise<RefinedFieldValue> {
    const field = getRefineFieldConfig(input.type, input.targetField);
    const currentEntity = normalizePartialEntity(input.current, ctx.bookId);
    const hint = input.hint?.trim() ?? '';
    const composed = this.composer.compose({
      agent: 'bible-agent',
      task: 'refine-field',
      bookId: ctx.bookId,
      charter: ctx.charter,
      bible: ctx.bible,
      outline: ctx.outline,
      vars: {
        book_id: ctx.bookId,
        entity_type: input.type,
        entity_label: ENTITY_LABELS[input.type],
        entity_schema: ENTITY_SCHEMA_HINTS[input.type].join('\n'),
        current_entity: JSON.stringify(currentEntity, null, 2),
        target_field: input.targetField,
        field_label: field.label,
        field_role: field.role,
        field_value_type: field.kind,
        current_field_value: JSON.stringify(currentEntity[input.targetField] ?? null, null, 2),
        action: input.action,
        action_label: REFINE_FIELD_ACTION_LABELS[input.action],
        hint_block: hint ? `## 自定义要求\n${hint}` : '## 自定义要求\n（无）',
        bible_context: '',
        outline_context: '',
      },
    });

    return this.generateValidatedField({
      prompt: composed.prompt,
      promptContent: composed.promptContent,
      field,
      task: input.action === 'generate' ? 'draft' : 'rewrite',
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
      throw new Error(`Current ${type} entity validation failed: ${parsed.error.message}`);
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

      const result = await this.router.generate(
        {
          messages: [
            { role: 'system', content: BIBLE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 3072,
          temperature: 0.4,
        },
        input.task,
      );

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

  private async generateValidatedStarterBible(input: {
    prompt: string;
    promptContent: ChatMessageContent;
    targetCount: number;
  }): Promise<GeneratedStarterBible> {
    let lastError: Error | null = null;
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? input.promptContent
          : `${input.prompt}\n\n上一次输出未通过校验：${lastError?.message ?? '未知错误'}\n请只返回修正后的完整 JSON 对象，至少包含 ${input.targetCount} 张草案卡片。`;

      const result = await this.router.generate(
        {
          messages: [
            { role: 'system', content: BIBLE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 4096,
          temperature: 0.5,
        },
        'draft',
      );

      lastRaw = result.content;

      try {
        return this.parseStarterBibleOutput(result.content);
      } catch (error) {
        lastError = asError(error);
      }
    }

    throw new Error(
      `BibleAgent starter output validation failed after retry: ${lastError?.message ?? 'unknown error'}\nRaw output:\n${lastRaw.slice(0, 500)}`,
    );
  }

  private async generateValidatedSuggestions(input: {
    prompt: string;
    promptContent: ChatMessageContent;
    bookId: string;
  }): Promise<BibleSuggestionResult> {
    let lastError: Error | null = null;
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? input.promptContent
          : `${input.prompt}\n\n上一次输出未通过校验：${lastError?.message ?? '未知错误'}\n请只返回修正后的 JSON 对象，格式必须是 {"suggestions": [...]}。`;

      const result = await this.router.generate(
        {
          messages: [
            { role: 'system', content: BIBLE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 4096,
          temperature: 0.2,
        },
        'classification',
      );

      lastRaw = result.content;

      try {
        return this.parseSuggestionOutput(result.content, input.bookId);
      } catch (error) {
        lastError = asError(error);
      }
    }

    throw new Error(
      `BibleAgent suggestion output validation failed after retry: ${lastError?.message ?? 'unknown error'}\nRaw output:\n${lastRaw.slice(0, 500)}`,
    );
  }

  private async generateValidatedField(input: {
    prompt: string;
    promptContent: ChatMessageContent;
    field: RefineFieldConfig;
    task: TaskType;
  }): Promise<RefinedFieldValue> {
    let lastError: Error | null = null;
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        attempt === 0
          ? input.promptContent
          : `${input.prompt}\n\n上一次输出未通过校验：${lastError?.message ?? '未知错误'}\n请只返回修正后的 JSON 对象，格式必须是 {"value": ...}。`;

      const result = await this.router.generate(
        {
          messages: [
            { role: 'system', content: BIBLE_SYSTEM },
            { role: 'user', content: prompt },
          ],
          maxTokens: 1024,
          temperature: 0.35,
        },
        input.task,
      );

      lastRaw = result.content;

      try {
        return this.parseFieldOutput(result.content, input.field);
      } catch (error) {
        lastError = asError(error);
      }
    }

    throw new Error(
      `BibleAgent field output validation failed after retry: ${lastError?.message ?? 'unknown error'}\nRaw output:\n${lastRaw.slice(0, 500)}`,
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

  private parseFieldOutput(content: string, field: RefineFieldConfig): RefinedFieldValue {
    const json = extractJson(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${content.slice(0, 500)}`);
    }

    if (!isRecord(parsed) || !('value' in parsed)) {
      throw new Error('LLM output must be a JSON object with a value field.');
    }

    return parseRefinedFieldValue(parsed.value, field);
  }

  private parseStarterBibleOutput(content: string): GeneratedStarterBible {
    const json = extractJson(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${content.slice(0, 500)}`);
    }

    const candidate = normalizeStarterBibleKeys(unwrapStarterBible(parsed));
    const validated = starterBibleDraftSchema.safeParse(candidate);
    if (!validated.success) {
      throw new Error(
        `Starter Bible validation failed: ${validated.error.message}\nParsed:\n${JSON.stringify(candidate, null, 2).slice(0, 500)}`,
      );
    }

    return validated.data;
  }

  private parseSuggestionOutput(content: string, bookId: string): BibleSuggestionResult {
    const json = extractJson(content);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error(`Failed to parse LLM output as JSON. Raw output:\n${content.slice(0, 500)}`);
    }

    const rawSuggestions = isRecord(parsed) ? parsed.suggestions : undefined;
    if (!Array.isArray(rawSuggestions)) {
      throw new Error('LLM output must be a JSON object with a suggestions array.');
    }

    const suggestions = rawSuggestions.map((raw, index) => {
      if (!isRecord(raw)) throw new Error(`Suggestion ${index + 1} must be a JSON object.`);
      const entityTypeResult = z.enum(BIBLE_ENTITIES).safeParse(raw.entityType);
      if (!entityTypeResult.success) {
        throw new Error(`Suggestion ${index + 1} has invalid entityType.`);
      }
      const entityType = entityTypeResult.data;
      const payload = normalizeSuggestionPayload(entityType, raw.payload, bookId);
      return {
        id: stringOrFallback(raw.id, `${entityType}-${index + 1}`),
        entityType,
        title: stringOrFallback(raw.title, suggestionTitle(entityType, payload)),
        evidence: stringOrFallback(raw.evidence, '正文出现了新设定，需要作者确认是否入库。'),
        reason: stringOrFallback(raw.reason, '该设定可能影响后续章节承接。'),
        confidence:
          raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
            ? raw.confidence
            : 'medium',
        payload,
      };
    });

    const validated = bibleSuggestionResultSchema.safeParse({ suggestions });
    if (!validated.success) {
      throw new Error(
        `Bible suggestion validation failed: ${validated.error.message}\nParsed:\n${JSON.stringify({ suggestions }, null, 2).slice(0, 500)}`,
      );
    }
    return validated.data;
  }
}
