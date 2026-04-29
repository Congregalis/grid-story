import { z } from 'zod';

export const chapterStatus = z.enum(['draft', 'review', 'revised', 'final', 'published']);

export const chapterSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  // All versions of the same logical chapter share this ID
  chapterRootId: z.string(),
  title: z.string(),
  content: z.string(),
  version: z.number().int().positive(),
  // Previous version this was derived from (null for v1)
  parentVersionId: z.string().nullable(),
  status: chapterStatus,
  wordCount: z.number().int().nonnegative(),
  order: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().nullable(),
}).strict();

export const createChapterInput = chapterSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateChapterInput = chapterSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export type Chapter = z.infer<typeof chapterSchema>;
export type ChapterStatus = z.infer<typeof chapterStatus>;
export type CreateChapterInput = z.infer<typeof createChapterInput>;
