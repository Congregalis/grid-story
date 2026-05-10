import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import type { Drive } from '@grid-story/schema';
import { fetchBibleSlice, fetchBookCharter, fetchOutlineTree } from '../db/queries';
import type { StoryEngineStore } from './store';

export interface BibleSuggesterRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

export interface BibleSuggesterPromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

interface ChapterSampleSource {
  listRecentChapterSamples(
    bookId: string,
    options?: { maxChapters?: number; maxCharsPerChapter?: number },
  ): Promise<Array<{ chapterId: string; sample: string }>>;
}

const SYSTEM_PROMPT =
  '你是 StoryBible 的建议器。只输出 JSON，不要 Markdown，不要解释。所有字段必须严格遵守输入约束。';

export class BibleSuggester {
  constructor(
    private readonly store: StoryEngineStore,
    private readonly router: BibleSuggesterRouter,
    private readonly prompts: BibleSuggesterPromptRegistry,
    private readonly chapterSampleSource?: ChapterSampleSource,
  ) {}

  async suggestDecisionProfile(input: {
    bookId: string;
    characterId: string;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const bible = await fetchBibleSlice(input.bookId);
    const character = (bible.characters ?? []).find((row) => row.id === input.characterId);
    if (!character) throw new Error(`Character not found: ${input.characterId}`);

    const samples = (await this.chapterSampleSource?.listRecentChapterSamples(input.bookId, {
      maxChapters: 5,
      maxCharsPerChapter: 1500,
    })) ?? [];

    const context = {
      character: {
        id: character.id,
        name: character.name,
        personality: character.personality ?? null,
        background: character.background ?? null,
        motivation: character.motivation ?? null,
        relationships: character.relationships ?? [],
      },
      chapterSamples: samples,
    };
    const prompt = this.prompts.render('story-engine', 'decision-profile-suggest', {
      context_json: JSON.stringify(context, null, 2),
    });

    const output = await this.router.generate(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        maxTokens: 2048,
        temperature: 0.4,
      },
      'summary',
    );

    return {
      suggestion: parseJsonStrict(output.content),
      tokenUsage: output.usage.inputTokens + output.usage.outputTokens,
    };
  }

  async suggestDrives(input: {
    bookId: string;
    characterId: string;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const [bible, charter, outline, existingDrives] = await Promise.all([
      fetchBibleSlice(input.bookId),
      fetchBookCharter(input.bookId),
      fetchOutlineTree(input.bookId),
      this.store.listDrives(input.bookId),
    ]);
    const character = (bible.characters ?? []).find((row) => row.id === input.characterId);
    if (!character) throw new Error(`Character not found: ${input.characterId}`);

    const samples = (await this.chapterSampleSource?.listRecentChapterSamples(input.bookId, {
      maxChapters: 3,
      maxCharsPerChapter: 1200,
    })) ?? [];

    const context = {
      character: {
        id: character.id,
        name: character.name,
        personality: character.personality ?? null,
        background: character.background ?? null,
        motivation: character.motivation ?? null,
        abilities: character.abilities ?? [],
        relationships: character.relationships ?? [],
      },
      bookCharter: charter,
      outline: outline.map((row) => ({
        type: row.type,
        title: row.title,
        summary: row.summary,
      })),
      existingDrives: existingDrives.filter((row) => row.characterId === input.characterId),
      chapterSamples: samples,
    };

    return this.callSuggester('drives-suggest', context, 2048);
  }

  async suggestRelationships(input: {
    bookId: string;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const [bible, charter, outline, existingRelationships] = await Promise.all([
      fetchBibleSlice(input.bookId),
      fetchBookCharter(input.bookId),
      fetchOutlineTree(input.bookId),
      this.store.listRelationships(input.bookId),
    ]);

    const characters = (bible.characters ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      personality: row.personality ?? null,
      motivation: row.motivation ?? null,
      background: row.background ?? null,
      isProtagonist: row.isProtagonist,
      relationshipsHint: row.relationships ?? [],
    }));

    const context = {
      characters,
      bookCharter: charter,
      outline: outline.map((row) => ({
        type: row.type,
        title: row.title,
        summary: row.summary,
      })),
      existingRelationships: existingRelationships.map((row) => ({
        from: row.fromCharacterId,
        to: row.toCharacterId,
        label: row.relationLabel,
      })),
    };

    return this.callSuggester('relationships-suggest', context, 2560);
  }

  async suggestWorldVariables(input: {
    bookId: string;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const [bible, charter, outline, existingWVs] = await Promise.all([
      fetchBibleSlice(input.bookId),
      fetchBookCharter(input.bookId),
      fetchOutlineTree(input.bookId),
      this.store.listWorldVariables(input.bookId),
    ]);

    const context = {
      bookCharter: charter,
      locations: (bible.locations ?? []).map((row) => ({ id: row.id, name: row.name })),
      outline: outline.map((row) => ({
        type: row.type,
        title: row.title,
        summary: row.summary,
      })),
      existingWorldVariables: existingWVs.map((row) => ({
        name: row.name,
        type: row.type,
        currentValue: row.currentValue,
      })),
    };

    return this.callSuggester('world-variables-suggest', context, 2048);
  }

  async suggestHooks(input: {
    bookId: string;
    currentChapter?: number;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const [bible, charter, outline, existingHooks] = await Promise.all([
      fetchBibleSlice(input.bookId),
      fetchBookCharter(input.bookId),
      fetchOutlineTree(input.bookId),
      this.store.listHooks(input.bookId),
    ]);

    const samples = (await this.chapterSampleSource?.listRecentChapterSamples(input.bookId, {
      maxChapters: 5,
      maxCharsPerChapter: 1500,
    })) ?? [];

    const context = {
      bookCharter: charter,
      currentChapter: input.currentChapter ?? 1,
      characters: (bible.characters ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        motivation: row.motivation ?? null,
      })),
      timelineEvents: (bible.timelineEvents ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        timestamp: row.timestamp,
      })),
      outline: outline.map((row) => ({
        type: row.type,
        title: row.title,
        summary: row.summary,
      })),
      existingHooks: existingHooks.map((row) => ({
        type: row.type,
        description: row.description,
        status: row.status,
      })),
      chapterSamples: samples,
    };

    return this.callSuggester('hooks-suggest', context, 2560);
  }

  private async callSuggester(
    task: string,
    context: unknown,
    maxTokens: number,
  ): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const prompt = this.prompts.render('story-engine', task, {
      context_json: JSON.stringify(context, null, 2),
    });

    const output = await this.router.generate(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        maxTokens,
        temperature: 0.5,
      },
      'summary',
    );

    return {
      suggestion: parseJsonStrict(output.content),
      tokenUsage: output.usage.inputTokens + output.usage.outputTokens,
    };
  }

  async suggestDriveEvolution(input: {
    bookId: string;
    driveId: string;
  }): Promise<{ suggestion: unknown; tokenUsage: number }> {
    const all = await this.store.listDrives(input.bookId);
    const drive: Drive | undefined = all.find((row) => row.id === input.driveId);
    if (!drive) throw new Error(`Drive not found: ${input.driveId}`);

    const decisionProfile = await this.store.getDecisionProfile(input.bookId, drive.characterId);
    const samples = (await this.chapterSampleSource?.listRecentChapterSamples(input.bookId, {
      maxChapters: 3,
      maxCharsPerChapter: 1200,
    })) ?? [];

    const context = {
      currentDrive: drive,
      decisionProfile,
      relatedDrives: all.filter(
        (row) => row.characterId === drive.characterId && row.id !== drive.id,
      ),
      chapterSamples: samples,
    };
    const prompt = this.prompts.render('story-engine', 'drive-evolve-suggest', {
      context_json: JSON.stringify(context, null, 2),
    });

    const output = await this.router.generate(
      {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        maxTokens: 1536,
        temperature: 0.4,
      },
      'summary',
    );

    return {
      suggestion: parseJsonStrict(output.content),
      tokenUsage: output.usage.inputTokens + output.usage.outputTokens,
    };
  }
}

function parseJsonStrict(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw);
}
