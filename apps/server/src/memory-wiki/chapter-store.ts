import { and, desc, eq, or } from 'drizzle-orm';
import { chapters } from '../db/bible-tables';
import { db } from '../db/connection';

export interface ChapterForIngest {
  id: string;
  bookId: string;
  title: string;
  content: string;
  order: number;
  wordCount: number;
  status: string;
}

export interface ChapterStore {
  getChapterForIngest(bookId: string, chapterId: string): Promise<ChapterForIngest | null>;
}

export class DrizzleChapterStore implements ChapterStore {
  async getChapterForIngest(bookId: string, chapterId: string): Promise<ChapterForIngest | null> {
    const rows = await db
      .select({
        id: chapters.id,
        bookId: chapters.bookId,
        title: chapters.title,
        content: chapters.content,
        order: chapters.order,
        wordCount: chapters.wordCount,
        status: chapters.status,
      })
      .from(chapters)
      .where(
        and(
          eq(chapters.bookId, bookId),
          or(eq(chapters.id, chapterId), eq(chapters.chapterRootId, chapterId)),
        ),
      )
      .orderBy(desc(chapters.version));

    if (rows.length === 0) return null;
    return rows[0];
  }
}
