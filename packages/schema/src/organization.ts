import { z } from 'zod';
import { bibleBase } from './bible-base';

export const organizationSchema = bibleBase.extend({
  name: z.string().min(1),
  type: z.string(),
  description: z.string().nullable(),
  leaderId: z.string().nullable(),
  memberIds: z.array(z.string()),
  goals: z.string().nullable(),
  structure: z.string().nullable(),
  locationId: z.string().nullable(),
}).strict();

export type Organization = z.infer<typeof organizationSchema>;
