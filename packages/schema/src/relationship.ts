import { z } from 'zod';
import { bibleBase } from './bible-base';

export const tensionAxis = z.enum(['class', 'info', 'emotion']);

export const tensionVectorSchema = z
  .object({
    class: z.number().min(-10).max(10),
    info: z.number().min(-10).max(10),
    emotion: z.number().min(-10).max(10),
  })
  .strict();

export const tensionTrajectoryPointSchema = z
  .object({
    chapter: z.number().int().positive(),
    vector: tensionVectorSchema,
    trigger: z.string().min(1),
  })
  .strict();

export const relationshipTargetWaypointSchema = z
  .object({
    label: z.string().min(1),
    vector: tensionVectorSchema,
    hitAtChapter: z.number().int().positive().nullable(),
  })
  .strict();

export const relationshipTargetTrajectorySchema = z
  .object({
    description: z.string().min(1),
    waypoints: z.array(relationshipTargetWaypointSchema).default([]),
  })
  .strict();

export const relationshipSchema = bibleBase
  .extend({
    fromCharacterId: z.string().min(1),
    toCharacterId: z.string().min(1),
    relationLabel: z.string().min(1),
    currentTension: tensionVectorSchema,
    targetTrajectory: relationshipTargetTrajectorySchema.nullable(),
    history: z.array(tensionTrajectoryPointSchema).default([]),
    isPublicKnowledge: z.boolean(),
  })
  .strict();

export const createRelationshipInput = relationshipSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateRelationshipInput = relationshipSchema.partial().omit({
  id: true,
  bookId: true,
  fromCharacterId: true,
  toCharacterId: true,
  createdAt: true,
  updatedAt: true,
});

export type TensionAxis = z.infer<typeof tensionAxis>;
export type TensionVector = z.infer<typeof tensionVectorSchema>;
export type TensionTrajectoryPoint = z.infer<typeof tensionTrajectoryPointSchema>;
export type RelationshipTargetTrajectory = z.infer<typeof relationshipTargetTrajectorySchema>;
export type Relationship = z.infer<typeof relationshipSchema>;
export type CreateRelationshipInput = z.infer<typeof createRelationshipInput>;
export type UpdateRelationshipInput = z.infer<typeof updateRelationshipInput>;
