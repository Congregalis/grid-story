import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ChapterForIngest,
  type ChapterStore,
  type ChapterTextSource,
  EntityMounter,
  IngestPipeline,
  LintRunner,
  MountError,
  ProseSampler,
  QueryNavigator,
  WikiSchema,
  WikiStore,
} from '../index';
import { db as rawDb } from '../../db/connection';

vi.mock('../../db/connection', () => {
  // Chain: db.select().from(table).where(cond)
  const queryChain = {
    select: vi.fn(() => queryChain),
    from: vi.fn(() => queryChain),
    where: vi.fn(() => Promise.resolve([])),
    insert: vi.fn(() => queryChain),
    values: vi.fn(() => Promise.resolve()),
  };

  return {
    db: {
      select: queryChain.select,
      insert: queryChain.insert,
      __mock: queryChain,
    },
  };
});

function mockDbRows(rows: Record<string, unknown>[]) {
  const mock = (rawDb as unknown as { __mock: { where: ReturnType<typeof vi.fn> } }).__mock;
  mock.where.mockResolvedValue(rows);
}

function mockDbInsert() {
  const mock = (rawDb as unknown as { __mock: { values: ReturnType<typeof vi.fn> } }).__mock;
  mock.values.mockResolvedValue(undefined);
}

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'grid-story-wiki-'));
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

describe('WikiSchema', () => {
  it('renders templates and validates frontmatter softly', () => {
    const schema = new WikiSchema();
    const raw = schema.renderTemplate(
      '---\ntitle: "{{title}}"\nslug: "{{slug}}"\npage_type: "character"\nupdated_at: "{{updated_at}}"\n---\n\n# {{title}}\n',
      {
        title: '张三',
        slug: 'zhang-san',
        updated_at: '2026-05-04T12:00:00.000Z',
      },
    );

    const parsed = schema.parseFrontmatter(raw);
    const validation = schema.validatePage(raw);

    expect(parsed.frontmatter.slug).toBe('zhang-san');
    expect(validation.ok).toBe(true);
  });

  it('returns validation issues instead of throwing on malformed LLM output', () => {
    const schema = new WikiSchema();
    const validation = schema.validatePage('---\npage_type: "nope"\n---\n\n# Bad\n');

    expect(validation.ok).toBe(false);
    expect(validation.issues.length).toBeGreaterThan(0);
  });
});

describe('WikiStore', () => {
  it('creates base wiki files and lists markdown pages', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();

    const rootIndex = await store.read('index/_root.md');
    const pages = await store.list('tracking');

    expect(rootIndex).toContain('# Wiki 索引');
    expect(pages).toContain('tracking/divergences-pending.md');
  });

  it('commits staging transaction with backup history and can rollback by run id', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();
    await store.write(
      'entities/characters/zhang-san.md',
      page('张三', 'zhang-san', 'character', '旧观察'),
    );

    const runId = 'run-1';
    await store.openStaging(runId);
    await store.write(
      'entities/characters/zhang-san.md',
      page('张三', 'zhang-san', 'character', '新观察'),
      runId,
    );

    const entry = await store.commitStaging(runId, { chapterId: 'chapter-1' });
    const current = await store.read('entities/characters/zhang-san.md');
    const history = await store.readHistory();
    const backupExists = await exists(path.join(store.wikiRoot, entry.backup_dir ?? ''));

    expect(current).toContain('新观察');
    expect(entry.files_changed).toContain('entities/characters/zhang-san.md');
    expect(history[0].run_id).toBe(runId);
    expect(backupExists).toBe(true);

    await store.rollbackStaging(runId);
    const rolledBack = await store.read('entities/characters/zhang-san.md');
    expect(rolledBack).toContain('旧观察');
  });

  it('resolves wikilinks through paths, bible entity ids, and redirects', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();
    await store.write(
      'entities/characters/zhang-san.md',
      page('张三', 'zhang-san', 'character', '正文', 'character-1'),
    );
    await store.write(
      'tracking/redirects.md',
      page(
        'Slug 重命名历史',
        'redirects',
        'redirects',
        '| 原 slug | 新 slug | bible_entity_id | 改名时间 |\n| old-zhang | zhang-san | character-1 | 2026-05-04 |\n',
      ),
    );

    await expect(store.resolveLink('[[characters/zhang-san]]')).resolves.toBe(
      'entities/characters/zhang-san.md',
    );
    await expect(store.resolveLink('character-1')).resolves.toBe(
      'entities/characters/zhang-san.md',
    );
    await expect(store.resolveLink('[[characters/old-zhang]]')).resolves.toBe(
      'entities/characters/zhang-san.md',
    );
  });
});

describe('ProseSampler', () => {
  it('samples latest chapter versions by recent chapters, key scenes, and character mentions', async () => {
    const source: ChapterTextSource = {
      async listChapters() {
        return [
          chapter('chapter-1-v1', 'root-1', 1, 1, '第一章', '张三初入京都。'),
          chapter('chapter-1-v2', 'root-1', 2, 1, '第一章', '张三初入京都。李四在城门等他。'),
          chapter('chapter-2-v1', 'root-2', 1, 2, '第二章', '雨夜里，京都全城戒严。'),
          chapter('chapter-3-v1', 'root-3', 1, 3, '第三章', '李四独自饮酒，提起旧案。'.repeat(120)),
          {
            ...chapter('chapter-4-v1', 'root-4', 1, 4, '第四章', '李四仍在草稿里。'),
            status: 'draft',
          },
          chapter('chapter-5-v1', 'root-5', 1, 5, '第五章', ''),
        ];
      },
    };

    const sampler = new ProseSampler(source);
    const samples = await sampler.sample('book-1', {
      characters: ['李四'],
      recentChapters: 1,
      keyScenes: ['ch-1'],
      maxSamples: 4,
      maxCharsPerSample: 80,
    });

    expect(samples.map((sample) => sample.chapter_id)).toEqual(['chapter-3-v1', 'chapter-1-v2']);
    expect(samples[0].text.length).toBeLessThanOrEqual(80);
    expect(samples[1].text).toContain('李四');
  });
});

describe('IngestPipeline', () => {
  it('runs a full ingest transaction and writes wiki pages, tracking, indices, and history', async () => {
    const wikiSchema = new WikiSchema();
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const chapterStore: ChapterStore = {
      async getChapterForIngest() {
        return {
          id: 'chapter-1',
          bookId: 'book-1',
          title: '雨夜入城',
          content: '张三在雨夜进入京都，李四在城门等他。',
          order: 1,
          wordCount: 21,
          status: 'final',
        };
      },
    };
    const router = new FakeRouter([
      JSON.stringify({
        chapter_id: 'chapter-1',
        chapter_number: 1,
        chapter_title: '雨夜入城',
        summary: '张三在雨夜入城并遇见李四。',
        character_updates: [
          {
            slug: 'zhang-san',
            name: '张三',
            facts: [
              {
                text: '张三在雨夜进入京都。',
                confidence: 'explicit',
                source_chapter: 1,
              },
            ],
          },
        ],
        timeline_events: [
          {
            chapter_number: 1,
            story_date: null,
            event: '张三进入京都',
            characters: ['zhang-san'],
            locations: ['jing-du'],
            confidence: 'explicit',
          },
        ],
        foreshadowing_planted: [
          {
            description: '李四为何等在城门',
            planted_chapter: 1,
            expected_payoff_chapter: 3,
            confidence: 'implied',
          },
        ],
        loose_threads: [
          {
            description: '李四的真实目的',
            status: 'opened',
            chapter_number: 1,
            confidence: 'implied',
          },
        ],
      }),
      JSON.stringify({
        merged_page: [
          '---',
          'title: "乱写的张三"',
          'slug: "bad-zhang-san"',
          'page_type: "bad-page-type"',
          'updated_at: "1999-01-01T00:00:00.000Z"',
          'bible_entity_id: "llm-invented-id"',
          '---',
          '',
          '# 张三',
          '- 张三在雨夜进入京都 [ch-1]',
        ].join('\n'),
        divergences: [
          {
            page_path: 'entities/characters/zhang-san.md',
            kind: 'new_observation',
            new_observation: '雨夜入城',
            evidence: '张三在雨夜进入京都',
          },
        ],
      }),
      page('全书状态', 'global', 'global-state', '## 当前进度\n- 已完成：第 1 章\n'),
    ]);
    const prompts = { render: () => 'prompt' };
    const pipeline = new IngestPipeline({
      wikiStoreFactory,
      wikiSchema,
      router,
      prompts,
      chapterStore,
      now: () => new Date('2026-05-04T12:00:00.000Z'),
    });

    const result = await pipeline.run({ bookId: 'book-1', chapterId: 'chapter-1', runId: 'run-1' });
    const store = wikiStoreFactory('book-1');

    await expect(store.read('chapters/ch-1.md')).resolves.toContain('张三在雨夜入城并遇见李四。');
    await expect(store.read('entities/characters/zhang-san.md')).resolves.toContain('[ch-1]');
    const zhangSanPage = wikiSchema.parseFrontmatter(
      await store.read('entities/characters/zhang-san.md'),
    );
    expect(zhangSanPage.frontmatter).toMatchObject({
      title: '张三',
      slug: 'zhang-san',
      page_type: 'character',
      updated_at: '2026-05-04T12:00:00.000Z',
      last_ingest_chapter: 1,
    });
    expect(zhangSanPage.frontmatter.bible_entity_id).toBeUndefined();
    await expect(store.read('tracking/timeline.md')).resolves.toContain('张三进入京都');
    await expect(store.read('tracking/foreshadowing.md')).resolves.toContain('李四为何等在城门');
    await expect(store.read('tracking/loose-threads.md')).resolves.toContain('李四的真实目的');
    await expect(store.read('tracking/divergences-pending.md')).resolves.toContain('雨夜入城');
    await expect(store.read('index/characters.md')).resolves.toContain('[[characters/zhang-san]]');

    expect(result.updatedPages).toEqual(['entities/characters/zhang-san.md']);
    expect(result.divergencesCount).toBe(1);
    expect((await store.readHistory())[0].run_id).toBe('run-1');
  });

  it('retries malformed JSON output during ingest extraction', async () => {
    const wikiSchema = new WikiSchema();
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const chapterStore: ChapterStore = {
      async getChapterForIngest() {
        return {
          id: 'chapter-1',
          bookId: 'book-1',
          title: '雪夜',
          content: '雪夜里，苏然回到北谷。',
          order: 1,
          wordCount: 12,
          status: 'final',
        };
      },
    };
    const router = new FakeRouter([
      '{"chapter_id":"chapter-1","chapter_number":1',
      JSON.stringify({
        chapter_id: 'chapter-1',
        chapter_number: 1,
        chapter_title: '雪夜',
        summary: '苏然在雪夜回到北谷。',
        character_updates: [],
        location_updates: [],
        organization_updates: [],
        item_updates: [],
        concept_updates: [],
        timeline_events: [],
        foreshadowing_planted: [],
        foreshadowing_paid_off: [],
        loose_threads: [],
      }),
      [
        '---',
        'title: "模型乱写的标题"',
        'slug: "bad-global"',
        'page_type: "bad-page-type"',
        'updated_at: "1999-01-01T00:00:00.000Z"',
        '---',
        '',
        '## 当前进度',
        '- 已完成：第 1 章',
      ].join('\n'),
    ]);
    const pipeline = new IngestPipeline({
      wikiStoreFactory,
      wikiSchema,
      router,
      prompts: { render: () => 'prompt' },
      chapterStore,
      now: () => new Date('2026-05-04T12:00:00.000Z'),
    });

    const result = await pipeline.run({ bookId: 'book-1', chapterId: 'chapter-1', runId: 'run-1' });
    const store = wikiStoreFactory('book-1');

    expect(result.ok).toBe(true);
    expect(result.updatedPages).toEqual([]);
    await expect(store.read('chapters/ch-1.md')).resolves.toContain('苏然在雪夜回到北谷。');
    const globalPage = wikiSchema.parseFrontmatter(await store.read('chapters/global.md'));
    expect(globalPage.frontmatter).toMatchObject({
      title: '全书状态',
      slug: 'global',
      page_type: 'global-state',
      updated_at: '2026-05-04T12:00:00.000Z',
    });
  });
});

describe('QueryNavigator', () => {
  it('selects wiki pages, injects prose samples, and surfaces divergences', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();
    await store.write(
      'entities/characters/zhang-san.md',
      page('张三', 'zhang-san', 'character', '- 张三寡言，习惯在雨夜独行 [ch-1]\n', 'character-1'),
    );
    await store.write(
      'index/characters.md',
      page('角色索引', 'characters', 'index', '- [[characters/zhang-san]]：张三\n'),
    );
    await store.write(
      'chapters/ch-1.md',
      page('第一章', 'ch-1', 'chapter-summary', '张三在雨夜入城。\n'),
    );
    await store.write(
      'tracking/divergences-pending.md',
      page(
        '分歧待处理',
        'divergences-pending',
        'divergences',
        [
          '## [2026-05-04T12:00:00.000Z] ch-1 抽取',
          '### entities/characters/zhang-san.md',
          '- **ID**：div-1',
          '- **类型**：bible_conflict',
          '- **Bible**：怕水',
          '- **新观察**：ch-5 游过护城河',
          '- **抽取证据**：张三游过护城河',
          '',
        ].join('\n'),
      ),
    );

    const sampler = new ProseSampler({
      async listChapters() {
        return [
          chapter('chapter-1', 'root-1', 1, 1, '第一章', '张三站在雨里，低声说话。'),
          chapter('chapter-2', 'root-2', 1, 2, '第二章', '李四在城门等张三。'),
        ];
      },
    });
    const navigator = new QueryNavigator({
      wikiStoreFactory,
      proseSampler: sampler,
      router: new FakeRouter([
        JSON.stringify({ categories: ['characters', 'chapters', 'tracking'] }),
        JSON.stringify({
          pages: [
            {
              path: 'characters/zhang-san',
              category: 'characters',
              reason: '核心角色',
            },
            {
              path: 'chapters/ch-1',
              category: 'chapters',
              reason: '近期摘要',
            },
          ],
        }),
      ]),
      prompts: { render: () => 'prompt' },
    });

    const result = await navigator.query({
      bookId: 'book-1',
      context: {
        task: 'writing.first-draft',
        scene_brief: '张三在城门和李四谈判。',
        characters: ['张三'],
        chapter_number: 2,
      },
    });

    expect(result.selected_categories).toContain('characters');
    expect(result.selected_pages.map((selected) => selected.path)).toContain(
      'entities/characters/zhang-san.md',
    );
    expect(result.blocks.wiki.characters[0].content).toContain('习惯在雨夜独行');
    expect(result.blocks.prose.map((sample) => sample.chapter_id)).toContain('chapter-2');
    expect(result.blocks.divergences[0]).toMatchObject({
      id: 'div-1',
      kind: 'bible_conflict',
      bible_value: '怕水',
    });
    expect(result.assembled_context).toContain('MemoryWiki 上下文');
    expect(result.assembled_context).toContain('原文样本');
    expect(result.assembled_context).toContain('Bible/Wiki 分歧告警');
  });

  it('marks pending divergences as resolved', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();
    await store.write(
      'tracking/divergences-pending.md',
      page(
        '分歧待处理',
        'divergences-pending',
        'divergences',
        [
          '### entities/characters/zhang-san.md',
          '- **ID**：div-1',
          '- **类型**：wiki_conflict',
          '- **新观察**：张三的称呼前后不一致',
          '',
        ].join('\n'),
      ),
    );

    const navigator = new QueryNavigator({
      wikiStoreFactory,
      proseSampler: new ProseSampler({
        async listChapters() {
          return [];
        },
      }),
      router: new FakeRouter([]),
      prompts: { render: () => 'prompt' },
      now: () => new Date('2026-05-04T12:00:00.000Z'),
    });

    await expect(navigator.listDivergences('book-1')).resolves.toHaveLength(1);
    const resolved = await navigator.resolveDivergence({
      bookId: 'book-1',
      id: 'div-1',
      decision: '以 Bible 为准',
      note: '后续修 wiki',
    });

    expect(resolved.id).toBe('div-1');
    await expect(navigator.listDivergences('book-1')).resolves.toHaveLength(0);
    await expect(store.read('tracking/divergences-pending.md')).resolves.toContain('以 Bible 为准');
  });
});

describe('LintRunner', () => {
  it('runs deterministic and LLM checks, writes report, and lists reports', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();
    await store.write(
      'entities/characters/zhang-san.md',
      page(
        '张三',
        'zhang-san',
        'character',
        [
          '- 张三怕水 [bible]',
          '- 张三怕水源于童年落水 [ch-1: inferred]',
          '- 关联 [[characters/missing-person]]',
          '<!-- author-note start -->',
          '后续要让他克服怕水。',
        ].join('\n'),
      ),
    );
    await store.write(
      'tracking/foreshadowing.md',
      page(
        '伏笔追踪',
        'foreshadowing',
        'foreshadowing',
        [
          '| 伏笔 | 种植章 | 预计回收章 | 实际回收章 | 状态 | 出处 |',
          '|------|--------|------------|------------|------|------|',
          '| 城门黑衣人身份 | ch-1 | ch-2 | - | 待回收 | [ch-1: implied] |',
        ].join('\n'),
      ),
    );
    await store.write(
      'tracking/timeline.md',
      page(
        '时间线',
        'timeline',
        'timeline',
        [
          '| 章 | 故事内时间 | 事件 | 角色 | 地点 | 出处 |',
          '|----|------------|------|------|------|------|',
          '| ch-1 | 雨夜 | 张三入城 | 张三 | 京都 | [ch-1] |',
        ].join('\n'),
      ),
    );
    await store.write(
      'tracking/divergences-pending.md',
      page(
        '分歧待处理',
        'divergences-pending',
        'divergences',
        [
          '### entities/characters/zhang-san.md',
          '- **ID**：div-1',
          '- **类型**：bible_conflict',
          '- **Bible**：怕水',
          '- **新观察**：张三主动游过护城河',
          '- **抽取证据**：护城河场景',
          '',
        ].join('\n'),
      ),
    );
    await store.write(
      'chapters/ch-9.md',
      page('第九章', 'ch-9', 'chapter-summary', '张三接近京都旧案真相。'),
    );

    const runner = new LintRunner({
      wikiStoreFactory,
      router: new FakeRouter([
        JSON.stringify({
          issues: [
            {
              severity: 'warning',
              title: '角色状态表述需要确认',
              message: '怕水设定与后续行为存在潜在冲突。',
              page_path: 'entities/characters/zhang-san.md',
            },
          ],
        }),
        JSON.stringify({ issues: [] }),
        JSON.stringify({
          issues: [
            {
              severity: 'critical',
              title: 'inferred 断言证据不足',
              message: '童年落水没有章节摘要支撑。',
              page_path: 'entities/characters/zhang-san.md',
            },
          ],
        }),
      ]),
      prompts: { render: () => 'prompt' },
      now: () => new Date('2026-05-04T12:00:00.000Z'),
    });

    const result = await runner.run({ bookId: 'book-1', force: true });

    expect(result.skipped).toBe(false);
    expect(result.reportPath).toBe('tracking/lint/report-20260504T120000Z.md');
    expect(result.issues.map((issue) => issue.check)).toEqual(
      expect.arrayContaining([
        'author_note_integrity',
        'bible_wiki_divergence',
        'character_consistency',
        'dead_wikilink',
        'foreshadowing_overdue',
        'inferred_review',
      ]),
    );
    expect(result.counts.critical).toBeGreaterThan(0);
    await expect(store.read(result.reportPath ?? '')).resolves.toContain('MemoryWiki Lint Report');

    const reports = await runner.listReports('book-1');
    expect(reports[0]).toMatchObject({
      path: 'tracking/lint/report-20260504T120000Z.md',
      issueCount: result.issues.length,
    });
  });

  it('skips incremental lint when no ingest happened since the last run', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();
    await fs.mkdir(path.join(store.wikiRoot, '.meta'), { recursive: true });
    await fs.writeFile(
      path.join(store.wikiRoot, '.meta/lint-state.json'),
      JSON.stringify({ last_lint_at: '2026-05-04T12:00:00.000Z' }),
      'utf-8',
    );

    const runner = new LintRunner({
      wikiStoreFactory,
      router: new FakeRouter([]),
      prompts: { render: () => 'prompt' },
      now: () => new Date('2026-05-04T13:00:00.000Z'),
    });

    const result = await runner.run({ bookId: 'book-1' });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('no ingest since last lint');
    const state = await fs.readFile(path.join(store.wikiRoot, '.meta/lint-state.json'), 'utf-8');
    expect(state).toContain('last_skipped_at');
  });
});

function page(
  title: string,
  slug: string,
  pageType: string,
  body: string,
  bibleEntityId?: string,
): string {
  const bibleLine = bibleEntityId ? `bible_entity_id: "${bibleEntityId}"\n` : '';
  return `---\ntitle: "${title}"\nslug: "${slug}"\npage_type: "${pageType}"\nupdated_at: "2026-05-04T12:00:00.000Z"\n${bibleLine}---\n\n# ${title}\n${body}\n`;
}

function chapter(
  id: string,
  chapterRootId: string,
  version: number,
  order: number,
  title: string,
  content: string,
) {
  return {
    id,
    chapterRootId,
    version,
    order,
    title,
    content,
    status: 'final',
  };
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

describe('E2E: multi-chapter ingest accumulation', () => {
  it('accumulates wiki knowledge across 3 chapters, injects prose, detects divergences, and links Bible entities', async () => {
    const wikiSchema = new WikiSchema();
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });

    // Seed a Bible entity page so we can test bible_entity_id linkage.
    const seedStore = wikiStoreFactory('book-1');
    await seedStore.ensureBase();
    await seedStore.write(
      'entities/characters/zhang-san.md',
      page(
        '张三',
        'zhang-san',
        'character',
        '## Bible 快照\n- 张三，男，25 岁，游侠 [bible]\n',
        'char-zhang-san',
      ),
    );
    await seedStore.write(
      'entities/characters/li-si.md',
      page(
        '李四',
        'li-si',
        'character',
        '## Bible 快照\n- 李四，男，30 岁，城门守卫 [bible]\n',
        'char-li-si',
      ),
    );

    // Chapter store returns 3 chapters in order.
    const chapters: Record<string, ChapterForIngest> = {
      'chapter-1': {
        id: 'chapter-1',
        bookId: 'book-1',
        title: '雨夜入城',
        order: 1,
        wordCount: 82,
        status: 'final',
        content:
          '雨夜，张三骑马进入京都城门。城门已闭，但一名守卫放他进去了。那守卫自称李四，说已等候多日。',
      },
      'chapter-2': {
        id: 'chapter-2',
        bookId: 'book-1',
        title: '影之组织',
        order: 2,
        wordCount: 105,
        status: 'final',
        content:
          '李四带张三到一处地下密室，介绍了一个叫"影"的秘密组织。影的首领据说武功盖世。张三注意到李四的左臂有一道形似影组织徽记的伤疤。',
      },
      'chapter-3': {
        id: 'chapter-3',
        bookId: 'book-1',
        title: '首领真身',
        order: 3,
        wordCount: 90,
        status: 'final',
        content:
          '张三调查后发现，李四就是影的首领。但李四在三年前曾公开宣称自己不会武功。张三质问李四，李四沉默不语，转身走入雨中。',
      },
    };

    const chapterStore: ChapterStore = {
      async getChapterForIngest(_bookId: string, chapterId: string) {
        const ch = chapters[chapterId];
        if (!ch) throw new Error(`Chapter not found: ${chapterId}`);
        return { ...ch };
      },
    };

    // Queue all LLM outputs for 3 ingest runs.
    // Ch1: extract + merge(张三) + merge(李四) + global = 4 calls
    // Ch2: extract + merge(张三) + merge(李四) + merge(影) + global = 5 calls
    // Ch3: extract + merge(张三) + merge(李四) + global = 4 calls
    // Total = 13
    const router = new FakeRouter([
      // ── Chapter 1 ──
      // extract
      JSON.stringify({
        chapter_id: 'chapter-1',
        chapter_number: 1,
        chapter_title: '雨夜入城',
        summary: '张三在雨夜进入京都，城门守卫李四接应他入城。',
        character_updates: [
          {
            slug: 'zhang-san',
            name: '张三',
            facts: [{ text: '张三在雨夜骑马进入京都', confidence: 'explicit', source_chapter: 1 }],
          },
          {
            slug: 'li-si',
            name: '李四',
            facts: [
              {
                text: '李四是城门守卫，自称已等候张三多日',
                confidence: 'explicit',
                source_chapter: 1,
              },
            ],
          },
        ],
        timeline_events: [
          {
            chapter_number: 1,
            story_date: '雨夜',
            event: '张三入城，李四接应',
            characters: ['zhang-san', 'li-si'],
            locations: ['京都'],
            confidence: 'explicit',
          },
        ],
        foreshadowing_planted: [
          {
            description: '李四为何等候张三',
            planted_chapter: 1,
            expected_payoff_chapter: 3,
            confidence: 'implied',
          },
        ],
        loose_threads: [
          {
            description: '李四的真实身份',
            status: 'opened',
            chapter_number: 1,
            confidence: 'implied',
          },
        ],
        location_updates: [],
        organization_updates: [],
        item_updates: [],
        concept_updates: [],
        foreshadowing_paid_off: [],
      }),
      // merge 张三
      JSON.stringify({
        merged_page: page(
          '张三',
          'zhang-san',
          'character',
          '- 张三在雨夜骑马进入京都 [ch-1]\n- 张三，游侠，25 岁 [bible]\n',
          'char-zhang-san',
        ),
        divergences: [],
      }),
      // merge 李四
      JSON.stringify({
        merged_page: page(
          '李四',
          'li-si',
          'character',
          '- 李四是城门守卫，自称已等候张三多日 [ch-1]\n- 李四，男，30 岁，城门守卫 [bible]\n',
          'char-li-si',
        ),
        divergences: [],
      }),
      // global
      page(
        '全书状态',
        'global',
        'global-state',
        '## 当前进度\n- 已完成：第 1 章\n- 最新事件：张三入城\n',
      ),

      // ── Chapter 2 ──
      // extract
      JSON.stringify({
        chapter_id: 'chapter-2',
        chapter_number: 2,
        chapter_title: '影之组织',
        summary: '李四带张三认识秘密组织"影"，张三发现李四左臂有疑似影组织徽记的伤疤。',
        character_updates: [
          {
            slug: 'zhang-san',
            name: '张三',
            facts: [
              { text: '张三被带入影组织的地下密室', confidence: 'explicit', source_chapter: 2 },
            ],
          },
          {
            slug: 'li-si',
            name: '李四',
            facts: [
              { text: '李四左臂有形似影组织徽记的伤疤', confidence: 'explicit', source_chapter: 2 },
            ],
          },
        ],
        organization_updates: [
          {
            slug: 'ying',
            name: '影',
            facts: [
              {
                text: '影是一个秘密组织，首领据说武功盖世',
                confidence: 'explicit',
                source_chapter: 2,
              },
            ],
          },
        ],
        timeline_events: [
          {
            chapter_number: 2,
            story_date: null,
            event: '张三进入影组织地下密室',
            characters: ['zhang-san', 'li-si'],
            locations: ['京都'],
            confidence: 'explicit',
          },
        ],
        foreshadowing_planted: [
          {
            description: '李四左臂的伤疤',
            planted_chapter: 2,
            expected_payoff_chapter: 3,
            confidence: 'implied',
          },
        ],
        loose_threads: [],
        location_updates: [],
        item_updates: [],
        concept_updates: [],
        foreshadowing_paid_off: [],
      }),
      // merge 张三
      JSON.stringify({
        merged_page: page(
          '张三',
          'zhang-san',
          'character',
          '- 张三在雨夜骑马进入京都 [ch-1]\n- 张三被带入影组织的地下密室 [ch-2]\n- 张三，游侠，25 岁 [bible]\n',
          'char-zhang-san',
        ),
        divergences: [],
      }),
      // merge 李四
      JSON.stringify({
        merged_page: page(
          '李四',
          'li-si',
          'character',
          '- 李四是城门守卫，自称已等候张三多日 [ch-1]\n- 李四左臂有形似影组织徽记的伤疤 [ch-2]\n- 李四，男，30 岁，城门守卫 [bible]\n',
          'char-li-si',
        ),
        divergences: [],
      }),
      // merge 影
      JSON.stringify({
        merged_page: page(
          '影',
          'ying',
          'organization',
          '- 影组织首领据说武功盖世 [ch-2]\n',
          'org-ying',
        ),
        divergences: [],
      }),
      // global
      page(
        '全书状态',
        'global',
        'global-state',
        '## 当前进度\n- 已完成：第 1–2 章\n- 最新事件：张三接触影组织\n',
      ),

      // ── Chapter 3 ──
      // extract
      JSON.stringify({
        chapter_id: 'chapter-3',
        chapter_number: 3,
        chapter_title: '首领真身',
        summary: '张三发现李四就是影的首领，但李四曾声称不会武功，两人对峙。',
        character_updates: [
          {
            slug: 'zhang-san',
            name: '张三',
            facts: [
              { text: '张三调查发现李四是影的首领', confidence: 'explicit', source_chapter: 3 },
            ],
          },
          {
            slug: 'li-si',
            name: '李四',
            facts: [
              {
                text: '李四被揭露为影的首领，沉默走入雨中',
                confidence: 'explicit',
                source_chapter: 3,
              },
            ],
          },
        ],
        timeline_events: [
          {
            chapter_number: 3,
            story_date: '雨夜',
            event: '张三揭露李四为影首领',
            characters: ['zhang-san', 'li-si'],
            locations: ['京都'],
            confidence: 'explicit',
          },
        ],
        loose_threads: [
          {
            description: '李四的真实身份',
            status: 'resolved',
            chapter_number: 3,
            confidence: 'explicit',
          },
        ],
        location_updates: [],
        organization_updates: [],
        item_updates: [],
        concept_updates: [],
        foreshadowing_planted: [],
        foreshadowing_paid_off: [],
      }),
      // merge 张三
      JSON.stringify({
        merged_page: page(
          '张三',
          'zhang-san',
          'character',
          '- 张三在雨夜骑马进入京都 [ch-1]\n- 张三被带入影组织的地下密室 [ch-2]\n- 张三调查发现李四是影的首领 [ch-3]\n- 张三，游侠，25 岁 [bible]\n',
          'char-zhang-san',
        ),
        divergences: [],
      }),
      // merge 李四 (divergence: Bible says 不会武功 but ch-3 reveals he's the 首领 who 武功盖世)
      JSON.stringify({
        merged_page: page(
          '李四',
          'li-si',
          'character',
          '- 李四是城门守卫，自称已等候张三多日 [ch-1]\n- 李四左臂有形似影组织徽记的伤疤 [ch-2]\n- 李四被揭露为影的首领，沉默走入雨中 [ch-3]\n- 李四，男，30 岁，城门守卫 [bible]\n',
          'char-li-si',
        ),
        divergences: [
          {
            id: 'div-li-si-martial',
            page_path: 'entities/characters/li-si.md',
            kind: 'bible_conflict',
            old_observation: 'Bible 记载李四为城门守卫（未提武功）',
            bible_value: '城门守卫（暗示不会武功）',
            new_observation: '李四是影的首领，影的首领据说武功盖世',
            evidence: 'ch-3 揭露李四为首领；ch-2 提及影首领武功盖世',
            suggestion: '需确认李四是否会武功，或影的首领另有其人',
          },
        ],
      }),
      // global
      page(
        '全书状态',
        'global',
        'global-state',
        '## 当前进度\n- 已完成：第 1–3 章\n- 最新事件：李四身份揭露\n- 待处理分歧：1 条\n',
      ),
    ]);

    const prompts = { render: () => 'prompt' };
    const pipeline = new IngestPipeline({
      wikiStoreFactory,
      wikiSchema,
      router,
      prompts,
      chapterStore,
      now: () => new Date('2026-05-04T12:00:00.000Z'),
    });

    // ── Ingest chapter 1 ──
    const r1 = await pipeline.run({ bookId: 'book-1', chapterId: 'chapter-1', runId: 'run-1' });
    const s1 = wikiStoreFactory('book-1');

    expect(r1.ok).toBe(true);
    expect(r1.chapterNumber).toBe(1);
    expect(r1.updatedPages).toContain('entities/characters/zhang-san.md');

    // Chapter summary written.
    await expect(s1.read('chapters/ch-1.md')).resolves.toContain('张三在雨夜进入京都');
    // Entity page has ch-1 facts.
    await expect(s1.read('entities/characters/zhang-san.md')).resolves.toContain('[ch-1]');
    // Bible info preserved.
    await expect(s1.read('entities/characters/zhang-san.md')).resolves.toContain('[bible]');
    // Timeline written.
    await expect(s1.read('tracking/timeline.md')).resolves.toContain('张三入城');
    // Foreshadowing planted.
    await expect(s1.read('tracking/foreshadowing.md')).resolves.toContain('李四为何等候张三');
    // No divergences yet.
    await expect(s1.read('tracking/divergences-pending.md')).resolves.not.toContain(
      'bible_conflict',
    );

    // ── Ingest chapter 2 ──
    const r2 = await pipeline.run({ bookId: 'book-1', chapterId: 'chapter-2', runId: 'run-2' });
    const s2 = wikiStoreFactory('book-1');

    expect(r2.ok).toBe(true);
    expect(r2.chapterNumber).toBe(2);
    expect(r2.updatedPages).toContain('entities/characters/zhang-san.md');
    expect(r2.updatedPages).toContain('entities/characters/li-si.md');
    expect(r2.updatedPages).toContain('entities/organizations/ying.md');

    // Chapter 2 summary.
    await expect(s2.read('chapters/ch-2.md')).resolves.toContain('影之组织');
    // 张三 page accumulated ch-1 + ch-2 facts.
    const zhangSanPage2 = await s2.read('entities/characters/zhang-san.md');
    expect(zhangSanPage2).toContain('[ch-1]');
    expect(zhangSanPage2).toContain('[ch-2]');
    // Organization page created.
    await expect(s2.read('entities/organizations/ying.md')).resolves.toContain('影组织');
    // Index rebuilt with both characters + organization.
    await expect(s2.read('index/characters.md')).resolves.toContain('zhang-san');
    await expect(s2.read('index/characters.md')).resolves.toContain('li-si');
    await expect(s2.read('index/organizations.md')).resolves.toContain('ying');

    // ── Ingest chapter 3 ──
    const r3 = await pipeline.run({ bookId: 'book-1', chapterId: 'chapter-3', runId: 'run-3' });
    const s3 = wikiStoreFactory('book-1');

    expect(r3.ok).toBe(true);
    expect(r3.chapterNumber).toBe(3);
    expect(r3.divergencesCount).toBe(1);

    // 张三 page now has 3 chapters of accumulated facts.
    const zhangSanFinal = await s3.read('entities/characters/zhang-san.md');
    expect(zhangSanFinal).toContain('[ch-1]');
    expect(zhangSanFinal).toContain('[ch-2]');
    expect(zhangSanFinal).toContain('[ch-3]');
    // Bible info preserved through all merges.
    expect(zhangSanFinal).toContain('[bible]');
    expect(wikiSchema.parseFrontmatter(zhangSanFinal).frontmatter.bible_entity_id).toBe(
      'char-zhang-san',
    );

    // 李四 page has ch-1, ch-2, ch-3 and Bible.
    const liSiFinal = await s3.read('entities/characters/li-si.md');
    expect(liSiFinal).toContain('[ch-1]');
    expect(liSiFinal).toContain('[ch-2]');
    expect(liSiFinal).toContain('[ch-3]');
    expect(liSiFinal).toContain('[bible]');

    // Divergence detected and written.
    const divergences = await s3.read('tracking/divergences-pending.md');
    expect(divergences).toContain('bible_conflict');
    expect(divergences).toContain('div-li-si-martial');
    expect(divergences).toContain('影的首领据说武功盖世');

    // Timeline accumulated across 3 chapters.
    const timeline = await s3.read('tracking/timeline.md');
    expect(timeline).toContain('张三入城');
    expect(timeline).toContain('影组织地下密室');
    expect(timeline).toContain('揭露李四为影首领');

    // Foreshadowing accumulated.
    const foreshadowing = await s3.read('tracking/foreshadowing.md');
    expect(foreshadowing).toContain('李四为何等候张三');
    expect(foreshadowing).toContain('李四左臂的伤疤');

    // Loose thread resolved.
    const looseThreads = await s3.read('tracking/loose-threads.md');
    expect(looseThreads).toContain('已解决');

    // Chapter index has all 3 chapters.
    const chapterIndex = await s3.read('index/chapters.md');
    expect(chapterIndex).toContain('[[chapters/ch-1]]');
    expect(chapterIndex).toContain('[[chapters/ch-2]]');
    expect(chapterIndex).toContain('[[chapters/ch-3]]');

    // Root index reflects 3 chapters ingested.
    const rootIndex = await s3.read('index/_root.md');
    expect(rootIndex).toContain('last_ingest_chapter: 3');

    // History has 3 entries.
    const history = await s3.readHistory();
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.run_id).sort()).toEqual(['run-1', 'run-2', 'run-3']);

    // ── Bible-Wiki linkage: resolveLink by bible_entity_id ──
    await expect(s3.resolveLink('char-zhang-san')).resolves.toBe(
      'entities/characters/zhang-san.md',
    );
    await expect(s3.resolveLink('char-li-si')).resolves.toBe('entities/characters/li-si.md');

    // ── Prose sample injection with accumulated context ──
    const proseSampler = new ProseSampler({
      async listChapters() {
        return [
          {
            id: 'chapter-1',
            chapterRootId: 'root-1',
            version: 1,
            order: 1,
            title: '雨夜入城',
            content: chapters['chapter-1'].content,
            status: 'final',
          },
          {
            id: 'chapter-2',
            chapterRootId: 'root-2',
            version: 1,
            order: 2,
            title: '影之组织',
            content: chapters['chapter-2'].content,
            status: 'final',
          },
          {
            id: 'chapter-3',
            chapterRootId: 'root-3',
            version: 1,
            order: 3,
            title: '首领真身',
            content: chapters['chapter-3'].content,
            status: 'final',
          },
        ];
      },
    });

    // Second FakeRouter for QueryNavigator (2-step: categories then pages).
    const queryRouter = new FakeRouter([
      JSON.stringify({ categories: ['characters', 'organizations', 'chapters', 'tracking'] }),
      JSON.stringify({
        pages: [
          { path: 'characters/zhang-san', category: 'characters', reason: '主角' },
          { path: 'characters/li-si', category: 'characters', reason: '核心关系' },
          { path: 'organizations/ying', category: 'organizations', reason: '关键组织' },
          { path: 'chapters/ch-3', category: 'chapters', reason: '最近章节' },
        ],
      }),
    ]);

    const navigator = new QueryNavigator({
      wikiStoreFactory,
      proseSampler,
      router: queryRouter,
      prompts: { render: () => 'prompt' },
    });

    const ctx = await navigator.query({
      bookId: 'book-1',
      context: {
        task: 'writing.first-draft',
        scene_brief: '张三与李四对决',
        characters: ['张三', '李四'],
        chapter_number: 4,
      },
    });

    // Prose samples from recent chapters injected.
    expect(ctx.blocks.prose.length).toBeGreaterThan(0);
    const proseTexts = ctx.blocks.prose.map((p) => p.text).join(' ');
    expect(proseTexts).toContain('李四');

    // Wiki blocks include accumulated entity knowledge across all 3 chapters.
    const wikiChars = ctx.blocks.wiki.characters ?? [];
    expect(wikiChars.length).toBeGreaterThan(0);
    const wikiCharContent = wikiChars.map((c) => c.content).join(' ');
    expect(wikiCharContent).toContain('游侠');
    expect(wikiCharContent).toContain('影');

    // Divergence surfaced to writing context.
    expect(ctx.blocks.divergences.length).toBe(1);
    expect(ctx.blocks.divergences[0].kind).toBe('bible_conflict');
    expect(ctx.blocks.divergences[0].new_observation).toContain('影的首领');

    // Assembled context contains all three layers.
    expect(ctx.assembled_context).toContain('MemoryWiki 上下文');
    expect(ctx.assembled_context).toContain('原文样本');
    expect(ctx.assembled_context).toContain('Bible/Wiki 分歧告警');
  });
});

// ── WikiStore: frontmatter patching ────────────────────────────────────

describe('WikiStore frontmatter ops', () => {
  it('patchFrontmatter updates only frontmatter, body intact', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();

    const pagePath = 'entities/characters/test-char.md';
    const original = [
      '---',
      'title: "测试角色"',
      'slug: "test-char"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '## 背景',
      '这是一段正文内容。',
    ].join('\n');
    await store.write(pagePath, original);

    await store.patchFrontmatter(pagePath, {
      bible_entity_id: 'test-entity-id-123',
      updated_at: '2026-05-05T12:00:00.000Z',
    });

    const raw = await store.read(pagePath);
    expect(raw).toContain('bible_entity_id: test-entity-id-123');
    expect(raw).toContain("updated_at: '2026-05-05T12:00:00.000Z'");
    expect(raw).toContain('这是一段正文内容。');
    expect(raw).toContain('title: 测试角色');
  });

  it('patchFrontmatter can remove a key by setting it to null', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();

    const pagePath = 'entities/characters/mounted.md';
    const original = [
      '---',
      'title: "已挂载角色"',
      'slug: "mounted"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      'bible_entity_id: "old-id"',
      '---',
      '',
      '# 已挂载角色',
    ].join('\n');
    await store.write(pagePath, original);

    await store.patchFrontmatter(pagePath, { bible_entity_id: null });

    const raw = await store.read(pagePath);
    expect(raw).not.toContain('bible_entity_id');
    expect(raw).toContain('# 已挂载角色');
  });

  it('findAllPagesByBibleEntityId returns all matching pages', async () => {
    const store = new WikiStore({ bookId: 'book-1', dataRoot: tmpRoot });
    await store.ensureBase();

    const entityId = 'shared-entity-id';

    await store.write('entities/characters/a.md', [
      '---',
      'title: "A"',
      'slug: "a"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      `bible_entity_id: "${entityId}"`,
      '---',
      '',
      '# A',
    ].join('\n'));

    await store.write('entities/characters/b.md', [
      '---',
      'title: "B"',
      'slug: "b"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# B',
    ].join('\n'));

    const pages = await store.findAllPagesByBibleEntityId(entityId);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe('entities/characters/a.md');

    const empty = await store.findAllPagesByBibleEntityId('nonexistent');
    expect(empty).toHaveLength(0);
  });
});

// ── EntityMounter: mount logic ─────────────────────────────────────────

describe('EntityMounter', () => {
  it('getBibleCandidates resolves correct entity type from page_type', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    // Mock: DB returns two characters, one already mounted to another page
    mockDbRows([
      { id: 'char-1', name: '林听雪', bookId: 'book-1' },
      { id: 'char-2', name: '赵无名', bookId: 'book-1' },
    ]);

    const mounter = new EntityMounter({ wikiStoreFactory });
    const candidates = await mounter.getBibleCandidates('book-1', pagePath);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].name).toBe('林听雪');
    expect(candidates[1].name).toBe('赵无名');
    expect(candidates[0].alreadyMounted).toBe(false);
  });

  it('getBibleCandidates returns empty for non-entity page types', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'chapters/ch-1.md';
    await store.write(pagePath, [
      '---',
      'title: "第一章"',
      'slug: "ch-1"',
      'page_type: "chapter-summary"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      'chapter_number: 1',
      '---',
      '',
      '# 第一章',
    ].join('\n'));

    const mounter = new EntityMounter({ wikiStoreFactory });
    const candidates = await mounter.getBibleCandidates('book-1', pagePath);
    expect(candidates).toHaveLength(0);
  });

  it('mountToExisting rejects type mismatch', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    const mounter = new EntityMounter({ wikiStoreFactory });

    // Trying to mount a character wiki page to a location entity should fail
    await expect(
      mounter.mountToExisting('book-1', pagePath, 'locations', 'loc-1'),
    ).rejects.toThrow(MountError);

    await expect(
      mounter.mountToExisting('book-1', pagePath, 'locations', 'loc-1'),
    ).rejects.toMatchObject({ code: 'TYPE_MISMATCH' });
  });

  it('mountToExisting rejects already-mounted entity', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    // Create a wiki page that is already mounted to char-1
    const otherPage = 'entities/characters/other.md';
    await store.write(otherPage, [
      '---',
      'title: "其他角色"',
      'slug: "other"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      'bible_entity_id: "char-1"',
      '---',
      '',
      '# 其他角色',
    ].join('\n'));

    // Create the target page
    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    // Mock DB: char-1 exists
    mockDbRows([{ id: 'char-1', name: '林听雪', bookId: 'book-1' }]);

    const mounter = new EntityMounter({ wikiStoreFactory });

    // char-1 is already mounted to `other` page, so mounting hero to it should fail
    await expect(
      mounter.mountToExisting('book-1', pagePath, 'characters', 'char-1'),
    ).rejects.toThrow(MountError);

    await expect(
      mounter.mountToExisting('book-1', pagePath, 'characters', 'char-1'),
    ).rejects.toMatchObject({ code: 'ALREADY_MOUNTED' });
  });

  it('mountToExisting succeeds for valid mount', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    // Mock: char-2 exists and is not mounted anywhere
    mockDbRows([{ id: 'char-2', name: '赵无名', bookId: 'book-1' }]);

    const mounter = new EntityMounter({ wikiStoreFactory });
    const result = await mounter.mountToExisting('book-1', pagePath, 'characters', 'char-2');

    expect(result.ok).toBe(true);
    expect(result.bibleEntityId).toBe('char-2');
    expect(result.bibleEntityName).toBe('赵无名');
    expect(result.newlyCreated).toBe(false);

    // Verify the wiki page frontmatter was updated
    const raw = await store.read(pagePath);
    expect(raw).toContain('bible_entity_id: char-2');
    expect(raw).toContain('# 英雄');
  });

  it('mountToExisting allows self re-mount (same page, same entity)', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      'bible_entity_id: "char-2"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    mockDbRows([{ id: 'char-2', name: '赵无名', bookId: 'book-1' }]);

    const mounter = new EntityMounter({ wikiStoreFactory });
    const result = await mounter.mountToExisting('book-1', pagePath, 'characters', 'char-2');

    expect(result.ok).toBe(true);
    expect(result.bibleEntityId).toBe('char-2');
  });

  it('createAndMount creates entity and auto-mounts', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/new-hero.md';
    await store.write(pagePath, [
      '---',
      'title: "新英雄"',
      'slug: "new-hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 新英雄',
    ].join('\n'));

    mockDbInsert();

    const mounter = new EntityMounter({ wikiStoreFactory });
    const result = await mounter.createAndMount('book-1', pagePath, 'characters', {
      name: '新英雄',
    });

    expect(result.ok).toBe(true);
    expect(result.newlyCreated).toBe(true);
    expect(result.bibleEntityName).toBe('新英雄');
    expect(result.bibleEntityId).toBeTruthy();

    // Verify the wiki page was updated with the new entity id
    const raw = await store.read(pagePath);
    expect(raw).toContain(`bible_entity_id: ${result.bibleEntityId}`);
    expect(raw).toContain('# 新英雄');
  });

  it('createAndMount rejects unknown entity type', async () => {
    const wikiStoreFactory = (bookId: string) => new WikiStore({ bookId, dataRoot: tmpRoot });
    const store = wikiStoreFactory('book-1');
    await store.ensureBase();

    const pagePath = 'entities/characters/hero.md';
    await store.write(pagePath, [
      '---',
      'title: "英雄"',
      'slug: "hero"',
      'page_type: "character"',
      'updated_at: "2026-01-01T00:00:00.000Z"',
      '---',
      '',
      '# 英雄',
    ].join('\n'));

    const mounter = new EntityMounter({ wikiStoreFactory });
    await expect(
      mounter.createAndMount('book-1', pagePath, 'unknown_type', { name: 'Test' }),
    ).rejects.toThrow(MountError);
  });
});

class FakeRouter {
  constructor(private outputs: string[]) {}

  async generate() {
    const content = this.outputs.shift();
    if (!content) throw new Error('No fake LLM output queued');
    return {
      content,
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  }
}
