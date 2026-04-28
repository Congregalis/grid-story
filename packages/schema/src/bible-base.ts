import { z } from 'zod';

// Shared fields for all StoryBible entities.
export const bibleBase = z.object({
  id: z.string(),
  bookId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().nullable(),
});

export type BibleBase = z.infer<typeof bibleBase>;
