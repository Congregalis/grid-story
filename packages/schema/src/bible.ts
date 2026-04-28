import { z } from 'zod';
import { characterSchema } from './character';
import { locationSchema } from './location';
import { organizationSchema } from './organization';
import { itemSchema } from './item';
import { timelineEventSchema } from './timeline';
import { conceptSchema } from './concept';

/** The full StoryBible for a single Book. */
export const storyBibleSchema = z.object({
  characters: z.array(characterSchema),
  locations: z.array(locationSchema),
  organizations: z.array(organizationSchema),
  items: z.array(itemSchema),
  timelineEvents: z.array(timelineEventSchema),
  concepts: z.array(conceptSchema),
}).strict();

export type StoryBible = z.infer<typeof storyBibleSchema>;

// ── Entity type label ──
export const BIBLE_ENTITIES = [
  'character',
  'location',
  'organization',
  'item',
  'timelineEvent',
  'concept',
] as const;

export type BibleEntityType = (typeof BIBLE_ENTITIES)[number];
