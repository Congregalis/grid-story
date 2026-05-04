import { describe, expect, it } from 'vitest';
import {
  contextBlocksSchema,
  extractedInfoSchema,
  mergeResultSchema,
  queryCategorySelectionSchema,
  queryPageSelectionSchema,
  wikiLintModelOutputSchema,
  wikiLintResultSchema,
  wikiFrontmatterSchema,
  wikiQueryContextSchema,
} from '../index';

describe('wikiFrontmatterSchema', () => {
  it('strictly requires core fields while preserving extra frontmatter', () => {
    const result = wikiFrontmatterSchema.safeParse({
      page_type: 'character',
      slug: 'zhang-san',
      updated_at: '2026-05-04T12:00:00.000Z',
      bible_entity_id: 'entity-1',
      status: 'alive',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bible_entity_id).toBe('entity-1');
      expect(result.data.status).toBe('alive');
    }
  });

  it('rejects missing or invalid core fields', () => {
    const result = wikiFrontmatterSchema.safeParse({
      page_type: 'unknown',
      slug: 'bad',
      updated_at: 'not-a-date',
    });

    expect(result.success).toBe(false);
  });
});

describe('MemoryWiki query schemas', () => {
  it('normalizes query context and validates LLM page selections', () => {
    const context = wikiQueryContextSchema.parse({
      task: 'writing.first-draft',
      scene_brief: '张三入城。',
      characters: ['张三'],
    });

    expect(context.recentChapters).toBe(3);
    expect(context.maxPages).toBe(15);

    expect(
      queryCategorySelectionSchema.safeParse({
        categories: ['characters', 'chapters', 'tracking'],
      }).success,
    ).toBe(true);
    expect(
      queryPageSelectionSchema.safeParse({
        pages: [
          {
            path: 'entities/characters/zhang-san.md',
            category: 'characters',
            reason: '核心角色',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('MemoryWiki lint schemas', () => {
  it('accepts model issue output and full lint results', () => {
    const modelOutput = wikiLintModelOutputSchema.safeParse({
      issues: [
        {
          severity: 'warning',
          title: '角色状态冲突',
          message: '张三同时被标记为 alive 和 dead。',
          page_path: 'entities/characters/zhang-san.md',
        },
      ],
    });

    expect(modelOutput.success).toBe(true);

    const result = wikiLintResultSchema.safeParse({
      ok: true,
      skipped: false,
      reportPath: 'tracking/lint/report-20260504T120000Z.md',
      generatedAt: '2026-05-04T12:00:00.000Z',
      counts: { critical: 0, warning: 1, info: 0 },
      issues: [
        {
          id: 'lint-1',
          check: 'character_consistency',
          severity: 'warning',
          title: '角色状态冲突',
          message: '张三同时被标记为 alive 和 dead。',
          source: 'llm',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('MemoryWiki shared schemas', () => {
  it('accepts extracted info with confidence-tagged facts', () => {
    const result = extractedInfoSchema.safeParse({
      chapter_id: 'chapter-1',
      chapter_number: 1,
      summary: '张三在雨夜入城。',
      character_updates: [
        {
          slug: 'zhang-san',
          bible_entity_id: 'character-1',
          facts: [
            {
              text: '张三对雨夜有明显回避。',
              confidence: 'implied',
              source_chapter: 1,
            },
          ],
        },
      ],
      timeline_events: [
        {
          chapter_number: 1,
          event: '张三进入京都。',
          characters: ['zhang-san'],
          locations: ['jing-du'],
          confidence: 'explicit',
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.location_updates).toEqual([]);
      expect(result.data.timeline_events[0].confidence).toBe('explicit');
    }
  });

  it('accepts merge results and three-part context blocks', () => {
    const merge = mergeResultSchema.safeParse({
      merged_page: '# 张三\n- 寡言 [ch-1]',
      divergences: [
        {
          page_path: 'entities/characters/zhang-san.md',
          kind: 'bible_conflict',
          new_observation: 'ch-5 主动游过护城河',
          bible_value: '怕水',
        },
      ],
    });

    expect(merge.success).toBe(true);

    const blocks = contextBlocksSchema.safeParse({
      wiki: {
        characters: [
          {
            path: 'entities/characters/zhang-san.md',
            title: '张三',
            content: '# 张三',
          },
        ],
      },
      prose: [
        {
          chapter_id: 'chapter-1',
          chapter_number: 1,
          title: '第一章',
          text: '张三站在雨里。',
        },
      ],
      divergences: [],
    });

    expect(blocks.success).toBe(true);
  });
});
