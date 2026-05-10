import { z } from 'zod';

export const offscreenTier = z.enum(['tier1', 'tier2', 'tier3']);
export type OffscreenTier = z.infer<typeof offscreenTier>;

export const offscreenDriveDeltaSchema = z
  .object({
    driveId: z.string(),
    progressDelta: z.number().int().min(-100).max(100),
    rationale: z.string().nullable().default(null),
  })
  .strict();

export const offscreenActionSchema = z
  .object({
    id: z.string(),
    bookId: z.string(),
    chapterId: z.string(),
    characterId: z.string(),
    tier: offscreenTier,
    summary: z.string().min(1),
    driveDeltas: z.array(offscreenDriveDeltaSchema).default([]),
    hookIds: z.array(z.string()).default([]),
    createdAt: z.string(),
  })
  .strict();

export type OffscreenAction = z.infer<typeof offscreenActionSchema>;
export type OffscreenDriveDelta = z.infer<typeof offscreenDriveDeltaSchema>;
