import { z } from 'zod';
import { bibleBase } from './bible-base';

export const conceptSchema = bibleBase.extend({
  name: z.string().min(1),
  category: z.string(),
  description: z.string().nullable(),
  rules: z.string().nullable(),
  examples: z.string().nullable(),
}).strict();

export type Concept = z.infer<typeof conceptSchema>;
