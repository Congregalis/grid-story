import type { PromptRegistry } from '@grid-story/llm';

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
  description?: string | null;
  atmosphere?: string | null;
  significance?: string | null;
  notes?: string | null;
}

export interface TimelineEventRow {
  id: string;
  title: string;
  description?: string | null;
  timestamp?: string | null;
  order: number;
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

export interface ComposeInput {
  agent: string;
  task: string;
  bible?: BibleSlice;
  outline?: OutlineNode[];
  vars?: Record<string, string>;
}

export interface ComposeOutput {
  prompt: string;
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
  if (l.description) lines.push(kv('描述', l.description));
  if (l.atmosphere) lines.push(kv('氛围', l.atmosphere));
  if (l.significance) lines.push(kv('意义', l.significance));
  if (l.notes) lines.push(kv('备注', l.notes));
  lines.push('');
  return lines.join('\n');
}

function formatTimelineEvent(e: TimelineEventRow): string {
  const lines: string[] = [];
  const ts = e.timestamp ? ` [${e.timestamp}]` : '';
  lines.push(`【事件 #${e.order}】${e.title}${ts}`);
  if (e.description) lines.push(kv('描述', e.description));
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
    return { prompt };
  }
}
