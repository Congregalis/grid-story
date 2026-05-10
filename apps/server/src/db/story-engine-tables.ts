import type {
  CausalLink,
  ChekhovHook,
  DecisionResponse,
  OffscreenDriveDelta,
  OffscreenTier,
  PacingEvaluation,
  PacingScore,
  Relationship,
  SceneSimulationResult,
  SceneSimulationStatus,
  TensionTrajectoryPoint,
  TensionVector,
  WorldVariable,
  WorldVariableHistoryPoint,
  WorldVariableScalePoint,
} from '@grid-story/schema';
import { boolean, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

export const decisionProfiles = pgTable('decision_profiles', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  characterId: text('character_id').notNull(),
  archetype: text('archetype'),
  responses: jsonb('responses').$type<DecisionResponse[]>().notNull().default([]),
  hardConstraints: jsonb('hard_constraints').$type<string[]>().notNull().default([]),
  blindSpots: jsonb('blind_spots').$type<string[]>().notNull().default([]),
  growthArcHints: text('growth_arc_hints'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const drives = pgTable('drives', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  characterId: text('character_id').notNull(),
  horizon: text('horizon').notNull(),
  description: text('description').notNull(),
  goalState: text('goal_state').notNull(),
  motivation: text('motivation').notNull(),
  priority: integer('priority').notNull(),
  progress: integer('progress').notNull(),
  status: text('status').notNull(),
  blockers: jsonb('blockers').$type<string[]>().notNull().default([]),
  evolvedFrom: text('evolved_from'),
  createdChapter: integer('created_chapter'),
  resolvedChapter: integer('resolved_chapter'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const relationships = pgTable('relationships', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  fromCharacterId: text('from_character_id').notNull(),
  toCharacterId: text('to_character_id').notNull(),
  relationLabel: text('relation_label').notNull(),
  currentTension: jsonb('current_tension').$type<TensionVector>().notNull(),
  targetTrajectory: jsonb('target_trajectory')
    .$type<Relationship['targetTrajectory']>()
    .default(null),
  history: jsonb('history').$type<TensionTrajectoryPoint[]>().notNull().default([]),
  isPublicKnowledge: boolean('is_public_knowledge').notNull().default(false),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const worldVariables = pgTable('world_variables', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  scope: jsonb('scope').$type<WorldVariable['scope']>().notNull(),
  currentValue: text('current_value').notNull(),
  scale: jsonb('scale').$type<WorldVariableScalePoint[]>().notNull().default([]),
  affects: jsonb('affects').$type<string[]>().notNull().default([]),
  history: jsonb('history').$type<WorldVariableHistoryPoint[]>().notNull().default([]),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const worldVariableHistory = pgTable('world_variable_history', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  worldVariableId: text('world_variable_id').notNull(),
  chapter: integer('chapter').notNull(),
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  cause: text('cause').notNull(),
  createdAt: text('created_at').notNull(),
});

export const chekhovHooks = pgTable('chekhov_hooks', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  involvedCharacters: jsonb('involved_characters').$type<string[]>().notNull().default([]),
  involvedEntities: jsonb('involved_entities').$type<string[]>().notNull().default([]),
  plantedAtChapter: integer('planted_at_chapter').notNull(),
  plantedScene: text('planted_scene'),
  preferredPayoffWindow: jsonb('preferred_payoff_window')
    .$type<ChekhovHook['preferredPayoffWindow']>()
    .notNull(),
  urgency: integer('urgency').notNull(),
  status: text('status').notNull(),
  paidOffAtChapter: integer('paid_off_at_chapter'),
  payoffNotes: text('payoff_notes'),
  source: text('source').notNull(),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sceneSimulations = pgTable('scene_simulations', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  sceneId: text('scene_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  sceneIndex: integer('scene_index').notNull(),
  status: text('status').$type<SceneSimulationStatus>().notNull(),
  result: jsonb('result').$type<SceneSimulationResult>().notNull(),
  adoptedBranchLabel: text('adopted_branch_label'),
  rerolledFrom: text('rerolled_from'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const causalLinks = pgTable('causal_links', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  sceneSimulationId: text('scene_simulation_id'),
  fromSceneRef: text('from_scene_ref'),
  toSceneRef: text('to_scene_ref').notNull(),
  type: text('type').$type<CausalLink['type']>().notNull(),
  description: text('description').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pacingEvaluations = pgTable('pacing_evaluations', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  chapterNumber: integer('chapter_number').notNull(),
  sceneSimulationIds: jsonb('scene_simulation_ids').$type<string[]>().notNull().default([]),
  score: jsonb('score').$type<PacingScore>().notNull(),
  warning: jsonb('warning').$type<PacingEvaluation['warning']>().default(null),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const offscreenActions = pgTable('offscreen_actions', {
  id: text('id').primaryKey(),
  bookId: text('book_id').notNull(),
  chapterId: text('chapter_id').notNull(),
  characterId: text('character_id').notNull(),
  tier: text('tier').$type<OffscreenTier>().notNull(),
  summary: text('summary').notNull(),
  driveDeltas: jsonb('drive_deltas').$type<OffscreenDriveDelta[]>().notNull().default([]),
  hookIds: jsonb('hook_ids').$type<string[]>().notNull().default([]),
  createdAt: text('created_at').notNull(),
});
