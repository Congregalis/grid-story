import fs from 'node:fs/promises';
import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import {
  type ExtractedInfo,
  extractedInfoSchema,
  mergeResultSchema,
  type WikiDivergence,
  type WikiEntityUpdate,
} from '@grid-story/schema';
import matter from 'gray-matter';
import type { ChapterForIngest, ChapterStore } from './chapter-store';
import type { MemoryWikiBibleEntityEvent, MemoryWikiBibleEntityType } from './events';
import { normalizeWikiPath } from './path';
import type { WikiSchema } from './wiki-schema';
import type { WikiHistoryEntry, WikiStore } from './wiki-store';

interface MemoryWikiModelRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

interface MemoryWikiPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface IngestPipelineOptions {
  wikiStoreFactory: (bookId: string) => WikiStore;
  wikiSchema: WikiSchema;
  router: MemoryWikiModelRouter;
  prompts: MemoryWikiPromptRegistry;
  chapterStore: ChapterStore;
  now?: () => Date;
}

export interface RunIngestInput {
  bookId: string;
  chapterId: string;
  runId?: string;
}

export interface RunIngestResult {
  ok: true;
  runId: string;
  chapterId: string;
  chapterNumber: number;
  updatedPages: string[];
  divergencesCount: number;
  history: WikiHistoryEntry;
}

interface EntityUpdateJob {
  pageType: MemoryWikiBibleEntityType;
  pagePath: string;
  update: WikiEntityUpdate;
}

const ENTITY_CONFIG: Record<
  MemoryWikiBibleEntityType,
  { dir: string; pageType: string; index: string; title: string }
> = {
  characters: {
    dir: 'entities/characters',
    pageType: 'character',
    index: 'characters',
    title: '角色索引',
  },
  locations: {
    dir: 'entities/locations',
    pageType: 'location',
    index: 'locations',
    title: '地点索引',
  },
  organizations: {
    dir: 'entities/organizations',
    pageType: 'organization',
    index: 'organizations',
    title: '组织索引',
  },
  items: { dir: 'entities/items', pageType: 'item', index: 'items', title: '物品索引' },
  concepts: { dir: 'concepts', pageType: 'concept', index: 'concepts', title: '概念索引' },
};

export class IngestPipeline {
  private readonly now: () => Date;

  constructor(private options: IngestPipelineOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async run(input: RunIngestInput): Promise<RunIngestResult> {
    const wikiStore = this.options.wikiStoreFactory(input.bookId);
    const chapter = await this.options.chapterStore.getChapterForIngest(
      input.bookId,
      input.chapterId,
    );
    if (!chapter) {
      throw new Error(`Chapter not found for ingest: ${input.chapterId}`);
    }
    if (chapter.status !== 'final') {
      throw new Error(`Chapter must be final before ingest; got "${chapter.status}"`);
    }

    const runId = input.runId ?? `ingest-${chapter.id}-${safeRunId(this.now().toISOString())}`;
    const stagingPath = await wikiStore.openStaging(runId);

    try {
      const extracted = await this.extractInfo(wikiStore, runId, chapter);
      const chapterSummary = await this.writeChapterSummary(wikiStore, runId, chapter, extracted);
      const mergeResult = await this.mergeEntityPages(wikiStore, runId, chapter, extracted);
      await this.updateTrackingDeterministic(wikiStore, runId, extracted);
      await this.updateGlobalAndIndices(wikiStore, runId, chapter, extracted, chapterSummary);
      await this.appendLog(
        wikiStore,
        runId,
        chapter,
        mergeResult.updatedPages,
        mergeResult.divergences.length,
        extracted,
      );

      const history = await wikiStore.commitStaging(runId, {
        chapterId: chapter.id,
        runType: 'ingest',
      });

      return {
        ok: true,
        runId,
        chapterId: chapter.id,
        chapterNumber: chapter.order,
        updatedPages: mergeResult.updatedPages,
        divergencesCount: mergeResult.divergences.length,
        history,
      };
    } catch (error) {
      await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => {});
      console.error('[memory-wiki] ingest failed', { runId, chapterId: chapter.id, error });
      throw error;
    }
  }

  async createEntityPageIfMissing(event: MemoryWikiBibleEntityEvent): Promise<string | null> {
    const cfg = ENTITY_CONFIG[event.entityType];
    if (!cfg) return null;

    const wikiStore = this.options.wikiStoreFactory(event.bookId);
    await wikiStore.ensureBase();

    const id = stringValue(event.entity.id);
    if (id) {
      try {
        return await wikiStore.resolveLink(id);
      } catch {
        // No page exists for this Bible entity yet.
      }
    }

    const name =
      stringValue(event.entity.name) ?? stringValue(event.entity.title) ?? id ?? 'unnamed';
    const slug = slugify(name) || id || 'unnamed';
    const pagePath = normalizeWikiPath(`${cfg.dir}/${slug}`);
    const content = this.seedPage({
      title: name,
      slug,
      pageType: cfg.pageType,
      bibleEntityId: id,
      body: `# ${name}\n\n## Bible 快照\n- 来源：[bible]\n`,
    });

    try {
      await wikiStore.read(pagePath);
      return pagePath;
    } catch {
      await wikiStore.write(pagePath, content);
      return pagePath;
    }
  }

  private async extractInfo(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
  ): Promise<ExtractedInfo> {
    const rootIndex = await wikiStore.read('index/_root.md', runId).catch(() => '');
    const prompt = this.options.prompts.render('memory-wiki', 'ingest-extract', {
      chapter_id: chapter.id,
      chapter_number: String(chapter.order),
      chapter_title: chapter.title,
      chapter_content: chapter.content,
      root_index: rootIndex,
    });

    return this.generateJsonWithRetries(
      {
        messages: [
          { role: 'system', content: '你是 MemoryWiki 的章节信息抽取器。只输出 JSON。' },
          { role: 'user', content: prompt },
        ],
        maxTokens: 4096,
        temperature: 0.1,
      },
      (json) => {
        const parsed = json as Record<string, unknown>;
        return extractedInfoSchema.parse({
          ...parsed,
          chapter_id: parsed.chapter_id ?? chapter.id,
          chapter_number: parsed.chapter_number ?? chapter.order,
          chapter_title: parsed.chapter_title ?? chapter.title,
        });
      },
    );
  }

  private async writeChapterSummary(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
    extracted: ExtractedInfo,
  ): Promise<string> {
    const page = this.seedPage({
      title: `第 ${chapter.order} 章：${chapter.title}`,
      slug: `ch-${chapter.order}`,
      pageType: 'chapter-summary',
      extraFrontmatter: [
        `chapter_number: ${chapter.order}`,
        `chapter_id: "${chapter.id}"`,
        `word_count: ${chapter.wordCount}`,
        'status: "finalized"',
      ],
      body: [
        `# 第 ${chapter.order} 章：${chapter.title}`,
        '',
        '## 一句话概要',
        extracted.summary,
        '',
        '## 信息增量',
        ...factsToMarkdown(extracted),
        '',
      ].join('\n'),
    });

    const path = `chapters/ch-${chapter.order}.md`;
    await wikiStore.write(path, page, runId);
    return page;
  }

  private async mergeEntityPages(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
    extracted: ExtractedInfo,
  ): Promise<{ updatedPages: string[]; divergences: WikiDivergence[] }> {
    const jobs = entityJobs(extracted);
    const updatedPages: string[] = [];
    const divergences: WikiDivergence[] = [];

    for (const job of jobs) {
      const currentPage = await wikiStore
        .read(job.pagePath, runId)
        .catch(() => this.seedEntityPage(job, chapter.order));

      const prompt = this.options.prompts.render('memory-wiki', 'ingest-merge-entity', {
        page_path: job.pagePath,
        chapter_number: String(chapter.order),
        chapter_title: chapter.title,
        current_page: currentPage,
        entity_update_json: JSON.stringify(job.update, null, 2),
      });

      const parsed = await this.generateJsonWithRetries(
        {
          messages: [
            { role: 'system', content: '你是 MemoryWiki 页面合并器。只输出 JSON。' },
            { role: 'user', content: prompt },
          ],
          maxTokens: 4096,
          temperature: 0.1,
        },
        (json) => mergeResultSchema.parse(json),
      );
      const mergedPage = normalizeEntityFrontmatter(
        preserveAuthorNotes(currentPage, parsed.merged_page),
        currentPage,
        job,
        chapter.order,
        this.nowIso(),
      );
      await wikiStore.write(job.pagePath, mergedPage, runId);
      updatedPages.push(job.pagePath);
      divergences.push(
        ...parsed.divergences.map((divergence, index) => ({
          ...divergence,
          id: divergence.id ?? `${chapter.id}-${updatedPages.length}-${index}`,
          page_path: divergence.page_path || job.pagePath,
        })),
      );
    }

    if (divergences.length > 0) {
      await this.appendDivergences(wikiStore, runId, chapter, divergences);
    }

    return { updatedPages, divergences };
  }

  private async updateTrackingDeterministic(
    wikiStore: WikiStore,
    runId: string,
    extracted: ExtractedInfo,
  ): Promise<void> {
    const timelineRows = extracted.timeline_events.map(
      (event) =>
        `| ch-${event.chapter_number} | ${event.story_date ?? '-'} | ${event.event} | ${event.characters.join(', ') || '-'} | ${event.locations.join(', ') || '-'} | [ch-${event.chapter_number}: ${event.confidence}] |`,
    );
    if (timelineRows.length > 0) {
      await appendSection(wikiStore, runId, 'tracking/timeline.md', '## 事件', [
        '| 章 | 故事内时间 | 事件 | 角色 | 地点 | 出处 |',
        '|----|------------|------|------|------|------|',
        ...timelineRows,
      ]);
    }

    const plantedRows = extracted.foreshadowing_planted.map(
      (item) =>
        `| ${item.description} | ch-${item.planted_chapter} | ${item.expected_payoff_chapter ? `ch-${item.expected_payoff_chapter}` : '-'} | - | 待回收 | [ch-${item.planted_chapter}: ${item.confidence}] |`,
    );
    const paidRows = extracted.foreshadowing_paid_off.map(
      (item) =>
        `| ${item.description} | ${item.planted_chapter ? `ch-${item.planted_chapter}` : '-'} | - | ch-${item.paid_off_chapter} | 已回收 | [ch-${item.paid_off_chapter}: ${item.confidence}] |`,
    );
    if (plantedRows.length + paidRows.length > 0) {
      await appendSection(wikiStore, runId, 'tracking/foreshadowing.md', '## 伏笔表', [
        '| 伏笔 | 种植章 | 预计回收章 | 实际回收章 | 状态 | 出处 |',
        '|------|--------|------------|------------|------|------|',
        ...plantedRows,
        ...paidRows,
      ]);
    }

    const looseRows = extracted.loose_threads.map(
      (thread) =>
        `| ${thread.description} | ${thread.status === 'resolved' ? '已解决' : '未解决'} | ch-${thread.chapter_number} | [ch-${thread.chapter_number}: ${thread.confidence}] |`,
    );
    if (looseRows.length > 0) {
      await appendSection(wikiStore, runId, 'tracking/loose-threads.md', '## 线索表', [
        '| 线索 | 状态 | 章 | 出处 |',
        '|------|------|----|------|',
        ...looseRows,
      ]);
    }
  }

  private async updateGlobalAndIndices(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
    extracted: ExtractedInfo,
    chapterSummary: string,
  ): Promise<void> {
    const currentGlobal = await wikiStore.read('chapters/global.md', runId).catch(() => '');
    const prompt = this.options.prompts.render('memory-wiki', 'ingest-update-global', {
      current_global: currentGlobal,
      chapter_summary: chapterSummary,
      extracted_info_json: JSON.stringify(extracted, null, 2),
    });

    const result = await this.generateWithRetries({
      messages: [
        { role: 'system', content: '你是 MemoryWiki 全书状态维护器。只输出完整 markdown。' },
        { role: 'user', content: prompt },
      ],
      maxTokens: 2048,
      temperature: 0.1,
    });

    const globalPage = normalizeFrontmatter(result.content, {
      title: '全书状态',
      slug: 'global',
      page_type: 'global-state',
      updated_at: this.nowIso(),
    });
    await wikiStore.write('chapters/global.md', globalPage, runId);
    await this.rebuildIndices(wikiStore, runId, chapter);
  }

  private async appendLog(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
    updatedPages: string[],
    divergencesCount: number,
    extracted: ExtractedInfo,
  ): Promise<void> {
    const log = await wikiStore.read('log.md', runId).catch(() =>
      this.seedPage({
        title: 'Wiki 活动日志',
        slug: 'log',
        pageType: 'log',
        body: '# Wiki 活动日志\n',
      }),
    );
    const entry = [
      '',
      `## [${this.nowIso()}] ingest ${runId} | 第 ${chapter.order} 章定稿`,
      `- 更新页面：${updatedPages.length > 0 ? updatedPages.join(', ') : '无实体页更新'}`,
      `- 确定性更新 timeline（+${extracted.timeline_events.length}）、foreshadowing（+${extracted.foreshadowing_planted.length + extracted.foreshadowing_paid_off.length}）、loose-threads（+${extracted.loose_threads.length}）`,
      `- 写入 divergences-pending（${divergencesCount} 条）`,
      '- 更新 index / global.md',
      '',
    ].join('\n');

    await wikiStore.write('log.md', `${log.trimEnd()}\n${entry}`, runId);
  }

  private async appendDivergences(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
    divergences: WikiDivergence[],
  ): Promise<void> {
    const current = await wikiStore.read('tracking/divergences-pending.md', runId).catch(() =>
      this.seedPage({
        title: '分歧待处理',
        slug: 'divergences-pending',
        pageType: 'divergences',
        body: '# 分歧待处理\n',
      }),
    );
    const body = divergences
      .map((divergence) =>
        [
          `### ${divergence.page_path}`,
          divergence.id ? `- **ID**：${divergence.id}` : null,
          `- **类型**：${divergence.kind}`,
          divergence.old_observation ? `- **旧观察**：${divergence.old_observation}` : null,
          divergence.bible_value ? `- **Bible**：${divergence.bible_value}` : null,
          `- **新观察**：${divergence.new_observation}`,
          divergence.evidence ? `- **抽取证据**：${divergence.evidence}` : null,
          divergence.suggestion ? `- **建议处理**：${divergence.suggestion}` : null,
          '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n');

    await wikiStore.write(
      'tracking/divergences-pending.md',
      `${current.trimEnd()}\n\n## [${this.nowIso()}] ch-${chapter.order} 抽取\n${body}`,
      runId,
    );
  }

  private async rebuildIndices(
    wikiStore: WikiStore,
    runId: string,
    chapter: ChapterForIngest,
  ): Promise<void> {
    const counts: Record<string, number> = {};
    for (const [key, cfg] of Object.entries(ENTITY_CONFIG)) {
      const pages = await wikiStore.list(cfg.dir, { runId });
      counts[key] = pages.filter((page) => page.endsWith('.md')).length;
      const lines = await Promise.all(
        pages
          .filter((page) => page.endsWith('.md'))
          .map(async (page) => {
            const raw = await wikiStore.read(page, runId);
            const parsed = this.options.wikiSchema.parseFrontmatter(raw);
            const slug =
              stringValue(parsed.frontmatter.slug) ??
              page.split('/').pop()?.replace(/\.md$/, '') ??
              page;
            const title = stringValue(parsed.frontmatter.title) ?? slug;
            return `- [[${cfg.index}/${slug}]]：${title}`;
          }),
      );
      await wikiStore.write(
        `index/${cfg.index}.md`,
        this.seedPage({
          title: cfg.title,
          slug: cfg.index,
          pageType: 'index',
          extraFrontmatter: [`category: "${cfg.index}"`],
          body: `# ${cfg.title}（${lines.length}）\n\n${lines.join('\n')}\n`,
        }),
        runId,
      );
    }

    const chapterPages = await wikiStore.list('chapters', { runId });
    const chapterLines = chapterPages
      .filter((page) => page.endsWith('.md'))
      .map((page) => {
        const link = page.replace(/\.md$/, '');
        return `- [[${link}]]`;
      });
    await wikiStore.write(
      'index/chapters.md',
      this.seedPage({
        title: '章节索引',
        slug: 'chapters',
        pageType: 'index',
        extraFrontmatter: ['category: "chapters"'],
        body: `# 章节索引（${chapterLines.length}）\n\n${chapterLines.join('\n')}\n`,
      }),
      runId,
    );

    const totalPages =
      Object.values(counts).reduce((sum, count) => sum + count, 0) + chapterLines.length;
    await wikiStore.write(
      'index/_root.md',
      this.seedPage({
        title: 'Wiki 索引（总目录）',
        slug: 'root',
        pageType: 'index',
        extraFrontmatter: [`total_pages: ${totalPages}`, `last_ingest_chapter: ${chapter.order}`],
        body: [
          '# Wiki 索引（总目录）',
          '',
          `- [[index/characters]]：角色（${counts.characters ?? 0} 页）`,
          `- [[index/locations]]：地点（${counts.locations ?? 0} 页）`,
          `- [[index/organizations]]：组织（${counts.organizations ?? 0} 页）`,
          `- [[index/items]]：物品（${counts.items ?? 0} 页）`,
          `- [[index/concepts]]：概念 / 主题（${counts.concepts ?? 0} 页）`,
          `- [[index/chapters]]：章摘要（${chapterLines.length} 页）`,
          '- [[tracking/timeline]]、[[tracking/foreshadowing]]、[[tracking/loose-threads]]',
          '- [[tracking/divergences-pending]]',
          '',
        ].join('\n'),
      }),
      runId,
    );
  }

  private seedEntityPage(job: EntityUpdateJob, chapterNumber: number): string {
    const cfg = ENTITY_CONFIG[job.pageType];
    return this.seedPage({
      title: job.update.name ?? job.update.slug,
      slug: job.update.slug,
      pageType: cfg.pageType,
      bibleEntityId: job.update.bible_entity_id ?? undefined,
      extraFrontmatter: [`last_ingest_chapter: ${chapterNumber}`],
      body: `# ${job.update.name ?? job.update.slug}\n\n## 基本观察\n`,
    });
  }

  private seedPage(input: {
    title: string;
    slug: string;
    pageType: string;
    body: string;
    bibleEntityId?: string | null;
    extraFrontmatter?: string[];
  }): string {
    const bibleLine = input.bibleEntityId ? `bible_entity_id: "${input.bibleEntityId}"\n` : '';
    const extra = input.extraFrontmatter?.length ? `${input.extraFrontmatter.join('\n')}\n` : '';
    return `---\ntitle: "${escapeYaml(input.title)}"\nslug: "${escapeYaml(input.slug)}"\npage_type: "${input.pageType}"\nupdated_at: "${this.nowIso()}"\n${bibleLine}${extra}---\n\n${input.body}`;
  }

  private async generateWithRetries(
    input: GenerateInput,
    task: TaskType = 'summary',
  ): Promise<GenerateOutput> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.options.router.generate(input, task);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async generateJsonWithRetries<T>(
    input: GenerateInput,
    parse: (json: unknown) => T,
    task: TaskType = 'summary',
  ): Promise<T> {
    let lastError: unknown;
    let retryInput = input;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let rawContent = '';
      try {
        const result = await this.options.router.generate(retryInput, task);
        rawContent = result.content;
        return parse(JSON.parse(extractJson(rawContent)));
      } catch (error) {
        lastError = error;
        retryInput = buildJsonRepairInput(input, rawContent, error);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private nowIso(): string {
    return this.now().toISOString();
  }
}

async function appendSection(
  wikiStore: WikiStore,
  runId: string,
  pagePath: string,
  heading: string,
  lines: string[],
): Promise<void> {
  const current = await wikiStore.read(pagePath, runId).catch(() => '');
  await wikiStore.write(
    pagePath,
    `${current.trimEnd()}\n\n${heading}\n${lines.join('\n')}\n`,
    runId,
  );
}

function entityJobs(extracted: ExtractedInfo): EntityUpdateJob[] {
  const jobs: EntityUpdateJob[] = [];
  const add = (pageType: MemoryWikiBibleEntityType, updates: WikiEntityUpdate[]) => {
    const cfg = ENTITY_CONFIG[pageType];
    for (const update of updates) {
      jobs.push({
        pageType,
        pagePath: normalizeWikiPath(`${cfg.dir}/${update.slug}`),
        update,
      });
    }
  };

  add('characters', extracted.character_updates);
  add('locations', extracted.location_updates);
  add('organizations', extracted.organization_updates);
  add('items', extracted.item_updates);
  add('concepts', extracted.concept_updates);
  return jobs;
}

function factsToMarkdown(extracted: ExtractedInfo): string[] {
  const facts: string[] = [];
  for (const update of [
    ...extracted.character_updates,
    ...extracted.location_updates,
    ...extracted.organization_updates,
    ...extracted.item_updates,
    ...extracted.concept_updates,
  ]) {
    for (const fact of update.facts) {
      facts.push(
        `- **${update.name ?? update.slug}**：${fact.text} [ch-${fact.source_chapter ?? extracted.chapter_number}: ${fact.confidence}]`,
      );
    }
  }
  return facts.length > 0 ? facts : ['- （无结构化信息增量）'];
}

function preserveAuthorNotes(oldPage: string, newPage: string): string {
  const blocks = oldPage.match(/<!-- author-note start -->[\s\S]*?<!-- author-note end -->/g) ?? [];
  let merged = newPage;
  for (const block of blocks) {
    if (!merged.includes(block)) {
      merged = `${merged.trimEnd()}\n\n${block}\n`;
    }
  }
  return merged;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

function normalizeEntityFrontmatter(
  raw: string,
  currentPage: string,
  job: EntityUpdateJob,
  chapterNumber: number,
  updatedAt: string,
): string {
  const cfg = ENTITY_CONFIG[job.pageType];
  const rawFrontmatter = matter(raw).data;
  const currentFrontmatter = matter(currentPage).data;
  const bibleEntityId =
    stringValue(job.update.bible_entity_id) ?? stringValue(currentFrontmatter.bible_entity_id);

  return normalizeFrontmatter(raw, {
    title: job.update.name ?? stringValue(rawFrontmatter.title) ?? job.update.slug,
    slug: job.update.slug,
    page_type: cfg.pageType,
    updated_at: updatedAt,
    last_ingest_chapter: chapterNumber,
    bible_entity_id: bibleEntityId,
  });
}

function normalizeFrontmatter(raw: string, forced: Record<string, unknown>): string {
  const parsed = matter(raw);
  const frontmatter = { ...parsed.data };
  for (const [key, value] of Object.entries(forced)) {
    if (value === undefined || value === null || value === '') {
      delete frontmatter[key];
    } else {
      frontmatter[key] = value;
    }
  }

  const body = parsed.content.trimStart();
  return `${matter.stringify(body, frontmatter).trimEnd()}\n`;
}

function buildJsonRepairInput(
  input: GenerateInput,
  rawContent: string,
  error: unknown,
): GenerateInput {
  if (!rawContent.trim()) return input;

  const clipped = rawContent.length > 12_000 ? rawContent.slice(0, 12_000) : rawContent;
  return {
    ...input,
    temperature: 0,
    messages: [
      ...input.messages,
      { role: 'assistant', content: clipped },
      {
        role: 'user',
        content: [
          '上一次输出不是可解析或不符合 schema 的 JSON。',
          `错误：${error instanceof Error ? error.message : String(error)}`,
          '请只返回修正后的完整 JSON，不要输出解释、Markdown 代码块或额外文本。',
        ].join('\n'),
      },
    ],
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeYaml(value: string): string {
  return value.replace(/"/g, '\\"');
}

function safeRunId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}
