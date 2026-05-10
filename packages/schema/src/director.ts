import { z } from 'zod';
import { hookType, payoffWindowSchema } from './chekhov-hook';
import { driveHorizon, driveStatus } from './drive';
import { tensionVectorSchema } from './relationship';
import { scenePressureSourceSchema } from './scene-simulation';

export const directorEventScope = z.enum(['character', 'location', 'global']);

export const directorEventInjectorInput = z
  .object({
    scope: directorEventScope,
    targetId: z.string().min(1).nullable().default(null),
    description: z.string().min(1),
    preset: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.scope !== 'global' && !value.targetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetId'],
        message: 'targetId is required for character/location event scope',
      });
    }
  });

export const directorEventInjectorResult = z
  .object({
    pressureSource: scenePressureSourceSchema,
    scope: directorEventScope,
    targetId: z.string().min(1).nullable(),
    description: z.string().min(1),
    preset: z.string().min(1).nullable(),
  })
  .strict();

export const directorPressureTunerInput = z
  .object({
    worldVariableId: z.string().min(1),
    toValue: z.string().min(1),
    chapter: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();

export const directorDriveEditorInput = z
  .object({
    driveId: z.string().min(1).nullable().default(null),
    characterId: z.string().min(1),
    horizon: driveHorizon.optional(),
    description: z.string().min(1).optional(),
    goalState: z.string().min(1).optional(),
    motivation: z.string().min(1).optional(),
    priority: z.number().int().min(1).max(10).optional(),
    progress: z.number().min(0).max(100).optional(),
    status: driveStatus.optional(),
    blockers: z.array(z.string().min(1)).optional(),
    evolvedFrom: z.string().min(1).nullable().optional(),
    createdChapter: z.number().int().positive().nullable().optional(),
    resolvedChapter: z.number().int().positive().nullable().optional(),
    notes: z.string().nullable().optional(),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.driveId) return;
    const requiredKeys = [
      'horizon',
      'description',
      'goalState',
      'motivation',
      'priority',
      'progress',
      'status',
    ] as const;
    for (const key of requiredKeys) {
      if (value[key] == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when creating a forced Drive`,
        });
      }
    }
  });

export const directorTensionTunerInput = z
  .object({
    relationshipId: z.string().min(1),
    currentTension: tensionVectorSchema,
    chapter: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();

export const directorHookPlanterInput = z
  .object({
    type: hookType,
    description: z.string().min(1),
    involvedCharacters: z.array(z.string().min(1)).default([]),
    involvedEntities: z.array(z.string().min(1)).default([]),
    plantedAtChapter: z.number().int().positive(),
    plantedScene: z.string().min(1).nullable().default(null),
    preferredPayoffWindow: payoffWindowSchema,
    urgency: z.number().int().min(1).max(10),
    notes: z.string().nullable().default(null),
  })
  .strict();

export const authorForcedChangeKind = z.enum([
  'drive',
  'tension',
  'world_variable',
  'hook',
]);

export const authorForcedChangeSchema = z
  .object({
    kind: authorForcedChangeKind,
    targetLabel: z.string().min(1),
    changeSummary: z.string().min(1),
    reason: z.string().min(1),
    appliedAt: z.string().min(1),
  })
  .strict();

export type AuthorForcedChangeKind = z.infer<typeof authorForcedChangeKind>;
export type AuthorForcedChange = z.infer<typeof authorForcedChangeSchema>;

export type DirectorEventScope = z.infer<typeof directorEventScope>;
export type DirectorEventInjectorInput = z.infer<typeof directorEventInjectorInput>;
export type DirectorEventInjectorResult = z.infer<typeof directorEventInjectorResult>;
export type DirectorPressureTunerInput = z.infer<typeof directorPressureTunerInput>;
export type DirectorDriveEditorInput = z.infer<typeof directorDriveEditorInput>;
export type DirectorTensionTunerInput = z.infer<typeof directorTensionTunerInput>;
export type DirectorHookPlanterInput = z.infer<typeof directorHookPlanterInput>;
