import type { BibleSlice, BookCharter, ContextComposer, OutlineNode } from '@grid-story/composer';
import type { GenerateInput, ModelRouter, TaskType } from '@grid-story/llm';
import { describe, expect, it, vi } from 'vitest';
import { BibleAgent } from '../bible-agent';

describe('BibleAgent', () => {
  it('extracts chapter setting suggestions and normalizes server-owned fields', async () => {
    let composeInput:
      | {
          task?: string;
          vars?: Record<string, string>;
        }
      | undefined;
    let generateTask: TaskType | undefined;
    let generateInput: GenerateInput | undefined;

    const composer = {
      compose(input: { task?: string; vars?: Record<string, string> }) {
        composeInput = input;
        return {
          prompt: 'prompt',
          charterBlock: '',
          wikiContextBlock: '',
          promptContent: 'suggest prompt',
        };
      },
    } as unknown as ContextComposer;

    const router = {
      generate: vi.fn(async (input: GenerateInput, task?: TaskType) => {
        generateInput = input;
        generateTask = task;
        return {
          content: JSON.stringify({
            suggestions: [
              {
                entityType: 'item',
                title: '照骨灯',
                evidence: '她把照骨灯举到雪里。',
                reason: '物品会持续影响追踪线索。',
                confidence: 'high',
                payload: {
                  id: 'llm-must-not-keep',
                  bookId: 'wrong-book',
                  name: '照骨灯',
                  type: '法器',
                  description: '能照出骨相旧伤的灯。',
                  ownerId: null,
                  origin: null,
                  abilities: ['照见旧伤'],
                  significance: '后续追踪线索。',
                  notes: null,
                },
              },
            ],
          }),
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      }),
    } as unknown as ModelRouter;

    const agent = new BibleAgent(composer, router);
    const bible: BibleSlice = { characters: [] };
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

    const result = await agent.suggestChapterSettings(
      {
        chapterTitle: '雪夜',
        chapterContent: '她把照骨灯举到雪里。',
      },
      {
        bookId: 'book-1',
        bible,
        outline,
        charter,
      },
    );

    expect(composeInput?.task).toBe('suggest-from-chapter');
    expect(composeInput?.vars?.chapter_title).toBe('雪夜');
    expect(generateTask).toBe('classification');
    expect(generateInput?.messages[1]?.content).toBe('suggest prompt');
    expect(result.suggestions).toHaveLength(1);
    const suggestion = result.suggestions[0];
    expect(suggestion?.id).toBe('item-1');
    expect(suggestion?.payload.bookId).toBe('book-1');
    expect(suggestion ? 'id' in suggestion.payload : true).toBe(false);
  });
});
