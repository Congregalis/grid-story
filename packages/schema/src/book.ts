import { z } from 'zod';

export const bookStatus = z.enum(['planning', 'writing', 'completed', 'hiatus']);
export const engineMode = z.enum(['scripted', 'simulation']);

export const bookSchema = z
  .object({
    id: z.string(),
    title: z.string().min(1),
    author: z.string(),
    genre: z.string(),
    style: z.string(),
    targetWordCount: z.number().int().positive().nullable(),
    status: bookStatus,
    engineMode: engineMode.default('scripted'),
    worldview: z.string().nullable(),
    era: z.string().nullable(),
    themes: z.array(z.string()),
    hook: z.string().nullable(),
    pov: z.string().nullable(),
    tone: z.string().nullable(),
    rules: z.array(z.string()),
    avoid: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    notes: z.string().nullable(),
  })
  .strict();

export const createBookInput = bookSchema
  .extend({ id: z.string().optional() })
  .omit({ createdAt: true, updatedAt: true });
export const updateBookInput = bookSchema
  .partial()
  .omit({ id: true, createdAt: true, updatedAt: true });

export type Book = z.infer<typeof bookSchema>;
export type BookStatus = z.infer<typeof bookStatus>;
export type EngineMode = z.infer<typeof engineMode>;
export type CreateBookInput = z.infer<typeof createBookInput>;
export type UpdateBookInput = z.infer<typeof updateBookInput>;
