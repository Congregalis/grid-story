import type { ChatMessageContent, PromptRegistry } from '@grid-story/llm';

// -- Minimal entity types (duck-compatible with DB rows) --

export interface CharacterRow {
  id: string;
  name: string;
  aliases?: string[];
  gender?: string | null;
  age?: string | null;
  species?: string | null;
  appearance?: string | null;
  personality?: string | null;
  background?: string | null;
  motivation?: string | null;
  abilities?: string[];
  relationships?: { targetId: string; type: string; description: string }[];
  notes?: string | null;
}

export interface LocationRow {
  id: string;
  name: string;
  type: string;
  parentId?: string | null;
  description?: string | null;
  atmosphere?: string | null;
  significance?: string | null;
  notes?: string | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  leaderId?: string | null;
  memberIds?: string[];
  goals?: string | null;
  structure?: string | null;
  locationId?: string | null;
  notes?: string | null;
}

export interface ItemRow {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  ownerId?: string | null;
  origin?: string | null;
  abilities?: string[];
  significance?: string | null;
  notes?: string | null;
}

export interface TimelineEventRow {
  id: string;
  title: string;
  description?: string | null;
  timestamp?: string | null;
  order: number;
  relatedCharacterIds?: string[];
  relatedLocationIds?: string[];
  causeEventIds?: string[];
  effectEventIds?: string[];
  notes?: string | null;
}

export interface ConceptRow {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  rules?: string | null;
  examples?: string | null;
  notes?: string | null;
}

export interface BibleSlice {
  characters?: CharacterRow[];
  locations?: LocationRow[];
  organizations?: OrganizationRow[];
  items?: ItemRow[];
  timelineEvents?: TimelineEventRow[];
  concepts?: ConceptRow[];
}

export interface OutlineNode {
  id: string;
  type: string;
  title: string;
  summary?: string | null;
  order: number;
  children?: OutlineNode[];
}

export interface BookCharter {
  worldview: string | null;
  era: string | null;
  themes: string[];
  hook: string | null;
  pov: string | null;
  tone: string | null;
  rules: string[];
  avoid: string[];
}

export interface ComposeInput {
  agent: string;
  task: string;
  bookId?: string;
  charter?: Partial<BookCharter> | null;
  bible?: BibleSlice;
  outline?: OutlineNode[];
  vars?: Record<string, string>;
}

export interface ComposeOutput {
  prompt: string;
  charterBlock: string;
  promptContent: ChatMessageContent;
}

// -- Formatting helpers --

const IND = '  ';

function bullet(text: string, level = 1): string {
  return IND.repeat(level) + '- ' + text;
}

function kv(k: string, v: string, level = 1): string {
  return IND.repeat(level) + `${k}：${v}`;
}

function optionalKv(k: string, v: string | undefined | null, level = 1): string {
  if (!v) return '';
  return kv(k, v, level) + '\n';
}

function fmtArr(items?: string[]): string {
  if (!items || items.length === 0) return '';
  return items.join('、');
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createEmptyBookCharter(): BookCharter {
  return {
    worldview: null,
    era: null,
    themes: [],
    hook: null,
    pov: null,
    tone: null,
    rules: [],
    avoid: [],
  };
}

export function normalizeBookCharter(charter?: Partial<BookCharter> | null): BookCharter {
  if (!charter) return createEmptyBookCharter();
  return {
    worldview: cleanString(charter.worldview),
    era: cleanString(charter.era),
    themes: cleanStringArray(charter.themes),
    hook: cleanString(charter.hook),
    pov: cleanString(charter.pov),
    tone: cleanString(charter.tone),
    rules: cleanStringArray(charter.rules),
    avoid: cleanStringArray(charter.avoid),
  };
}

export function formatCharterBlock(charter?: Partial<BookCharter> | null): string {
  const normalized = normalizeBookCharter(charter);
  const lines: string[] = [];

  if (normalized.worldview) lines.push(`世界观：${normalized.worldview}`);
  if (normalized.era) lines.push(`时代：${normalized.era}`);
  if (normalized.themes.length > 0) lines.push(`核心思想：${normalized.themes.join('、')}`);
  if (normalized.hook) lines.push(`脑洞 / 高概念：${normalized.hook}`);
  if (normalized.pov) lines.push(`视角约束：${normalized.pov}`);
  if (normalized.tone) lines.push(`基调：${normalized.tone}`);
  if (normalized.rules.length > 0) lines.push(`用户硬规则：${normalized.rules.join('；')}`);
  if (normalized.avoid.length > 0) lines.push(`反约束（绝不出现）：${normalized.avoid.join('；')}`);

  if (lines.length === 0) return '';
  return ['# 作品核心（必须遵循）', ...lines, '---'].join('\n');
}

function buildPromptContent(prompt: string, charterBlock: string): ChatMessageContent {
  if (!charterBlock) return prompt;
  const rest = prompt.startsWith(charterBlock)
    ? prompt.slice(charterBlock.length).trimStart()
    : prompt;
  if (!rest) {
    return [{ type: 'text', text: charterBlock, cacheControl: 'ephemeral' }];
  }
  return [
    { type: 'text', text: charterBlock, cacheControl: 'ephemeral' },
    { type: 'text', text: rest },
  ];
}

// -- Entity formatters --

function formatCharacter(
  c: CharacterRow,
  nameMap: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`【角色】${c.name}`);

  const meta: string[] = [];
  if (c.gender) meta.push(c.gender);
  if (c.age) meta.push(`${c.age}岁`);
  if (c.species && c.species !== '人类') meta.push(c.species);
  if (meta.length > 0) lines.push(kv('属性', meta.join(' | ')));

  const aliasStr = fmtArr(c.aliases);
  if (aliasStr) lines.push(kv('别名', aliasStr));
  if (c.personality) lines.push(kv('性格', c.personality));
  if (c.appearance) lines.push(kv('外貌', c.appearance));
  if (c.background) lines.push(kv('背景', c.background));
  if (c.motivation) lines.push(kv('动机', c.motivation));

  const abilStr = fmtArr(c.abilities);
  if (abilStr) lines.push(kv('能力', abilStr));

  // Resolve relationship target IDs to names
  if (c.relationships && c.relationships.length > 0) {
    const relStrs = c.relationships.map((r) => {
      const targetName = nameMap.get(r.targetId) ?? r.targetId;
      return `${r.type}→${targetName}：${r.description}`;
    });
    lines.push(kv('关系', relStrs.join('；')));
  }

  if (c.notes) lines.push(kv('备注', c.notes));
  lines.push('');
  return lines.join('\n');
}

function formatLocation(l: LocationRow): string {
  const lines: string[] = [];
  lines.push(`【地点】${l.name}（${l.type}）`);
  if (l.parentId) lines.push(kv('上级地点ID', l.parentId));
  if (l.description) lines.push(kv('描述', l.description));
  if (l.atmosphere) lines.push(kv('氛围', l.atmosphere));
  if (l.significance) lines.push(kv('意义', l.significance));
  if (l.notes) lines.push(kv('备注', l.notes));
  lines.push('');
  return lines.join('\n');
}

function formatOrganization(o: OrganizationRow): string {
  const lines: string[] = [];
  lines.push(`【组织】${o.name}（${o.type}）`);
  if (o.description) lines.push(kv('描述', o.description));
  if (o.leaderId) lines.push(kv('领袖ID', o.leaderId));
  const memberStr = fmtArr(o.memberIds);
  if (memberStr) lines.push(kv('成员ID', memberStr));
  if (o.goals) lines.push(kv('目标', o.goals));
  if (o.structure) lines.push(kv('结构', o.structure));
  if (o.locationId) lines.push(kv('地点ID', o.locationId));
  if (o.notes) lines.push(kv('备注', o.notes));
  lines.push('');
  return lines.join('\n');
}

function formatItem(i: ItemRow): string {
  const lines: string[] = [];
  lines.push(`【物品】${i.name}（${i.type}）`);
  if (i.description) lines.push(kv('描述', i.description));
  if (i.ownerId) lines.push(kv('持有者ID', i.ownerId));
  if (i.origin) lines.push(kv('来源', i.origin));
  const abilityStr = fmtArr(i.abilities);
  if (abilityStr) lines.push(kv('能力', abilityStr));
  if (i.significance) lines.push(kv('意义', i.significance));
  if (i.notes) lines.push(kv('备注', i.notes));
  lines.push('');
  return lines.join('\n');
}

function formatTimelineEvent(e: TimelineEventRow): string {
  const lines: string[] = [];
  const ts = e.timestamp ? ` [${e.timestamp}]` : '';
  lines.push(`【事件 #${e.order}】${e.title}${ts}`);
  if (e.description) lines.push(kv('描述', e.description));
  const characterStr = fmtArr(e.relatedCharacterIds);
  if (characterStr) lines.push(kv('关联角色ID', characterStr));
  const locationStr = fmtArr(e.relatedLocationIds);
  if (locationStr) lines.push(kv('关联地点ID', locationStr));
  const causeStr = fmtArr(e.causeEventIds);
  if (causeStr) lines.push(kv('前因事件ID', causeStr));
  const effectStr = fmtArr(e.effectEventIds);
  if (effectStr) lines.push(kv('后果事件ID', effectStr));
  if (e.notes) lines.push(kv('备注', e.notes));
  lines.push('');
  return lines.join('\n');
}

function formatConcept(c: ConceptRow): string {
  const lines: string[] = [];
  lines.push(`【概念 · ${c.category}】${c.name}`);
  if (c.description) lines.push(kv('描述', c.description));
  if (c.rules) lines.push(kv('规则', c.rules));
  if (c.examples) lines.push(kv('示例', c.examples));
  if (c.notes) lines.push(kv('备注', c.notes));
  lines.push('');
  return lines.join('\n');
}

function formatOutlineNode(node: OutlineNode, depth = 0): string {
  const prefix = IND.repeat(depth);
  let line = `${prefix}- ${node.title}（${node.type}）`;
  if (node.summary) line += ` — ${node.summary}`;
  const lines = [line];
  if (node.children) {
    for (const child of node.children) {
      lines.push(formatOutlineNode(child, depth + 1));
    }
  }
  return lines.join('\n');
}

// -- Bible context aggregator --

export function formatBibleContext(bible: BibleSlice): string {
  const sections: string[] = [];

  const nameMap = new Map<string, string>();
  if (bible.characters) {
    for (const c of bible.characters) nameMap.set(c.id, c.name);
  }

  if (bible.characters && bible.characters.length > 0) {
    sections.push('## 角色设定');
    for (const c of bible.characters) {
      sections.push(formatCharacter(c, nameMap));
    }
  }

  if (bible.locations && bible.locations.length > 0) {
    sections.push('## 地点设定');
    for (const l of bible.locations) {
      sections.push(formatLocation(l));
    }
  }

  if (bible.organizations && bible.organizations.length > 0) {
    sections.push('## 组织设定');
    for (const o of bible.organizations) {
      sections.push(formatOrganization(o));
    }
  }

  if (bible.items && bible.items.length > 0) {
    sections.push('## 物品设定');
    for (const i of bible.items) {
      sections.push(formatItem(i));
    }
  }

  if (bible.timelineEvents && bible.timelineEvents.length > 0) {
    sections.push('## 时间线');
    const sorted = [...bible.timelineEvents].sort((a, b) => a.order - b.order);
    for (const e of sorted) {
      sections.push(formatTimelineEvent(e));
    }
  }

  if (bible.concepts && bible.concepts.length > 0) {
    sections.push('## 世界观概念');
    for (const c of bible.concepts) {
      sections.push(formatConcept(c));
    }
  }

  return sections.join('\n').trim();
}

export function formatOutlineContext(outline: OutlineNode[]): string {
  if (outline.length === 0) return '';
  return '## 大纲结构\n' + outline.map((n) => formatOutlineNode(n)).join('\n');
}

// -- ContextComposer --

export class ContextComposer {
  constructor(private prompts: PromptRegistry) {}

  compose(input: ComposeInput): ComposeOutput {
    const vars: Record<string, string> = { ...input.vars };
    const charterBlock = formatCharterBlock(input.charter);
    vars.charter_block = charterBlock;

    if (input.bible) {
      vars.bible_context = formatBibleContext(input.bible);
      if (input.bible.characters && input.bible.characters.length > 0) {
        const nameMap = new Map(input.bible.characters.map((c) => [c.id, c.name]));
        vars.character_context = input.bible.characters.map((c) => formatCharacter(c, nameMap)).join('\n').trim();
      }
    }

    if (input.outline && input.outline.length > 0) {
      vars.outline_context = formatOutlineContext(input.outline);
    }

    const prompt = this.prompts.render(input.agent, input.task, vars);
    return { prompt, charterBlock, promptContent: buildPromptContent(prompt, charterBlock) };
  }
}
