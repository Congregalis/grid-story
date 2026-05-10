import { z } from 'zod';
import { bibleBase } from './bible-base';

export const decisionTriggerType = z.enum([
  'humiliation',
  'betrayal',
  'opportunity',
  'threat',
  'temptation',
  'request_for_help',
  'authority',
  'weak_target',
  'unknown_info',
  'public_eye',
]);

export const decisionResponseSchema = z
  .object({
    triggerType: decisionTriggerType,
    defaultReaction: z.string().min(1),
    rationale: z.string().min(1),
    intensity: z.number().min(1).max(10),
    exceptions: z.array(z.string()).default([]),
  })
  .strict();

export const decisionProfileSchema = bibleBase
  .extend({
    characterId: z.string().min(1),
    archetype: z.string().nullable(),
    responses: z.array(decisionResponseSchema).default([]),
    hardConstraints: z.array(z.string()).default([]),
    blindSpots: z.array(z.string()).default([]),
    growthArcHints: z.string().nullable(),
  })
  .strict();

export const createDecisionProfileInput = decisionProfileSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDecisionProfileInput = decisionProfileSchema
  .partial()
  .omit({ id: true, bookId: true, characterId: true, createdAt: true, updatedAt: true });

export type DecisionTriggerType = z.infer<typeof decisionTriggerType>;
export type DecisionResponse = z.infer<typeof decisionResponseSchema>;
export type DecisionProfile = z.infer<typeof decisionProfileSchema>;
export type CreateDecisionProfileInput = z.infer<typeof createDecisionProfileInput>;
export type UpdateDecisionProfileInput = z.infer<typeof updateDecisionProfileInput>;
