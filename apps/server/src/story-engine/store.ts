import type {
  CausalLink,
  ChekhovHook,
  CreateChekhovHookInput,
  CreateDecisionProfileInput,
  CreateDriveInput,
  CreateRelationshipInput,
  CreateWorldVariableInput,
  DecisionProfile,
  Drive,
  DriveStatus,
  OffscreenAction,
  PacingEvaluation,
  Relationship,
  SceneBranch,
  SceneSimulationRecord,
  SceneSimulationResult,
  UpdateChekhovHookInput,
  UpdateDecisionProfileInput,
  UpdateDriveInput,
  UpdateRelationshipInput,
  UpdateWorldVariableInput,
  WorldVariable,
} from '@grid-story/schema';
import {
  chekhovHookSchema,
  decisionProfileSchema,
  driveSchema,
  offscreenActionSchema,
  pacingEvaluationSchema,
  relationshipSchema,
  sceneSimulationRecordSchema,
  worldVariableSchema,
} from '@grid-story/schema';
import { and, asc, desc, eq, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { v4 as uuidv4 } from 'uuid';
import { chapters } from '../db/bible-tables';
import { db } from '../db/connection';
import {
  causalLinks,
  chekhovHooks,
  decisionProfiles,
  drives,
  offscreenActions,
  pacingEvaluations,
  relationships,
  sceneSimulations,
  worldVariableHistory,
  worldVariables,
} from '../db/story-engine-tables';

export interface DriveFilters {
  characterId?: string;
  status?: DriveStatus;
}

export interface AdoptSceneBranchInput {
  bookId: string;
  simulationId: string;
  branchLabel: string;
  narrativeOverride?: string;
}

export interface AdoptSceneBranchResult {
  simulation: SceneSimulationRecord;
  chapter: {
    id: string;
    chapterRootId: string;
    title: string;
    content: string;
    wordCount: number;
    status: string;
  };
  applied: {
    relationships: number;
    drives: number;
    worldVariables: number;
    plantedHooks: number;
    paidOffHooks: number;
    causalLinks: number;
  };
}

export interface StoryEngineStore {
  listDecisionProfiles(bookId: string): Promise<DecisionProfile[]>;
  getDecisionProfile(bookId: string, characterId: string): Promise<DecisionProfile | null>;
  upsertDecisionProfile(
    bookId: string,
    characterId: string,
    input: Omit<CreateDecisionProfileInput, 'bookId' | 'characterId'>,
  ): Promise<DecisionProfile>;
  updateDecisionProfile(
    bookId: string,
    characterId: string,
    input: UpdateDecisionProfileInput,
  ): Promise<DecisionProfile | null>;
  deleteDecisionProfile(bookId: string, characterId: string): Promise<boolean>;

  listDrives(bookId: string, filters?: DriveFilters): Promise<Drive[]>;
  createDrive(bookId: string, input: Omit<CreateDriveInput, 'bookId'>): Promise<Drive>;
  updateDrive(bookId: string, id: string, input: UpdateDriveInput): Promise<Drive | null>;
  deleteDrive(bookId: string, id: string): Promise<boolean>;

  listRelationships(bookId: string): Promise<Relationship[]>;
  createRelationship(
    bookId: string,
    input: Omit<CreateRelationshipInput, 'bookId'>,
  ): Promise<Relationship>;
  updateRelationship(
    bookId: string,
    id: string,
    input: UpdateRelationshipInput,
  ): Promise<Relationship | null>;
  deleteRelationship(bookId: string, id: string): Promise<boolean>;
  getRelationshipHistory(bookId: string, id: string): Promise<Relationship['history'] | null>;

  listWorldVariables(bookId: string): Promise<WorldVariable[]>;
  createWorldVariable(
    bookId: string,
    input: Omit<CreateWorldVariableInput, 'bookId'>,
  ): Promise<WorldVariable>;
  updateWorldVariable(
    bookId: string,
    id: string,
    input: UpdateWorldVariableInput,
  ): Promise<WorldVariable | null>;
  deleteWorldVariable(bookId: string, id: string): Promise<boolean>;
  getWorldVariableHistory(bookId: string, id: string): Promise<WorldVariable['history'] | null>;

  listHooks(bookId: string): Promise<ChekhovHook[]>;
  createHook(bookId: string, input: Omit<CreateChekhovHookInput, 'bookId'>): Promise<ChekhovHook>;
  updateHook(
    bookId: string,
    id: string,
    input: UpdateChekhovHookInput,
  ): Promise<ChekhovHook | null>;
  deleteHook(bookId: string, id: string): Promise<boolean>;

  listCausalLinks(bookId: string): Promise<CausalLink[]>;
  getChapterNumber(bookId: string, chapterId: string): Promise<number | null>;
  saveSceneSimulation(input: {
    bookId: string;
    result: SceneSimulationResult;
    status?: SceneSimulationRecord['status'];
    rerolledFrom?: string | null;
  }): Promise<SceneSimulationRecord>;
  getSceneSimulation(bookId: string, id: string): Promise<SceneSimulationRecord | null>;
  listSceneSimulationsForChapter(
    bookId: string,
    chapterId: string,
  ): Promise<SceneSimulationRecord[]>;
  rerollSceneSimulation(input: {
    bookId: string;
    fromSimulationId: string;
    result: SceneSimulationResult;
  }): Promise<SceneSimulationRecord>;
  listPacingEvaluations(bookId: string): Promise<PacingEvaluation[]>;
  upsertPacingEvaluation(
    bookId: string,
    input: Omit<PacingEvaluation, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
  ): Promise<PacingEvaluation>;
  adoptSceneBranch(input: AdoptSceneBranchInput): Promise<AdoptSceneBranchResult>;

  listOffscreenActions(bookId: string, chapterId?: string): Promise<OffscreenAction[]>;
  appendOffscreenActions(
    bookId: string,
    inputs: Array<Omit<OffscreenAction, 'id' | 'bookId' | 'createdAt'>>,
  ): Promise<OffscreenAction[]>;
}

function now() {
  return new Date().toISOString();
}

function whereBookIdAndId(
  bookIdColumn: AnyPgColumn,
  idColumn: AnyPgColumn,
  bookId: string,
  id: string,
) {
  return and(eq(bookIdColumn, bookId), eq(idColumn, id));
}

export class DrizzleStoryEngineStore implements StoryEngineStore {
  async listDecisionProfiles(bookId: string): Promise<DecisionProfile[]> {
    const rows = await db
      .select()
      .from(decisionProfiles)
      .where(eq(decisionProfiles.bookId, bookId))
      .orderBy(asc(decisionProfiles.characterId));
    return rows.map((row) => decisionProfileSchema.parse(row));
  }

  async getDecisionProfile(bookId: string, characterId: string): Promise<DecisionProfile | null> {
    const rows = await db
      .select()
      .from(decisionProfiles)
      .where(
        and(eq(decisionProfiles.bookId, bookId), eq(decisionProfiles.characterId, characterId)),
      )
      .limit(1);
    return rows[0] ? decisionProfileSchema.parse(rows[0]) : null;
  }

  async upsertDecisionProfile(
    bookId: string,
    characterId: string,
    input: Omit<CreateDecisionProfileInput, 'bookId' | 'characterId'>,
  ): Promise<DecisionProfile> {
    const existing = await this.getDecisionProfile(bookId, characterId);
    if (existing) {
      const updated = await this.updateDecisionProfile(bookId, characterId, input);
      if (!updated) throw new Error('DecisionProfile disappeared during update');
      return updated;
    }

    const ts = now();
    const row = decisionProfileSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      characterId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(decisionProfiles).values(row);
    return row;
  }

  async updateDecisionProfile(
    bookId: string,
    characterId: string,
    input: UpdateDecisionProfileInput,
  ): Promise<DecisionProfile | null> {
    const rows = await db
      .update(decisionProfiles)
      .set({ ...input, updatedAt: now() })
      .where(
        and(eq(decisionProfiles.bookId, bookId), eq(decisionProfiles.characterId, characterId)),
      )
      .returning();
    return rows[0] ? decisionProfileSchema.parse(rows[0]) : null;
  }

  async deleteDecisionProfile(bookId: string, characterId: string): Promise<boolean> {
    const rows = await db
      .delete(decisionProfiles)
      .where(
        and(eq(decisionProfiles.bookId, bookId), eq(decisionProfiles.characterId, characterId)),
      )
      .returning({ id: decisionProfiles.id });
    return rows.length > 0;
  }

  async listDrives(bookId: string, filters: DriveFilters = {}): Promise<Drive[]> {
    const conditions: SQL[] = [eq(drives.bookId, bookId)];
    if (filters.characterId) conditions.push(eq(drives.characterId, filters.characterId));
    if (filters.status) conditions.push(eq(drives.status, filters.status));

    const rows = await db
      .select()
      .from(drives)
      .where(and(...conditions))
      .orderBy(asc(drives.characterId), asc(drives.priority));
    return rows.map((row) => driveSchema.parse(row));
  }

  async createDrive(bookId: string, input: Omit<CreateDriveInput, 'bookId'>): Promise<Drive> {
    const ts = now();
    const row = driveSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(drives).values(row);
    return row;
  }

  async updateDrive(bookId: string, id: string, input: UpdateDriveInput): Promise<Drive | null> {
    const rows = await db
      .update(drives)
      .set({ ...input, updatedAt: now() })
      .where(whereBookIdAndId(drives.bookId, drives.id, bookId, id))
      .returning();
    return rows[0] ? driveSchema.parse(rows[0]) : null;
  }

  async deleteDrive(bookId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(drives)
      .where(whereBookIdAndId(drives.bookId, drives.id, bookId, id))
      .returning({ id: drives.id });
    return rows.length > 0;
  }

  async listRelationships(bookId: string): Promise<Relationship[]> {
    const rows = await db
      .select()
      .from(relationships)
      .where(eq(relationships.bookId, bookId))
      .orderBy(asc(relationships.fromCharacterId), asc(relationships.toCharacterId));
    return rows.map((row) => relationshipSchema.parse(row));
  }

  async createRelationship(
    bookId: string,
    input: Omit<CreateRelationshipInput, 'bookId'>,
  ): Promise<Relationship> {
    const ts = now();
    const row = relationshipSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(relationships).values(row);
    return row;
  }

  async updateRelationship(
    bookId: string,
    id: string,
    input: UpdateRelationshipInput,
  ): Promise<Relationship | null> {
    const rows = await db
      .update(relationships)
      .set({ ...input, updatedAt: now() })
      .where(whereBookIdAndId(relationships.bookId, relationships.id, bookId, id))
      .returning();
    return rows[0] ? relationshipSchema.parse(rows[0]) : null;
  }

  async deleteRelationship(bookId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(relationships)
      .where(whereBookIdAndId(relationships.bookId, relationships.id, bookId, id))
      .returning({ id: relationships.id });
    return rows.length > 0;
  }

  async getRelationshipHistory(
    bookId: string,
    id: string,
  ): Promise<Relationship['history'] | null> {
    const rows = await db
      .select({ history: relationships.history })
      .from(relationships)
      .where(whereBookIdAndId(relationships.bookId, relationships.id, bookId, id))
      .limit(1);
    return rows[0]?.history ?? null;
  }

  async listWorldVariables(bookId: string): Promise<WorldVariable[]> {
    const rows = await db
      .select()
      .from(worldVariables)
      .where(eq(worldVariables.bookId, bookId))
      .orderBy(asc(worldVariables.name));
    return rows.map((row) => worldVariableSchema.parse(row));
  }

  async createWorldVariable(
    bookId: string,
    input: Omit<CreateWorldVariableInput, 'bookId'>,
  ): Promise<WorldVariable> {
    const ts = now();
    const row = worldVariableSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(worldVariables).values(row);
    return row;
  }

  async updateWorldVariable(
    bookId: string,
    id: string,
    input: UpdateWorldVariableInput,
  ): Promise<WorldVariable | null> {
    const rows = await db
      .update(worldVariables)
      .set({ ...input, updatedAt: now() })
      .where(whereBookIdAndId(worldVariables.bookId, worldVariables.id, bookId, id))
      .returning();
    return rows[0] ? worldVariableSchema.parse(rows[0]) : null;
  }

  async deleteWorldVariable(bookId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(worldVariables)
      .where(whereBookIdAndId(worldVariables.bookId, worldVariables.id, bookId, id))
      .returning({ id: worldVariables.id });
    return rows.length > 0;
  }

  async getWorldVariableHistory(
    bookId: string,
    id: string,
  ): Promise<WorldVariable['history'] | null> {
    const rows = await db
      .select({ history: worldVariables.history })
      .from(worldVariables)
      .where(whereBookIdAndId(worldVariables.bookId, worldVariables.id, bookId, id))
      .limit(1);
    return rows[0]?.history ?? null;
  }

  async listHooks(bookId: string): Promise<ChekhovHook[]> {
    const rows = await db
      .select()
      .from(chekhovHooks)
      .where(eq(chekhovHooks.bookId, bookId))
      .orderBy(asc(chekhovHooks.plantedAtChapter), asc(chekhovHooks.urgency));
    return rows.map((row) => chekhovHookSchema.parse(row));
  }

  async createHook(
    bookId: string,
    input: Omit<CreateChekhovHookInput, 'bookId'>,
  ): Promise<ChekhovHook> {
    const ts = now();
    const row = chekhovHookSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(chekhovHooks).values(row);
    return row;
  }

  async updateHook(
    bookId: string,
    id: string,
    input: UpdateChekhovHookInput,
  ): Promise<ChekhovHook | null> {
    const rows = await db
      .update(chekhovHooks)
      .set({ ...input, updatedAt: now() })
      .where(whereBookIdAndId(chekhovHooks.bookId, chekhovHooks.id, bookId, id))
      .returning();
    return rows[0] ? chekhovHookSchema.parse(rows[0]) : null;
  }

  async deleteHook(bookId: string, id: string): Promise<boolean> {
    const rows = await db
      .delete(chekhovHooks)
      .where(whereBookIdAndId(chekhovHooks.bookId, chekhovHooks.id, bookId, id))
      .returning({ id: chekhovHooks.id });
    return rows.length > 0;
  }

  async listCausalLinks(bookId: string): Promise<CausalLink[]> {
    const rows = await db.select().from(causalLinks).where(eq(causalLinks.bookId, bookId));
    return rows.map((row) => ({
      fromSceneRef: row.fromSceneRef,
      toSceneRef: row.toSceneRef,
      type: row.type,
      description: row.description,
    }));
  }

  async getChapterNumber(bookId: string, chapterId: string): Promise<number | null> {
    const rows = await db
      .select({ order: chapters.order })
      .from(chapters)
      .where(
        and(
          eq(chapters.bookId, bookId),
          or(eq(chapters.id, chapterId), eq(chapters.chapterRootId, chapterId)),
        ),
      )
      .orderBy(desc(chapters.version))
      .limit(1);
    return rows[0]?.order ?? null;
  }

  async saveSceneSimulation(input: {
    bookId: string;
    result: SceneSimulationResult;
    status?: SceneSimulationRecord['status'];
    rerolledFrom?: string | null;
  }): Promise<SceneSimulationRecord> {
    const ts = now();
    const row = sceneSimulationRecordSchema.parse({
      id: uuidv4(),
      bookId: input.bookId,
      sceneId: input.result.sceneId,
      chapterId: input.result.initialConditions.chapterId,
      sceneIndex: input.result.initialConditions.sceneIndex,
      status: input.status ?? 'pending_author_review',
      result: input.result,
      adoptedBranchLabel: null,
      rerolledFrom: input.rerolledFrom ?? null,
      notes: null,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(sceneSimulations).values(row);
    return row;
  }

  async rerollSceneSimulation(input: {
    bookId: string;
    fromSimulationId: string;
    result: SceneSimulationResult;
  }): Promise<SceneSimulationRecord> {
    return db.transaction(async (tx) => {
      const ts = now();
      const previousRows = await tx
        .select()
        .from(sceneSimulations)
        .where(
          whereBookIdAndId(
            sceneSimulations.bookId,
            sceneSimulations.id,
            input.bookId,
            input.fromSimulationId,
          ),
        )
        .limit(1);
      const previous = previousRows[0]
        ? sceneSimulationRecordSchema.parse(previousRows[0])
        : null;
      if (!previous) throw new Error(`Scene simulation not found: ${input.fromSimulationId}`);
      if (previous.status === 'adopted') {
        throw new Error('Cannot reroll an adopted simulation');
      }

      await tx
        .update(sceneSimulations)
        .set({ status: 'rerolled', updatedAt: ts })
        .where(eq(sceneSimulations.id, previous.id));

      const row = sceneSimulationRecordSchema.parse({
        id: uuidv4(),
        bookId: input.bookId,
        sceneId: input.result.sceneId,
        chapterId: input.result.initialConditions.chapterId,
        sceneIndex: input.result.initialConditions.sceneIndex,
        status: 'pending_author_review',
        result: input.result,
        adoptedBranchLabel: null,
        rerolledFrom: previous.id,
        notes: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await tx.insert(sceneSimulations).values(row);
      return row;
    });
  }

  async getSceneSimulation(bookId: string, id: string): Promise<SceneSimulationRecord | null> {
    const rows = await db
      .select()
      .from(sceneSimulations)
      .where(whereBookIdAndId(sceneSimulations.bookId, sceneSimulations.id, bookId, id))
      .limit(1);
    return rows[0] ? sceneSimulationRecordSchema.parse(rows[0]) : null;
  }

  async listSceneSimulationsForChapter(
    bookId: string,
    chapterId: string,
  ): Promise<SceneSimulationRecord[]> {
    const chapterRows = await db
      .select({
        id: chapters.id,
        chapterRootId: chapters.chapterRootId,
      })
      .from(chapters)
      .where(
        and(
          eq(chapters.bookId, bookId),
          or(eq(chapters.id, chapterId), eq(chapters.chapterRootId, chapterId)),
        ),
      )
      .limit(1);
    const refs = new Set([chapterId]);
    if (chapterRows[0]) {
      refs.add(chapterRows[0].id);
      refs.add(chapterRows[0].chapterRootId);
    }

    const rows = await db
      .select()
      .from(sceneSimulations)
      .where(
        and(
          eq(sceneSimulations.bookId, bookId),
          or(...[...refs].map((id) => eq(sceneSimulations.chapterId, id))),
        ),
      )
      .orderBy(asc(sceneSimulations.sceneIndex), asc(sceneSimulations.createdAt));
    return rows.map((row) => sceneSimulationRecordSchema.parse(row));
  }

  async listPacingEvaluations(bookId: string): Promise<PacingEvaluation[]> {
    const rows = await db
      .select()
      .from(pacingEvaluations)
      .where(eq(pacingEvaluations.bookId, bookId))
      .orderBy(asc(pacingEvaluations.chapterNumber));
    return rows.map((row) => pacingEvaluationSchema.parse(row));
  }

  async upsertPacingEvaluation(
    bookId: string,
    input: Omit<PacingEvaluation, 'id' | 'bookId' | 'createdAt' | 'updatedAt'>,
  ): Promise<PacingEvaluation> {
    const existing = await db
      .select({ id: pacingEvaluations.id, createdAt: pacingEvaluations.createdAt })
      .from(pacingEvaluations)
      .where(
        and(eq(pacingEvaluations.bookId, bookId), eq(pacingEvaluations.chapterId, input.chapterId)),
      )
      .orderBy(desc(pacingEvaluations.updatedAt))
      .limit(1);
    const ts = now();
    if (existing[0]) {
      const rows = await db
        .update(pacingEvaluations)
        .set({ ...input, updatedAt: ts })
        .where(eq(pacingEvaluations.id, existing[0].id))
        .returning();
      return pacingEvaluationSchema.parse(rows[0]);
    }

    const row = pacingEvaluationSchema.parse({
      ...input,
      id: uuidv4(),
      bookId,
      createdAt: ts,
      updatedAt: ts,
    });
    await db.insert(pacingEvaluations).values(row);
    return row;
  }

  async adoptSceneBranch(input: AdoptSceneBranchInput): Promise<AdoptSceneBranchResult> {
    return db.transaction(async (tx) => {
      const simRows = await tx
        .select()
        .from(sceneSimulations)
        .where(
          whereBookIdAndId(
            sceneSimulations.bookId,
            sceneSimulations.id,
            input.bookId,
            input.simulationId,
          ),
        )
        .limit(1);
      const simulation = simRows[0] ? sceneSimulationRecordSchema.parse(simRows[0]) : null;
      if (!simulation) throw new Error(`Scene simulation not found: ${input.simulationId}`);
      if (simulation.status === 'adopted') {
        throw new Error(`Scene simulation already adopted: ${input.simulationId}`);
      }

      const branch = selectBranch(simulation.result, input.branchLabel);
      const narrative = input.narrativeOverride?.trim() || branch.narrative;

      const chapterRows = await tx
        .select()
        .from(chapters)
        .where(
          and(
            eq(chapters.bookId, input.bookId),
            or(
              eq(chapters.chapterRootId, simulation.chapterId),
              eq(chapters.id, simulation.chapterId),
            ),
          ),
        )
        .orderBy(desc(chapters.version))
        .limit(1);
      const chapter = chapterRows[0];
      if (!chapter) throw new Error(`Chapter not found for scene: ${simulation.chapterId}`);
      if (chapter.status === 'final' || chapter.status === 'published') {
        throw new Error(`Cannot adopt into terminal chapter status: ${chapter.status}`);
      }

      const applied = {
        relationships: 0,
        drives: 0,
        worldVariables: 0,
        plantedHooks: 0,
        paidOffHooks: 0,
        causalLinks: 0,
      };
      const ts = now();

      for (const delta of branch.stateDelta.relationships) {
        const rows = await tx
          .select()
          .from(relationships)
          .where(
            whereBookIdAndId(
              relationships.bookId,
              relationships.id,
              input.bookId,
              delta.relationshipId,
            ),
          )
          .limit(1);
        const relationship = rows[0] ? relationshipSchema.parse(rows[0]) : null;
        if (!relationship) throw new Error(`Relationship not found: ${delta.relationshipId}`);
        const currentTension = {
          ...relationship.currentTension,
          [delta.axis]: clampTension(relationship.currentTension[delta.axis] + delta.delta),
        };
        await tx
          .update(relationships)
          .set({
            currentTension,
            history: [
              ...relationship.history,
              { chapter: chapter.order, vector: currentTension, trigger: delta.reason },
            ],
            updatedAt: ts,
          })
          .where(
            whereBookIdAndId(
              relationships.bookId,
              relationships.id,
              input.bookId,
              delta.relationshipId,
            ),
          );
        applied.relationships += 1;
      }

      for (const delta of branch.stateDelta.drives) {
        const rows = await tx
          .select()
          .from(drives)
          .where(whereBookIdAndId(drives.bookId, drives.id, input.bookId, delta.driveId))
          .limit(1);
        const drive = rows[0] ? driveSchema.parse(rows[0]) : null;
        if (!drive) throw new Error(`Drive not found: ${delta.driveId}`);
        await tx
          .update(drives)
          .set({
            progress:
              delta.progressDelta == null
                ? drive.progress
                : clampProgress(drive.progress + delta.progressDelta),
            status: delta.newStatus ?? drive.status,
            blockers: delta.newBlockers ?? drive.blockers,
            updatedAt: ts,
          })
          .where(whereBookIdAndId(drives.bookId, drives.id, input.bookId, delta.driveId));
        applied.drives += 1;

        if (delta.spawnedNewDrive) {
          const spawned = driveSchema.parse({
            ...delta.spawnedNewDrive,
            id: delta.spawnedNewDrive.id ?? uuidv4(),
            bookId: input.bookId,
            characterId: delta.spawnedNewDrive.characterId ?? drive.characterId,
            evolvedFrom: delta.spawnedNewDrive.evolvedFrom ?? drive.id,
            createdChapter: delta.spawnedNewDrive.createdChapter ?? chapter.order,
            resolvedChapter: delta.spawnedNewDrive.resolvedChapter ?? null,
            notes: delta.spawnedNewDrive.notes ?? null,
            createdAt: ts,
            updatedAt: ts,
          });
          await tx.insert(drives).values(spawned);
          applied.drives += 1;
        }
      }

      for (const delta of branch.stateDelta.worldVariables) {
        const rows = await tx
          .select()
          .from(worldVariables)
          .where(
            whereBookIdAndId(
              worldVariables.bookId,
              worldVariables.id,
              input.bookId,
              delta.worldVariableId,
            ),
          )
          .limit(1);
        const worldVariable = rows[0] ? worldVariableSchema.parse(rows[0]) : null;
        if (!worldVariable) throw new Error(`WorldVariable not found: ${delta.worldVariableId}`);
        const historyPoint = {
          chapter: chapter.order,
          fromValue: worldVariable.currentValue,
          toValue: delta.newValue,
          cause: delta.reason,
        };
        await tx
          .update(worldVariables)
          .set({
            currentValue: delta.newValue,
            history: [...worldVariable.history, historyPoint],
            updatedAt: ts,
          })
          .where(
            whereBookIdAndId(
              worldVariables.bookId,
              worldVariables.id,
              input.bookId,
              delta.worldVariableId,
            ),
          );
        await tx.insert(worldVariableHistory).values({
          id: uuidv4(),
          bookId: input.bookId,
          worldVariableId: delta.worldVariableId,
          chapter: historyPoint.chapter,
          fromValue: historyPoint.fromValue,
          toValue: historyPoint.toValue,
          cause: historyPoint.cause,
          createdAt: ts,
        });
        applied.worldVariables += 1;
      }

      for (const hook of branch.stateDelta.plantedHooks) {
        await tx.insert(chekhovHooks).values(
          chekhovHookSchema.parse({
            ...hook,
            id: uuidv4(),
            bookId: input.bookId,
            status: 'planted',
            paidOffAtChapter: null,
            payoffNotes: null,
            createdAt: ts,
            updatedAt: ts,
          }),
        );
        applied.plantedHooks += 1;
      }

      for (const hook of branch.stateDelta.paidOffHooks) {
        const rows = await tx
          .update(chekhovHooks)
          .set({
            status: 'paid_off',
            paidOffAtChapter: chapter.order,
            payoffNotes: hook.payoffNotes,
            updatedAt: ts,
          })
          .where(whereBookIdAndId(chekhovHooks.bookId, chekhovHooks.id, input.bookId, hook.hookId))
          .returning({ id: chekhovHooks.id });
        if (rows.length === 0) throw new Error(`ChekhovHook not found: ${hook.hookId}`);
        applied.paidOffHooks += 1;
      }

      if (branch.stateDelta.causalLinks.length > 0) {
        await tx.insert(causalLinks).values(
          branch.stateDelta.causalLinks.map((link) => ({
            id: uuidv4(),
            bookId: input.bookId,
            sceneSimulationId: simulation.id,
            fromSceneRef: link.fromSceneRef,
            toSceneRef: link.toSceneRef,
            type: link.type,
            description: link.description,
            createdAt: ts,
          })),
        );
        applied.causalLinks = branch.stateDelta.causalLinks.length;
      }

      const newContent = appendSceneNarrative(chapter.content, narrative);
      const updatedChapters = await tx
        .update(chapters)
        .set({
          content: newContent,
          wordCount: newContent.length,
          updatedAt: ts,
        })
        .where(eq(chapters.id, chapter.id))
        .returning();

      const updatedSimulations = await tx
        .update(sceneSimulations)
        .set({
          status: 'adopted',
          adoptedBranchLabel: branch.branchLabel,
          updatedAt: ts,
        })
        .where(eq(sceneSimulations.id, simulation.id))
        .returning();

      const updatedChapter = updatedChapters[0];
      return {
        simulation: sceneSimulationRecordSchema.parse(updatedSimulations[0]),
        chapter: {
          id: updatedChapter.id,
          chapterRootId: updatedChapter.chapterRootId,
          title: updatedChapter.title,
          content: updatedChapter.content,
          wordCount: updatedChapter.wordCount,
          status: updatedChapter.status,
        },
        applied,
      };
    });
  }

  async listOffscreenActions(bookId: string, chapterId?: string): Promise<OffscreenAction[]> {
    const conditions: SQL[] = [eq(offscreenActions.bookId, bookId)];
    if (chapterId) conditions.push(eq(offscreenActions.chapterId, chapterId));
    const rows = await db
      .select()
      .from(offscreenActions)
      .where(and(...conditions))
      .orderBy(asc(offscreenActions.createdAt));
    return rows.map((row) => offscreenActionSchema.parse(row));
  }

  async appendOffscreenActions(
    bookId: string,
    inputs: Array<Omit<OffscreenAction, 'id' | 'bookId' | 'createdAt'>>,
  ): Promise<OffscreenAction[]> {
    if (inputs.length === 0) return [];
    const ts = now();
    const rows = inputs.map((input) =>
      offscreenActionSchema.parse({
        ...input,
        id: uuidv4(),
        bookId,
        createdAt: ts,
      }),
    );
    await db.insert(offscreenActions).values(rows);
    return rows;
  }
}

function selectBranch(result: SceneSimulationResult, branchLabel: string): SceneBranch {
  if (branchLabel === 'primary' || branchLabel === 'primaryBranch') return result.primaryBranch;
  if (result.primaryBranch.branchLabel === branchLabel) return result.primaryBranch;
  const alternative = result.alternativeBranches.find(
    (branch) => branch.branchLabel === branchLabel,
  );
  if (!alternative) throw new Error(`Branch not found: ${branchLabel}`);
  return alternative;
}

function appendSceneNarrative(currentContent: string, narrative: string): string {
  const trimmedNarrative = narrative.trim();
  if (!currentContent.trim()) return trimmedNarrative;
  return `${currentContent.trimEnd()}\n\n${trimmedNarrative}`;
}

function clampTension(value: number): number {
  return Math.max(-10, Math.min(10, value));
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}
