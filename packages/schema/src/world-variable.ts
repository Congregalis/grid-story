import { z } from 'zod';
import { bibleBase } from './bible-base';

export const worldVariableType = z.enum([
  'economy',
  'politics',
  'season',
  'public_opinion',
  'natural',
  'tech_level',
  'custom',
]);

export const worldVariableScopeType = z.enum(['global', 'region']);

export const worldVariableScalePointSchema = z
  .object({
    label: z.string().min(1),
    severity: z.number(),
  })
  .strict();

export const worldVariableHistoryPointSchema = z
  .object({
    chapter: z.number().int().positive(),
    fromValue: z.string().min(1),
    toValue: z.string().min(1),
    cause: z.string().min(1),
  })
  .strict();

export const worldVariableSchema = bibleBase
  .extend({
    name: z.string().min(1),
    type: worldVariableType,
    scope: z
      .object({
        type: worldVariableScopeType,
        locationId: z.string().nullable(),
      })
      .strict(),
    currentValue: z.string().min(1),
    scale: z.array(worldVariableScalePointSchema).default([]),
    affects: z.array(z.string()).default([]),
    history: z.array(worldVariableHistoryPointSchema).default([]),
  })
  .strict();

export const createWorldVariableInput = worldVariableSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateWorldVariableInput = worldVariableSchema
  .partial()
  .omit({ id: true, bookId: true, createdAt: true, updatedAt: true });

export type WorldVariableType = z.infer<typeof worldVariableType>;
export type WorldVariableScopeType = z.infer<typeof worldVariableScopeType>;
export type WorldVariableScalePoint = z.infer<typeof worldVariableScalePointSchema>;
export type WorldVariableHistoryPoint = z.infer<typeof worldVariableHistoryPointSchema>;
export type WorldVariable = z.infer<typeof worldVariableSchema>;
export type CreateWorldVariableInput = z.infer<typeof createWorldVariableInput>;
export type UpdateWorldVariableInput = z.infer<typeof updateWorldVariableInput>;
