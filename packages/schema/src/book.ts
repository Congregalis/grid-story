import { z } from 'zod';

export const bookStatus = z.enum(['planning', 'writing', 'completed', 'hiatus']);

export const bookSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  author: z.string(),
  genre: z.string(),
  style: z.string(),
  targetWordCount: z.number().int().positive().nullable(),
  status: bookStatus,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().nullable(),
}).strict();

export const createBookInput = bookSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateBookInput = bookSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export type Book = z.infer<typeof bookSchema>;
export type BookStatus = z.infer<typeof bookStatus>;
export type CreateBookInput = z.infer<typeof createBookInput>;
export type UpdateBookInput = z.infer<typeof updateBookInput>;
