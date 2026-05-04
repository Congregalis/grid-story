import crypto from 'node:crypto';
import { formatWikiContextBlock } from '@grid-story/composer';
import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import {
  type ContextBlocks,
  type ContextPage,
  contextBlocksSchema,
  queryCategorySelectionSchema,
  queryPageSelectionSchema,
  type SelectedWikiPage,
  type WikiDivergence,
  type WikiQueryCategory,
  type WikiQueryContext,
  type WikiQueryResult,
  wikiQueryContextSchema,
} from '@grid-story/schema';
import matter from 'gray-matter';
import { normalizeWikiPath } from './path';
import type { ProseSampler } from './prose-sampler';
import type { WikiStore } from './wiki-store';

interface MemoryWikiModelRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

interface MemoryWikiPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface QueryNavigatorOptions {
  wikiStoreFactory: (bookId: string) => WikiStore;
  proseSampler: ProseSampler;
  router: MemoryWikiModelRouter;
  prompts: MemoryWikiPromptRegistry;
  now?: () => Date;
}

export interface WikiQueryInput {
  bookId: string;
  context: unknown;
}

export interface ResolveDivergenceInput {
  bookId: string;
  id: string;
  decision: string;
  note?: string;
}

interface SelectedPageWithContent extends SelectedWikiPage {
  title?: string;
  pageType?: string;
  content: string;
}

interface ParsedDivergence extends WikiDivergence {
  status?: string;
  block: string;
  start: number;
  end: number;
}

const CATEGORY_INDEX_PATHS: Record<Exclude<WikiQueryCategory, 'tracking'>, string> = {
  characters: 'index/characters.md',
  locations: 'index/locations.md',
  organizations: 'index/organizations.md',
  items: 'index/items.md',
  concepts: 'index/concepts.md',
  chapters: 'index/chapters.md',
};

const TRACKING_PATHS = [
  'tracking/timeline.md',
  'tracking/foreshadowing.md',
  'tracking/loose-threads.md',
  'tracking/divergences-pending.md',
];

const PAGE_CHAR_LIMIT = 3_500;
const DIVERGENCE_FIELD = {
  page: '页面',
  type: '类型',
  oldObservation: '旧观察',
  newObservation: '新观察',
  wikiObservation: 'Wiki 观察',
  extractedEvidence: '抽取证据',
  evidence: '证据',
  suggestion: '建议',
  suggestedAction: '建议处理',
  status: '状态',
} as const;

export class QueryNavigator {
  private readonly now: () => Date;

  constructor(private options: QueryNavigatorOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async query(input: WikiQueryInput): Promise<WikiQueryResult> {
    const context = wikiQueryContextSchema.parse(input.context);
    const wikiStore = this.options.wikiStoreFactory(input.bookId);
    await wikiStore.ensureBase();

    const selected = await this.determineRelevantPages(input.bookId, context);
    const pages = await this.readSelectedPages(wikiStore, selected.pages, context);
    const divergences = await this.detectDivergences(input.bookId, selected.pages, context);
    const blocks = await this.assembleContext(input.bookId, context, pages, divergences);
    const assembledContext = formatWikiContextBlock(blocks);

    return {
      ok: true,
      selected_categories: selected.categories,
      selected_pages: selected.pages,
      blocks,
      assembled_context: assembledContext,
      warnings: selected.warnings,
    };
  }

  async determineRelevantPages(
    bookId: string,
    context: WikiQueryContext,
  ): Promise<{
    categories: WikiQueryCategory[];
    pages: SelectedWikiPage[];
    warnings: string[];
  }> {
    const wikiStore = this.options.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();
    const warnings: string[] = [];

    const rootIndex = await wikiStore.read('index/_root.md').catch(() => '');
    const fallbackCategories = deterministicCategories(context, rootIndex);
    const categories = await this.selectCategories(rootIndex, context).catch((error) => {
      warnings.push(`category-selection-fallback: ${errorMessage(error)}`);
      return fallbackCategories;
    });
    const categorySet = new Set<WikiQueryCategory>([...fallbackCategories, ...categories]);
    const categoryList = [...categorySet].slice(0, 7);

    const categoryIndices = await readCategoryIndices(wikiStore, categoryList);
    const fallbackPages = await deterministicPages(wikiStore, context, categoryList);
    const selectedPages = await this.selectPages(categoryIndices, context, categoryList).catch(
      (error) => {
        warnings.push(`page-selection-fallback: ${errorMessage(error)}`);
        return fallbackPages;
      },
    );

    const maxPages = context.maxPages ?? 15;
    const resolved = await resolveSelectedPages(wikiStore, [...fallbackPages, ...selectedPages]);

    return {
      categories: categoryList,
      pages: uniquePages(resolved).slice(0, maxPages),
      warnings,
    };
  }

  async detectDivergences(
    bookId: string,
    selectedPages: SelectedWikiPage[],
    context?: WikiQueryContext,
  ): Promise<WikiDivergence[]> {
    const all = await this.listDivergences(bookId);
    if (!context) return all;

    const paths = new Set(selectedPages.map((page) => page.path));
    const terms = queryTerms(context);
    return all.filter((divergence) => {
      if (paths.has(divergence.page_path)) return true;
      const haystack = [
        divergence.page_path,
        divergence.old_observation,
        divergence.new_observation,
        divergence.bible_value,
        divergence.evidence,
        divergence.suggestion,
      ]
        .filter(Boolean)
        .join('\n');
      return terms.some((term) => haystack.includes(term));
    });
  }

  async listDivergences(bookId: string): Promise<WikiDivergence[]> {
    const wikiStore = this.options.wikiStoreFactory(bookId);
    await wikiStore.ensureBase();
    const content = await wikiStore.read('tracking/divergences-pending.md').catch(() => '');
    return parseDivergences(content)
      .filter((entry) => entry.status !== 'resolved')
      .map(({ block: _block, start: _start, end: _end, status: _status, ...entry }) => entry);
  }

  async resolveDivergence(input: ResolveDivergenceInput): Promise<WikiDivergence> {
    const wikiStore = this.options.wikiStoreFactory(input.bookId);
    await wikiStore.ensureBase();
    const path = 'tracking/divergences-pending.md';
    const content = await wikiStore.read(path);
    const entries = parseDivergences(content);
    const target = entries.find((entry) => entry.id === input.id);
    if (!target) {
      throw new Error(`Divergence not found: ${input.id}`);
    }

    const resolvedBlock = [
      target.block.trimEnd(),
      '- **状态**：resolved',
      `- **处理决定**：${input.decision}`,
      input.note ? `- **处理备注**：${input.note}` : null,
      `- **处理时间**：${this.now().toISOString()}`,
      '',
    ]
      .filter(Boolean)
      .join('\n');

    const updated = `${content.slice(0, target.start)}${resolvedBlock}${content.slice(target.end)}`;
    await wikiStore.write(path, updated);

    const { block: _block, start: _start, end: _end, status: _status, ...resolved } = target;
    return resolved;
  }

  private async selectCategories(
    rootIndex: string,
    context: WikiQueryContext,
  ): Promise<WikiQueryCategory[]> {
    const prompt = this.options.prompts.render('memory-wiki', 'query-select-categories', {
      root_index: rootIndex,
      query_context_json: JSON.stringify(context, null, 2),
    });

    const result = await this.options.router.generate(
      {
        messages: [
          { role: 'system', content: '你是 MemoryWiki 查询导航器。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 1024,
        temperature: 0,
      },
      'classification',
    );
    return queryCategorySelectionSchema.parse(JSON.parse(extractJson(result.content))).categories;
  }

  private async selectPages(
    categoryIndices: Record<string, string>,
    context: WikiQueryContext,
    categories: WikiQueryCategory[],
  ): Promise<SelectedWikiPage[]> {
    const prompt = this.options.prompts.render('memory-wiki', 'query-select-pages', {
      selected_categories: categories.join(', '),
      category_indices: JSON.stringify(categoryIndices, null, 2),
      query_context_json: JSON.stringify(context, null, 2),
    });

    const result = await this.options.router.generate(
      {
        messages: [
          { role: 'system', content: '你是 MemoryWiki 查询导航器。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 2048,
        temperature: 0,
      },
      'classification',
    );
    return queryPageSelectionSchema.parse(JSON.parse(extractJson(result.content))).pages;
  }

  private async readSelectedPages(
    wikiStore: WikiStore,
    selectedPages: SelectedWikiPage[],
    context: WikiQueryContext,
  ): Promise<SelectedPageWithContent[]> {
    const charBudget = Math.max(4_000, (context.tokenBudget ?? 8_000) * 3);
    const pages: SelectedPageWithContent[] = [];
    let usedChars = 0;

    for (const selected of selectedPages) {
      const raw = await wikiStore.read(selected.path).catch(() => null);
      if (!raw) continue;
      const parsed = matter(raw);
      const title = stringValue(parsed.data.title);
      const pageType = stringValue(parsed.data.page_type);
      const content = truncate(parsed.content.trim(), PAGE_CHAR_LIMIT);
      if (!content) continue;

      const nextCost = content.length;
      if (usedChars + nextCost > charBudget && pages.length > 0) continue;
      usedChars += nextCost;
      pages.push({ ...selected, title, pageType, content });
    }

    return pages;
  }

  private async assembleContext(
    bookId: string,
    context: WikiQueryContext,
    pages: SelectedPageWithContent[],
    divergences: WikiDivergence[],
  ): Promise<ContextBlocks> {
    const wiki = {
      characters: [] as ContextPage[],
      locations: [] as ContextPage[],
      organizations: [] as ContextPage[],
      items: [] as ContextPage[],
      concepts: [] as ContextPage[],
      recent_summaries: [] as ContextPage[],
      global_state: null as ContextPage | null,
      loose_threads: [] as ContextPage[],
    };

    for (const page of pages) {
      const contextPage = {
        path: page.path,
        title: page.title,
        content: page.content,
      };
      if (page.pageType === 'character' || page.path.includes('/characters/')) {
        wiki.characters.push(contextPage);
      } else if (page.pageType === 'location' || page.path.includes('/locations/')) {
        wiki.locations.push(contextPage);
      } else if (page.pageType === 'organization' || page.path.includes('/organizations/')) {
        wiki.organizations.push(contextPage);
      } else if (page.pageType === 'item' || page.path.includes('/items/')) {
        wiki.items.push(contextPage);
      } else if (page.pageType === 'concept' || page.path.startsWith('concepts/')) {
        wiki.concepts.push(contextPage);
      } else if (page.pageType === 'global-state') {
        wiki.global_state = contextPage;
      } else if (
        page.pageType === 'chapter-summary' ||
        page.pageType === 'volume-summary' ||
        page.path.startsWith('chapters/')
      ) {
        wiki.recent_summaries.push(contextPage);
      } else if (page.path.startsWith('tracking/')) {
        wiki.loose_threads.push(contextPage);
      }
    }

    const proseCharacters = [
      ...(context.characters ?? []),
      ...wiki.characters.map((page) => page.title ?? page.path),
    ];
    const prose = await this.options.proseSampler.sample(bookId, {
      characters: uniqueStrings(proseCharacters),
      recentChapters: context.recentChapters ?? 3,
      keyScenes: uniqueStrings([
        ...(context.keyScenes ?? []).map(String),
        ...extractChapterRefs(pages.map((page) => page.content).join('\n')),
      ]),
      maxSamples: context.maxSamples ?? 8,
      maxCharsPerSample: context.maxCharsPerSample ?? 1200,
    });

    return contextBlocksSchema.parse({ wiki, prose, divergences });
  }
}

async function readCategoryIndices(
  wikiStore: WikiStore,
  categories: WikiQueryCategory[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const category of categories) {
    if (category === 'tracking') {
      const pages = await Promise.all(
        TRACKING_PATHS.map(async (page) => {
          const content = await wikiStore.read(page).catch(() => '');
          return `## ${page}\n${content}`;
        }),
      );
      result[category] = pages.join('\n\n');
      continue;
    }
    result[category] = await wikiStore.read(CATEGORY_INDEX_PATHS[category]).catch(() => '');
  }
  return result;
}

async function deterministicPages(
  wikiStore: WikiStore,
  context: WikiQueryContext,
  categories: WikiQueryCategory[],
): Promise<SelectedWikiPage[]> {
  const candidates: SelectedWikiPage[] = [];
  const add = (path: string, category?: WikiQueryCategory, reason?: string) => {
    candidates.push({ path, category, reason });
  };

  add('chapters/global.md', 'chapters', '全书状态是写作前基础上下文');
  add('tracking/loose-threads.md', 'tracking', '遗留线索影响后续章节承接');
  add('tracking/foreshadowing.md', 'tracking', '伏笔追踪影响后续章节承接');

  for (const term of [...(context.characters ?? []), ...(context.locations ?? [])]) {
    try {
      add(await wikiStore.resolveLink(term), undefined, `上下文显式提到：${term}`);
    } catch {}
  }
  for (const term of context.concepts ?? []) {
    try {
      add(await wikiStore.resolveLink(term), 'concepts', `上下文显式提到：${term}`);
    } catch {}
  }

  if (context.chapter_number) {
    for (let offset = 1; offset <= (context.recentChapters ?? 3); offset++) {
      const chapterNumber = context.chapter_number - offset;
      if (chapterNumber > 0) add(`chapters/ch-${chapterNumber}.md`, 'chapters', '近期章节摘要');
    }
  }

  for (const category of categories) {
    if (category === 'tracking') continue;
    const index = await wikiStore.read(CATEGORY_INDEX_PATHS[category]).catch(() => '');
    for (const link of extractWikiLinks(index)) {
      if (isLikelyRelevant(link, context)) add(link, category, '索引条目匹配查询文本');
    }
  }

  return candidates;
}

async function resolveSelectedPages(
  wikiStore: WikiStore,
  pages: SelectedWikiPage[],
): Promise<SelectedWikiPage[]> {
  const resolved: SelectedWikiPage[] = [];
  for (const page of pages) {
    try {
      resolved.push({ ...page, path: await wikiStore.resolveLink(page.path) });
    } catch {
      const normalized = normalizeWikiPath(page.path);
      try {
        await wikiStore.read(normalized);
        resolved.push({ ...page, path: normalized });
      } catch {}
    }
  }
  return resolved;
}

function deterministicCategories(
  context: WikiQueryContext,
  rootIndex: string,
): WikiQueryCategory[] {
  const categories = new Set<WikiQueryCategory>(['chapters', 'tracking']);
  const text = queryText(context);
  if ((context.characters ?? []).length > 0 || /角色|人物|对话|声音/.test(text)) {
    categories.add('characters');
  }
  if ((context.locations ?? []).length > 0 || /地点|场景|空间|城市|房间/.test(text)) {
    categories.add('locations');
  }
  if (/组织|势力|帮派|公司|部门/.test(text)) categories.add('organizations');
  if (/物品|道具|武器|钥匙|信物/.test(text)) categories.add('items');
  if ((context.concepts ?? []).length > 0 || /概念|规则|主题|世界观|魔法/.test(text)) {
    categories.add('concepts');
  }
  if (categories.size <= 2 && rootIndex.includes('[[index/characters]]')) {
    categories.add('characters');
  }
  return [...categories];
}

function parseDivergences(content: string): ParsedDivergence[] {
  const matches = [...content.matchAll(/^###\s+(.+)$/gm)];
  const entries: ParsedDivergence[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const next = matches[i + 1];
    const start = match.index ?? 0;
    const end = next?.index ?? content.length;
    const block = content.slice(start, end);
    const fields = parseBulletFields(block);
    const pagePath = fields[DIVERGENCE_FIELD.page] ?? match[1].trim();
    const id = fields.ID ?? stableDivergenceId(block);
    const kind = normalizeDivergenceKind(fields[DIVERGENCE_FIELD.type]);
    const newObservation =
      fields[DIVERGENCE_FIELD.newObservation] ??
      fields[DIVERGENCE_FIELD.wikiObservation] ??
      fields[DIVERGENCE_FIELD.extractedEvidence] ??
      block;

    entries.push({
      id,
      page_path: pagePath,
      kind,
      old_observation: fields[DIVERGENCE_FIELD.oldObservation],
      new_observation: newObservation,
      bible_value: fields.Bible,
      evidence: fields[DIVERGENCE_FIELD.extractedEvidence] ?? fields[DIVERGENCE_FIELD.evidence],
      suggestion: fields[DIVERGENCE_FIELD.suggestedAction] ?? fields[DIVERGENCE_FIELD.suggestion],
      status: fields[DIVERGENCE_FIELD.status],
      block,
      start,
      end,
    });
  }

  return entries;
}

function parseBulletFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const match = line.match(/^-\s+\*\*(.+?)\*\*[:：]\s*(.+)$/);
    if (match) fields[match[1].trim()] = match[2].trim();
  }
  return fields;
}

function normalizeDivergenceKind(value: string | undefined): WikiDivergence['kind'] {
  if (value === 'bible_conflict' || value === 'wiki_conflict' || value === 'new_observation') {
    return value;
  }
  return 'wiki_conflict';
}

function queryText(context: WikiQueryContext): string {
  return [
    context.task,
    context.chapter_title,
    context.scene_brief,
    context.direction,
    context.selected_text,
    context.chapter_content,
    ...(context.characters ?? []),
    ...(context.locations ?? []),
    ...(context.concepts ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function queryTerms(context: WikiQueryContext): string[] {
  return uniqueStrings(
    [
      ...(context.characters ?? []),
      ...(context.locations ?? []),
      ...(context.concepts ?? []),
      ...queryText(context).split(/[^\p{Letter}\p{Number}_-]+/u),
    ].filter((term) => term.length >= 2),
  ).slice(0, 40);
}

function isLikelyRelevant(link: string, context: WikiQueryContext): boolean {
  const text = queryText(context);
  const slug = link.split('/').pop()?.replace(/\.md$/, '') ?? link;
  return text.includes(slug) || queryTerms(context).some((term) => link.includes(term));
}

function extractWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
}

function extractChapterRefs(content: string): string[] {
  return uniqueStrings([...content.matchAll(/\[ch-(\d+)/g)].map((match) => `ch-${match[1]}`));
}

function uniquePages(pages: SelectedWikiPage[]): SelectedWikiPage[] {
  const seen = new Set<string>();
  const result: SelectedWikiPage[] = [];
  for (const page of pages) {
    if (seen.has(page.path)) continue;
    seen.add(page.path);
    result.push(page);
  }
  return result;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n\n（已截断）`;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function stableDivergenceId(value: string): string {
  return `div-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
