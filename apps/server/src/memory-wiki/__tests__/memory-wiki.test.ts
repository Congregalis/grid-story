import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ChapterStore,
  type ChapterTextSource,
  IngestPipeline,
  ProseSampler,
  QueryNavigator,
  WikiSchema,
  WikiStore,
} from '../index';

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
        merged_page: page('张三', 'zhang-san', 'character', '- 张三在雨夜进入京都 [ch-1]'),
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
    await expect(store.read('tracking/timeline.md')).resolves.toContain('张三进入京都');
    await expect(store.read('tracking/foreshadowing.md')).resolves.toContain('李四为何等在城门');
    await expect(store.read('tracking/loose-threads.md')).resolves.toContain('李四的真实目的');
    await expect(store.read('tracking/divergences-pending.md')).resolves.toContain('雨夜入城');
    await expect(store.read('index/characters.md')).resolves.toContain('[[characters/zhang-san]]');

    expect(result.updatedPages).toEqual(['entities/characters/zhang-san.md']);
    expect(result.divergencesCount).toBe(1);
    expect((await store.readHistory())[0].run_id).toBe('run-1');
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
