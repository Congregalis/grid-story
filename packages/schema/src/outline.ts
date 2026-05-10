import { z } from 'zod';

export const outlineType = z.enum(['arc', 'volume', 'chapter', 'scene']);
export const outlineMode = z.enum(['scripted', 'anchor-only']);

export const outlineSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  type: outlineType,
  title: z.string().min(1),
  summary: z.string().nullable(),
  parentId: z.string().nullable(),
  order: z.number().int(),
  mode: outlineMode.default('scripted'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().nullable(),
}).strict();

export const createOutlineInput = outlineSchema.omit({ id: true, createdAt: true, updatedAt: true });
export const updateOutlineInput = outlineSchema.partial().omit({ id: true, createdAt: true, updatedAt: true });

export type Outline = z.infer<typeof outlineSchema>;
export type OutlineType = z.infer<typeof outlineType>;
export type OutlineMode = z.infer<typeof outlineMode>;
export type CreateOutlineInput = z.infer<typeof createOutlineInput>;
