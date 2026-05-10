import { z } from 'zod';
import { bibleBase } from './bible-base';

export const driveHorizon = z.enum(['short', 'medium', 'long']);
export const driveStatus = z.enum(['active', 'achieved', 'abandoned', 'frustrated']);

export const driveSchema = bibleBase
  .extend({
    characterId: z.string().min(1),
    horizon: driveHorizon,
    description: z.string().min(1),
    goalState: z.string().min(1),
    motivation: z.string().min(1),
    priority: z.number().min(1).max(10),
    progress: z.number().min(0).max(100),
    status: driveStatus,
    blockers: z.array(z.string()).default([]),
    evolvedFrom: z.string().nullable(),
    createdChapter: z.number().int().positive().nullable(),
    resolvedChapter: z.number().int().positive().nullable(),
  })
  .strict();

export const createDriveInput = driveSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateDriveInput = driveSchema
  .partial()
  .omit({ id: true, bookId: true, characterId: true, createdAt: true, updatedAt: true });

export type DriveHorizon = z.infer<typeof driveHorizon>;
export type DriveStatus = z.infer<typeof driveStatus>;
export type Drive = z.infer<typeof driveSchema>;
export type CreateDriveInput = z.infer<typeof createDriveInput>;
export type UpdateDriveInput = z.infer<typeof updateDriveInput>;
