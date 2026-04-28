import { z } from 'zod';
import { bibleBase } from './bible-base';

export const locationSchema = bibleBase.extend({
  name: z.string().min(1),
  type: z.string(),
  // hierarchical: parent location (e.g., "Palace" → "Capital City" → "Kingdom")
  parentId: z.string().nullable(),
  description: z.string().nullable(),
  atmosphere: z.string().nullable(),
  significance: z.string().nullable(),
}).strict();

export type Location = z.infer<typeof locationSchema>;
