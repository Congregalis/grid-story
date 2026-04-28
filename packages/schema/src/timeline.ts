import { z } from 'zod';
import { bibleBase } from './bible-base';

export const timelineEventSchema = bibleBase.extend({
  title: z.string().min(1),
  description: z.string().nullable(),
  // Flexible timestamp: "第3章", "远古时代", "2024-03-15", ISO datetime, etc.
  timestamp: z.string().nullable(),
  // Order within the timeline (for UI sorting)
  order: z.number().int(),
  relatedCharacterIds: z.array(z.string()),
  relatedLocationIds: z.array(z.string()),
  relatedEventIds: z.array(z.string()),
}).strict();

export type TimelineEvent = z.infer<typeof timelineEventSchema>;
