import type { ProseSample } from '@grid-story/schema';
import { desc, eq } from 'drizzle-orm';
import { chapters } from '../db/bible-tables';
import { db } from '../db/connection';

export interface ChapterTextRow {
  id: string;
  chapterRootId: string;
  title: string;
  content: string;
  version: number;
  order: number;
  status: string;
}

export interface ChapterTextSource {
  listChapters(bookId: string): Promise<ChapterTextRow[]>;
}

export interface ProseSampleRequest {
  characters?: string[];
  recentChapters?: number;
  keyScenes?: Array<number | string>;
  maxSamples?: number;
  maxCharsPerSample?: number;
}

export class DrizzleChapterTextSource implements ChapterTextSource {
  async listChapters(bookId: string): Promise<ChapterTextRow[]> {
    return db
      .select({
        id: chapters.id,
        chapterRootId: chapters.chapterRootId,
        title: chapters.title,
        content: chapters.content,
        version: chapters.version,
        order: chapters.order,
        status: chapters.status,
      })
      .from(chapters)
      .where(eq(chapters.bookId, bookId))
      .orderBy(desc(chapters.order), desc(chapters.version));
  }
}

export class ProseSampler {
  constructor(private source: ChapterTextSource = new DrizzleChapterTextSource()) {}

  async sample(bookId: string, request: ProseSampleRequest): Promise<ProseSample[]> {
    const rows = await this.source.listChapters(bookId);
    const chaptersByRoot = latestChapterVersions(
      rows.filter(
        (row) => (row.status === 'final' || row.status === 'published') && row.content.trim(),
      ),
    );
    const ordered = [...chaptersByRoot].sort((a, b) => b.order - a.order);
    const selected = new Map<string, { row: ChapterTextRow; span?: string; score: number }>();

    const recentCount = request.recentChapters ?? 3;
    for (const row of ordered.slice(0, recentCount)) {
      selected.set(row.id, { row, span: 'recent', score: 10_000 + row.order });
    }

    const keyChapterNumbers = new Set(
      (request.keyScenes ?? []).map(parseChapterNumber).filter((n): n is number => n !== null),
    );
    for (const row of ordered) {
      if (keyChapterNumbers.has(row.order)) {
        selected.set(row.id, { row, span: 'key-scene', score: 20_000 + row.order });
      }
    }

    const characters = (request.characters ?? []).map((name) => name.trim()).filter(Boolean);
    for (const row of ordered) {
      const matched = characters.find(
        (name) => row.title.includes(name) || row.content.includes(name),
      );
      if (matched) {
        selected.set(row.id, { row, span: `character:${matched}`, score: 30_000 + row.order });
      }
    }

    return [...selected.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, request.maxSamples ?? 8)
      .map(({ row, span }) => ({
        chapter_id: row.id,
        chapter_number: row.order,
        title: row.title,
        span,
        text: excerpt(row.content, request.maxCharsPerSample ?? 1200, span),
      }));
  }
}

function latestChapterVersions(rows: ChapterTextRow[]): ChapterTextRow[] {
  const latest = new Map<string, ChapterTextRow>();
  for (const row of rows) {
    const current = latest.get(row.chapterRootId);
    if (!current || row.version > current.version) {
      latest.set(row.chapterRootId, row);
    }
  }
  return [...latest.values()];
}

function parseChapterNumber(value: number | string): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  const match = String(value).match(/ch-(\d+)|第\s*(\d+)\s*章|^(\d+)$/i);
  if (!match) return null;
  return Number(match[1] ?? match[2] ?? match[3]);
}

function excerpt(content: string, maxChars: number, span?: string): string {
  if (content.length <= maxChars) return content;

  const character = span?.startsWith('character:') ? span.slice('character:'.length) : '';
  if (character) {
    const index = content.indexOf(character);
    if (index >= 0) {
      const start = Math.max(0, index - Math.floor(maxChars / 3));
      const end = Math.min(content.length, start + maxChars);
      return content.slice(start, end);
    }
  }

  return content.slice(0, maxChars);
}
