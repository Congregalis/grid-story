import { z } from 'zod';
import { bibleBase } from './bible-base';

export const pacingScoreSchema = z
  .object({
    conflictDensity: z.number().min(0).max(10),
    emotionalIntensity: z.number().min(0).max(10),
    informationDensity: z.number().min(0).max(10),
    recommendation: z.string().nullable(),
  })
  .strict();

export const pacingWarningSeverity = z.enum(['info', 'warning', 'critical']);

export const pacingTargetSchema = z
  .object({
    conflictTarget: z.number().min(0).max(10),
    emotionalTarget: z.number().min(0).max(10),
    informationTarget: z.number().min(0).max(10),
    hookIds: z.array(z.string()).default([]),
    paceHint: z.string().min(1),
  })
  .strict();

export const pacingEvaluationSchema = bibleBase
  .extend({
    chapterId: z.string().min(1),
    chapterNumber: z.number().int().positive(),
    sceneSimulationIds: z.array(z.string()).default([]),
    score: pacingScoreSchema,
    warning: z
      .object({
        severity: pacingWarningSeverity,
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type PacingScore = z.infer<typeof pacingScoreSchema>;
export type PacingWarningSeverity = z.infer<typeof pacingWarningSeverity>;
export type PacingTarget = z.infer<typeof pacingTargetSchema>;
export type PacingEvaluation = z.infer<typeof pacingEvaluationSchema>;
