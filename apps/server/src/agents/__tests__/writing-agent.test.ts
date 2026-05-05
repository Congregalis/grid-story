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
});
