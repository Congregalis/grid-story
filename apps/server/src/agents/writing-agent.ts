import type { BibleSlice, BookCharter, ContextComposer, OutlineNode } from '@grid-story/composer';
import type { ModelRouter } from '@grid-story/llm';
import { type ContextBlocks, type ReviewResult, reviewResultSchema } from '@grid-story/schema';

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

interface ReviewInput {
  bookId: string;
  chapterContent: string;
  bible: BibleSlice;
  outline: OutlineNode[];
  charter: BookCharter;
}

interface RewriteInput {
  bookId: string;
  selectedText: string;
  instruction: string;
  contextText?: string;
  bible: BibleSlice;
  outline: OutlineNode[];
  charter: BookCharter;
}

interface AgentQueryNavigator {
  query(input: { bookId: string; context: unknown }): Promise<{ blocks: ContextBlocks }>;
}

export class WritingAgent {
  constructor(
    private composer: ContextComposer,
    private router: ModelRouter,
    private queryNavigator?: AgentQueryNavigator,
  ) {}

  /** Generate a first draft from a scene outline. */
  async writeFirstDraft(input: FirstDraftInput): Promise<string> {
    const contextText = [input.sceneBrief, input.previousEnding].filter(Boolean).join('\n');
    const wikiContext = await this.queryWikiContext(input.bookId, {
      task: 'writing.first-draft',
      scene_brief: input.sceneBrief,
      characters: mentionedBibleNames(contextText, input.bible),
      recentChapters: 3,
    });
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'first-draft',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      wikiContext,
      vars: {
        scene_brief: input.sceneBrief,
        min_words: String(input.minWords),
        pov: input.pov,
        style: input.style,
        previous_ending: input.previousEnding ?? '（无，这是第一个场景）',
      },
    });

    const result = await this.router.generate(
      {
        messages: [
          { role: 'system', content: DRAFT_SYSTEM },
          { role: 'user', content: composed.promptContent },
        ],
        maxTokens: 8192,
      },
      'draft',
    );

    return result.content;
  }

  /** Rewrite a selected section based on user instruction. */
  async rewriteSection(input: RewriteInput): Promise<string> {
    const contextText = [input.selectedText, input.instruction, input.contextText]
      .filter(Boolean)
      .join('\n');
    const wikiContext = await this.queryWikiContext(input.bookId, {
      task: 'writing.rewrite',
      selected_text: truncate(contextText, 4_000),
      characters: mentionedBibleNames(contextText, input.bible),
      recentChapters: 3,
    });
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'rewrite',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      wikiContext,
      vars: {
        selected_text: input.selectedText,
        instruction: input.instruction,
        context_text: input.contextText ?? '',
      },
    });

    const result = await this.router.generate(
      {
        messages: [
          { role: 'system', content: DRAFT_SYSTEM },
          { role: 'user', content: composed.promptContent },
        ],
        maxTokens: 4096,
      },
      'rewrite',
    );

    return result.content;
  }

  /** Continue writing from a previous ending. */
  async continueWriting(input: ContinueInput): Promise<string> {
    const contextText = [input.previousContent, input.direction].join('\n');
    const wikiContext = await this.queryWikiContext(input.bookId, {
      task: 'writing.continue',
      direction: input.direction,
      selected_text: truncate(input.previousContent, 4_000),
      characters: mentionedBibleNames(contextText, input.bible),
      recentChapters: 3,
    });
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'continue',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      wikiContext,
      vars: {
        previous_content: input.previousContent,
        direction: input.direction,
        min_words: String(input.minWords),
        pov: input.pov,
        style: input.style,
      },
    });

    const result = await this.router.generate(
      {
        messages: [
          { role: 'system', content: DRAFT_SYSTEM },
          { role: 'user', content: composed.promptContent },
        ],
        maxTokens: 8192,
      },
      'draft',
    );

    return result.content;
  }

  /** Review a chapter and return structured feedback. */
  async reviewChapter(input: ReviewInput): Promise<ReviewResult> {
    const wikiContext = await this.queryWikiContext(input.bookId, {
      task: 'writing.review',
      chapter_content: truncate(input.chapterContent, 4_000),
      characters: mentionedBibleNames(input.chapterContent, input.bible),
      recentChapters: 3,
    });
    const composed = this.composer.compose({
      agent: 'writing-agent',
      task: 'review',
      bookId: input.bookId,
      charter: input.charter,
      bible: input.bible,
      outline: input.outline,
      wikiContext,
      vars: {
        chapter_content: input.chapterContent,
      },
    });

    const result = await this.router.generate(
      {
        messages: [
          { role: 'system', content: '你是一位资深的出版级小说编辑。只输出 JSON。' },
          { role: 'user', content: composed.promptContent },
        ],
        maxTokens: 4096,
      },
      'review',
    );

    const text = result.content.trim();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : text;
    const parsed = JSON.parse(jsonText);
    return reviewResultSchema.parse(parsed);
  }

  private async queryWikiContext(
    bookId: string,
    context: Record<string, unknown>,
  ): Promise<ContextBlocks | null> {
    if (!this.queryNavigator) return null;
    try {
      const result = await this.queryNavigator.query({ bookId, context });
      return result.blocks;
    } catch (error) {
      console.error('[memory-wiki] WritingAgent query failed', {
        bookId,
        task: context.task,
        error,
      });
      return null;
    }
  }
}

function mentionedBibleNames(text: string, bible: BibleSlice): string[] {
  const names = new Set<string>();
  for (const character of bible.characters ?? []) {
    if (text.includes(character.name)) names.add(character.name);
    for (const alias of character.aliases ?? []) {
      if (text.includes(alias)) names.add(character.name);
    }
  }
  return [...names];
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}
