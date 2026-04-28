import { z } from 'zod';
import { bibleBase } from './bible-base';

export const itemSchema = bibleBase.extend({
  name: z.string().min(1),
  type: z.string(),
  description: z.string().nullable(),
  ownerId: z.string().nullable(),
  origin: z.string().nullable(),
  abilities: z.array(z.string()),
  significance: z.string().nullable(),
}).strict();

export type Item = z.infer<typeof itemSchema>;
