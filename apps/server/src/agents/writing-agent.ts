import type { ContextComposer } from '@grid-story/composer';
import type { BibleSlice, BookCharter, OutlineNode } from '@grid-story/composer';
import type { ModelRouter } from '@grid-story/llm';

const DRAFT_SYSTEM = '你是一个专业的小说写作助手。文笔流畅、有画面感，严格遵循大纲和设定。';

interface DraftBase {
  style: string;
  pov: string;
  minWords: number;
  bookId: string;
  bible: BibleSlice;
  outline: OutlineNode[];
  charter: BookCharter;
}

interface FirstDraftInput extends DraftBase {
  sceneBrief: string;
  previousEnding?: string;
}

interface ContinueInput extends DraftBase {
  previousContent: string;
  direction: string;
}

export class WritingAgent {
  constructor(
    private composer: ContextComposer,
    private router: ModelRouter,
  ) {}

  /** Generate a first draft from a scene outline. */
  async writeFirstDraft(input: FirstDraftInput): Promise<string> {
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'first-draft',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      vars: {
        scene_brief: input.sceneBrief,
        min_words: String(input.minWords),
        pov: input.pov,
        style: input.style,
        previous_ending: input.previousEnding ?? '（无，这是第一个场景）',
      },
    });

    const result = await this.router.generate({
      messages: [
        { role: 'system', content: DRAFT_SYSTEM },
        { role: 'user', content: composed.promptContent },
      ],
      maxTokens: 8192,
    }, 'draft');

    return result.content;
  }

  /** Continue writing from a previous ending. */
  async continueWriting(input: ContinueInput): Promise<string> {
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'continue',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      vars: {
        previous_content: input.previousContent,
        direction: input.direction,
        min_words: String(input.minWords),
        pov: input.pov,
        style: input.style,
      },
    });

    const result = await this.router.generate({
      messages: [
        { role: 'system', content: DRAFT_SYSTEM },
        { role: 'user', content: composed.promptContent },
      ],
      maxTokens: 8192,
    }, 'draft');

    return result.content;
  }
}
