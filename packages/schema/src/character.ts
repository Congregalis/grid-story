import { z } from 'zod';
import { bibleBase } from './bible-base';

export const characterRelationship = z.object({
  targetId: z.string(),
  type: z.string(),
  description: z.string(),
});

export const characterSchema = bibleBase.extend({
  name: z.string().min(1),
  aliases: z.array(z.string()),
  gender: z.enum(['male', 'female', 'other']).nullable(),
  age: z.string().nullable(),
  species: z.string().nullable(),
  appearance: z.string().nullable(),
  personality: z.string().nullable(),
  background: z.string().nullable(),
  motivation: z.string().nullable(),
  abilities: z.array(z.string()),
  relationships: z.array(characterRelationship),
  // location this character is associated with
  locationId: z.string().nullable(),
  // organizations this character belongs to
  organizationIds: z.array(z.string()),
  isProtagonist: z.boolean().default(false),
  // OffscreenTicker tier — controls how detailed off-screen simulation is.
  // tier1 = detailed per-character LLM call; tier2 = batch summary; tier3 = skipped.
  importance: z.enum(['tier1', 'tier2', 'tier3']).default('tier2'),
}).strict();

export type Character = z.infer<typeof characterSchema>;
export type CharacterRelationship = z.infer<typeof characterRelationship>;
