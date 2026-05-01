import { z } from 'zod';

const requiredText = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullable().default(null);

const starterCardBaseSchema = z.object({
  summary: requiredText,
  storyRole: optionalText,
  conflictHook: optionalText,
  connections: z.array(requiredText).default([]),
}).strict();

export const starterBibleCharacterCardSchema = starterCardBaseSchema.extend({
  name: requiredText,
  motivation: optionalText,
  contradiction: optionalText,
}).strict();

export const starterBibleLocationCardSchema = starterCardBaseSchema.extend({
  name: requiredText,
  type: requiredText,
  atmosphere: optionalText,
}).strict();

export const starterBibleOrganizationCardSchema = starterCardBaseSchema.extend({
  name: requiredText,
  type: requiredText,
  goal: optionalText,
}).strict();

export const starterBibleItemCardSchema = starterCardBaseSchema.extend({
  name: requiredText,
  type: requiredText,
  ability: optionalText,
  significance: optionalText,
}).strict();

export const starterBibleConceptCardSchema = starterCardBaseSchema.extend({
  name: requiredText,
  category: requiredText,
  rules: optionalText,
}).strict();

export const starterBibleTimelineEventCardSchema = starterCardBaseSchema.extend({
  title: requiredText,
  timestamp: optionalText,
  order: z.number().int(),
}).strict();

export const starterBibleDraftSchema = z.object({
  characters: z.array(starterBibleCharacterCardSchema).default([]),
  locations: z.array(starterBibleLocationCardSchema).default([]),
  organizations: z.array(starterBibleOrganizationCardSchema).default([]),
  items: z.array(starterBibleItemCardSchema).default([]),
  concepts: z.array(starterBibleConceptCardSchema).default([]),
  timeline_events: z.array(starterBibleTimelineEventCardSchema).default([]),
}).strict().refine(
  (draft) =>
    draft.characters.length +
      draft.locations.length +
      draft.organizations.length +
      draft.items.length +
      draft.concepts.length +
      draft.timeline_events.length >=
    8,
  { message: 'Starter Bible must contain at least 8 cards.' },
);

export type StarterBibleCharacterCard = z.infer<typeof starterBibleCharacterCardSchema>;
export type StarterBibleLocationCard = z.infer<typeof starterBibleLocationCardSchema>;
export type StarterBibleOrganizationCard = z.infer<typeof starterBibleOrganizationCardSchema>;
export type StarterBibleItemCard = z.infer<typeof starterBibleItemCardSchema>;
export type StarterBibleConceptCard = z.infer<typeof starterBibleConceptCardSchema>;
export type StarterBibleTimelineEventCard = z.infer<typeof starterBibleTimelineEventCardSchema>;
export type StarterBibleDraft = z.infer<typeof starterBibleDraftSchema>;
