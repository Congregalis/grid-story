import type { BibleSlice, BookCharter, ContextComposer, OutlineNode } from '@grid-story/composer';
import type { GenerateInput, ModelRouter, TaskType } from '@grid-story/llm';
import { describe, expect, it, vi } from 'vitest';
import { WritingAgent } from '../writing-agent';

describe('WritingAgent', () => {
  it('passes rewrite mode through wiki query and prompt vars', async () => {
    let composeInput:
      | {
          vars?: Record<string, string>;
        }
      | undefined;
    let queryContext: unknown;
    let generateTask: TaskType | undefined;
    let generateInput: GenerateInput | undefined;

    const composer = {
      compose(input: { vars?: Record<string, string> }) {
        composeInput = input;
        return {
          prompt: 'prompt',
          charterBlock: '',
          wikiContextBlock: '',
          promptContent: `mode=${input.vars?.rewrite_mode ?? ''}`,
        };
      },
    } as unknown as ContextComposer;

    const router = {
      generate: vi.fn(async (input: GenerateInput, task?: TaskType) => {
        generateInput = input;
        generateTask = task;
        return {
          content: '改写后正文',
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }),
    } as unknown as ModelRouter;

    const agent = new WritingAgent(composer, router, {
      async query(input: { context: unknown }) {
        queryContext = input.context;
        return {
          blocks: {
            wiki: {
              characters: [],
              locations: [],
              organizations: [],
              items: [],
              concepts: [],
              recent_summaries: [],
              global_state: null,
              loose_threads: [],
            },
            prose: [],
            divergences: [],
          },
        };
      },
    });

    const bible: BibleSlice = {
      characters: [{ id: 'char-1', name: '林雪', aliases: ['阿雪'] }],
    };
    const outline: OutlineNode[] = [];
    const charter: BookCharter = {
      worldview: null,
      era: null,
      themes: [],
      hook: null,
      pov: null,
      tone: null,
      rules: [],
      avoid: [],
    };

    const result = await agent.rewriteSection({
      bookId: 'book-1',
      selectedText: '林雪站在雪地里。',
      instruction: '改成第一人称限知视角。',
      rewriteMode: 'pov',
      contextText: '第二章正文',
      bible,
      outline,
      charter,
      chapterContext: {
        currentChapterRootId: 'chap-2',
        currentChapterNumber: 2,
        currentChapterTitle: '雪夜',
        currentContent: '第二章正文',
        previousFinalChapterNumber: 1,
        previousFinalChapterTitle: '初雪',
        previousFinalChapterContent: '第一章定稿',
      },
    });

    expect(result).toBe('改写后正文');
    expect(queryContext).toMatchObject({
      task: 'writing.rewrite',
      rewrite_mode: 'pov',
      chapter_id: 'chap-2',
      characters: ['林雪'],
    });
    expect(composeInput?.vars?.rewrite_mode).toBe('pov');
    expect(composeInput?.vars?.previous_final_chapter_content).toBe('第一章定稿');
    expect(generateTask).toBe('rewrite');
    expect(generateInput?.messages[1]?.content).toBe('mode=pov');
  });

  it('passes chapter continuity into review query and prompt vars', async () => {
    let composeInput:
      | {
          task?: string;
          vars?: Record<string, string>;
        }
      | undefined;
    let queryContext: unknown;

    const composer = {
      compose(input: { task?: string; vars?: Record<string, string> }) {
        composeInput = input;
        return {
          prompt: 'prompt',
          charterBlock: '',
          wikiContextBlock: '',
          promptContent: 'review prompt',
        };
      },
    } as unknown as ContextComposer;

    const router = {
      generate: vi.fn(async () => ({
        content: JSON.stringify({
          issues: [
            {
              dimension: 'timeline',
              severity: 'major',
              quote: '三天前',
              comment: '相对时间与上一章定稿冲突。',
              suggestion: '改为模糊时间或补明确过渡。',
            },
          ],
        }),
        usage: { inputTokens: 0, outputTokens: 0 },
      })),
    } as unknown as ModelRouter;

    const agent = new WritingAgent(composer, router, {
      async query(input: { context: unknown }) {
        queryContext = input.context;
        return {
          blocks: {
            wiki: {
              characters: [],
              locations: [],
              organizations: [],
              items: [],
              concepts: [],
              recent_summaries: [],
              global_state: null,
              loose_threads: [],
            },
            prose: [],
            divergences: [],
          },
        };
      },
    });

    const bible: BibleSlice = {
      characters: [{ id: 'char-1', name: '林雪', aliases: [] }],
    };
    const charter: BookCharter = {
      worldview: null,
      era: null,
      themes: [],
      hook: null,
      pov: null,
      tone: null,
      rules: [],
      avoid: [],
    };

    const result = await agent.reviewChapter({
      bookId: 'book-1',
      chapterContent: '林雪说三天前她还没见过那盏灯。',
      bible,
      outline: [],
      charter,
      chapterContext: {
        currentChapterRootId: 'chap-2',
        currentChapterNumber: 2,
        currentChapterTitle: '雪夜',
        currentContent: '林雪说三天前她还没见过那盏灯。',
        previousFinalChapterNumber: 1,
        previousFinalChapterTitle: '初雪',
        previousFinalChapterContent: '林雪在第一章已经见过那盏灯。',
      },
    });

    expect(result.issues[0]?.dimension).toBe('timeline');
    expect(queryContext).toMatchObject({
      task: 'writing.review',
      chapter_id: 'chap-2',
      chapter_number: 2,
      chapter_title: '雪夜',
      characters: ['林雪'],
    });
    expect(composeInput?.task).toBe('review');
    expect(composeInput?.vars?.current_editor_content).toContain('三天前');
    expect(composeInput?.vars?.previous_final_chapter_content).toContain('第一章已经见过');
  });
});
