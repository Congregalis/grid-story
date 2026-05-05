import { z } from 'zod';
import { BIBLE_ENTITIES } from './bible';
import {
  createCharacterInput,
  createConceptInput,
  createItemInput,
  createLocationInput,
  createOrganizationInput,
  createTimelineEventInput,
} from './inputs';

const suggestionBase = {
  id: z.string().min(1),
  title: z.string().min(1),
  evidence: z.string().min(1),
  reason: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
};

export const bibleSuggestionSchema = z.discriminatedUnion('entityType', [
  z.object({
    ...suggestionBase,
    entityType: z.literal('character'),
    payload: createCharacterInput,
  }),
  z.object({
    ...suggestionBase,
    entityType: z.literal('location'),
    payload: createLocationInput,
  }),
  z.object({
    ...suggestionBase,
    entityType: z.literal('organization'),
    payload: createOrganizationInput,
  }),
  z.object({
    ...suggestionBase,
    entityType: z.literal('item'),
    payload: createItemInput,
  }),
  z.object({
    ...suggestionBase,
    entityType: z.literal('timelineEvent'),
    payload: createTimelineEventInput,
  }),
  z.object({
    ...suggestionBase,
    entityType: z.literal('concept'),
    payload: createConceptInput,
  }),
]);

export const bibleSuggestionResultSchema = z.object({
  suggestions: z.array(bibleSuggestionSchema).default([]),
});

export const bibleSuggestionEntityType = z.enum(BIBLE_ENTITIES);

export type BibleSuggestion = z.infer<typeof bibleSuggestionSchema>;
export type BibleSuggestionResult = z.infer<typeof bibleSuggestionResultSchema>;
