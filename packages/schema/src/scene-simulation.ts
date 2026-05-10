import { z } from 'zod';
import { bibleBase } from './bible-base';
import { chekhovHookSchema } from './chekhov-hook';
import { driveSchema, driveStatus } from './drive';
import { pacingScoreSchema } from './pacing';
import { tensionAxis } from './relationship';

export const simulationMode = z.enum(['group', 'multi-agent']);

export const scenePressureSourceSchema = z
  .object({
    type: z.enum(['author_event', 'world_variable_shift', 'hook_payoff', 'driven_by_npc']),
    description: z.string().min(1),
    sourceId: z.string().nullable(),
  })
  .strict();

export const sceneInitialConditionsSchema = z
  .object({
    bookId: z.string().min(1),
    chapterId: z.string().min(1),
    sceneIndex: z.number().int().min(0),
    presentCharacterIds: z.array(z.string().min(1)).min(1),
    locationId: z.string().nullable(),
    timeContext: z.string().min(1),
    pressureSources: z.array(scenePressureSourceSchema).default([]),
    authorConstraints: z.array(z.string()).nullable(),
    simulationMode: simulationMode.default('group'),
    alternativeCount: z.number().int().min(2).max(4).default(2),
  })
  .strict();

export const relationshipDeltaSchema = z
  .object({
    relationshipId: z.string().min(1),
    axis: tensionAxis,
    delta: z.number(),
    reason: z.string().min(1),
  })
  .strict();

export const driveDeltaSchema = z
  .object({
    driveId: z.string().min(1),
    progressDelta: z.number().nullable(),
    newStatus: driveStatus.nullable(),
    newBlockers: z.array(z.string()).nullable(),
    spawnedNewDrive: driveSchema.partial().nullable(),
    reason: z.string().min(1),
  })
  .strict();

export const worldVariableDeltaSchema = z
  .object({
    worldVariableId: z.string().min(1),
    newValue: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const causalLinkType = z.enum(['trigger', 'consequence', 'enabling', 'undermining']);

export const causalLinkSchema = z
  .object({
    fromSceneRef: z.string().nullable(),
    toSceneRef: z.string().min(1),
    type: causalLinkType,
    description: z.string().min(1),
  })
  .strict();

export const plantedHookSchema = chekhovHookSchema.omit({
  id: true,
  bookId: true,
  status: true,
  paidOffAtChapter: true,
  payoffNotes: true,
  createdAt: true,
  updatedAt: true,
});

export const sceneStateDeltaSchema = z
  .object({
    relationships: z.array(relationshipDeltaSchema).default([]),
    drives: z.array(driveDeltaSchema).default([]),
    worldVariables: z.array(worldVariableDeltaSchema).default([]),
    plantedHooks: z.array(plantedHookSchema).default([]),
    paidOffHooks: z
      .array(
        z
          .object({
            hookId: z.string().min(1),
            payoffNotes: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    causalLinks: z.array(causalLinkSchema).default([]),
  })
  .strict();

export const characterChoiceJustificationSchema = z
  .object({
    characterId: z.string().min(1),
    choiceSummary: z.string().min(1),
    decisionProfileMatchScore: z.number().min(0).max(10),
    rationale: z.string().min(1),
  })
  .strict();

export const sceneBranchSchema = z
  .object({
    branchLabel: z.string().min(1),
    narrative: z.string().min(1),
    stateDelta: sceneStateDeltaSchema,
    characterChoiceJustifications: z.array(characterChoiceJustificationSchema).min(1),
  })
  .strict();

export const sceneSimulationResultSchema = z
  .object({
    sceneId: z.string().min(1),
    initialConditions: sceneInitialConditionsSchema,
    primaryBranch: sceneBranchSchema,
    alternativeBranches: z.array(sceneBranchSchema).min(2),
    pacingScore: pacingScoreSchema,
    modelUsed: z.string().min(1),
    costTokens: z.number().int().nonnegative(),
  })
  .strict();

export const sceneSimulationStatus = z.enum([
  'pending_author_review',
  'adopted',
  'rejected',
  'rerolled',
]);

export const sceneSimulationRecordSchema = bibleBase
  .extend({
    sceneId: z.string().min(1),
    chapterId: z.string().min(1),
    sceneIndex: z.number().int().min(0),
    status: sceneSimulationStatus,
    result: sceneSimulationResultSchema,
    adoptedBranchLabel: z.string().nullable(),
    rerolledFrom: z.string().nullable().default(null),
  })
  .strict();

export const rerollSceneOverridesSchema = z
  .object({
    pressureSources: z.array(scenePressureSourceSchema).optional(),
    authorConstraints: z.array(z.string()).nullable().optional(),
    simulationMode: simulationMode.optional(),
    alternativeCount: z.number().int().min(2).max(4).optional(),
    timeContext: z.string().min(1).optional(),
  })
  .strict();

export type SimulationMode = z.infer<typeof simulationMode>;
export type ScenePressureSource = z.infer<typeof scenePressureSourceSchema>;
export type SceneInitialConditions = z.infer<typeof sceneInitialConditionsSchema>;
export type RelationshipDelta = z.infer<typeof relationshipDeltaSchema>;
export type DriveDelta = z.infer<typeof driveDeltaSchema>;
export type WorldVariableDelta = z.infer<typeof worldVariableDeltaSchema>;
export type CausalLinkType = z.infer<typeof causalLinkType>;
export type CausalLink = z.infer<typeof causalLinkSchema>;
export type SceneStateDelta = z.infer<typeof sceneStateDeltaSchema>;
export type CharacterChoiceJustification = z.infer<typeof characterChoiceJustificationSchema>;
export type SceneBranch = z.infer<typeof sceneBranchSchema>;
export type SceneSimulationResult = z.infer<typeof sceneSimulationResultSchema>;
export type SceneSimulationStatus = z.infer<typeof sceneSimulationStatus>;
export type SceneSimulationRecord = z.infer<typeof sceneSimulationRecordSchema>;
export type RerollSceneOverrides = z.infer<typeof rerollSceneOverridesSchema>;
