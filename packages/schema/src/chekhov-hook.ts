import { z } from 'zod';
import { bibleBase } from './bible-base';

export const hookType = z.enum([
  'foreshadowing',
  'debt',
  'hidden_object',
  'secret_knowledge',
  'unfulfilled_promise',
  'lurking_threat',
]);

export const hookStatus = z.enum(['planted', 'developing', 'paid_off', 'discarded']);
export const hookSource = z.enum(['author_planted', 'auto_planted_by_simulation']);

export const payoffWindowSchema = z
  .object({
    earliestChapter: z.number().int().positive(),
    latestChapter: z.number().int().positive(),
  })
  .strict()
  .refine((value) => value.latestChapter >= value.earliestChapter, {
    message: 'latestChapter must be greater than or equal to earliestChapter',
    path: ['latestChapter'],
  });

export const chekhovHookSchema = bibleBase
  .extend({
    type: hookType,
    description: z.string().min(1),
    involvedCharacters: z.array(z.string()).default([]),
    involvedEntities: z.array(z.string()).default([]),
    plantedAtChapter: z.number().int().positive(),
    plantedScene: z.string().nullable(),
    preferredPayoffWindow: payoffWindowSchema,
    urgency: z.number().min(1).max(10),
    status: hookStatus,
    paidOffAtChapter: z.number().int().positive().nullable(),
    payoffNotes: z.string().nullable(),
    source: hookSource,
  })
  .strict();

export const createChekhovHookInput = chekhovHookSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateChekhovHookInput = chekhovHookSchema
  .partial()
  .omit({ id: true, bookId: true, createdAt: true, updatedAt: true });

export type HookType = z.infer<typeof hookType>;
export type HookStatus = z.infer<typeof hookStatus>;
export type HookSource = z.infer<typeof hookSource>;
export type PayoffWindow = z.infer<typeof payoffWindowSchema>;
export type ChekhovHook = z.infer<typeof chekhovHookSchema>;
export type CreateChekhovHookInput = z.infer<typeof createChekhovHookInput>;
export type UpdateChekhovHookInput = z.infer<typeof updateChekhovHookInput>;
