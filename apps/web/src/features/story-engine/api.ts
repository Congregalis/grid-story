import type {
  CausalLink,
  ChekhovHook,
  ReviewIssue,
  CreateDriveInput,
  CreateChekhovHookInput,
  CreateRelationshipInput,
  CreateWorldVariableInput,
  DecisionProfile,
  RerollSceneOverrides,
  DirectorDriveEditorInput,
  DirectorEventInjectorInput,
  DirectorEventInjectorResult,
  DirectorHookPlanterInput,
  DirectorPressureTunerInput,
  DirectorTensionTunerInput,
  Drive,
  OffscreenAction,
  PacingEvaluation,
  Relationship,
  SceneInitialConditions,
  SceneSimulationRecord,
  SceneSimulationResult,
  UpdateChekhovHookInput,
  UpdateDriveInput,
  UpdateRelationshipInput,
  UpdateWorldVariableInput,
  WorldVariable,
} from '@grid-story/schema';
import { api } from '../../lib/api';

export type SimulateSceneInput = Omit<SceneInitialConditions, 'bookId'>;

export interface SimulateSceneResponse {
  simulation: SceneSimulationRecord;
  result: SceneSimulationResult;
  hijackIssues: ReviewIssue[];
  wikiWarnings: string[];
}

export interface AdoptSceneInput {
  branchLabel: string;
  narrativeOverride?: string;
}

export interface AdoptSceneResponse {
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

export interface DirectorPressureResponse {
  ok: boolean;
  worldVariable: WorldVariable;
}

export interface DirectorDriveResponse {
  ok: boolean;
  action: 'created' | 'updated';
  drive: Drive;
}

export interface DirectorTensionResponse {
  ok: boolean;
  relationship: Relationship;
}

export interface DirectorHookResponse {
  ok: boolean;
  hook: ChekhovHook;
}

export const storyEngineApi = {
  listDecisionProfiles: (bookId: string) =>
    api.get<DecisionProfile[]>(`/books/${encodeURIComponent(bookId)}/decision-profiles`),
  getDecisionProfile: (bookId: string, characterId: string) =>
    api.get<DecisionProfile>(
      `/books/${encodeURIComponent(bookId)}/characters/${encodeURIComponent(characterId)}/decision-profile`,
    ),
  upsertDecisionProfile: (
    bookId: string,
    characterId: string,
    input: Omit<DecisionProfile, 'id' | 'bookId' | 'characterId' | 'createdAt' | 'updatedAt'>,
  ) =>
    api.put<DecisionProfile>(
      `/books/${encodeURIComponent(bookId)}/characters/${encodeURIComponent(characterId)}/decision-profile`,
      input,
    ),
  suggestDecisionProfile: (bookId: string, characterId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        archetype: string | null;
        responses: Array<{
          triggerType: string;
          defaultReaction: string;
          rationale: string;
          intensity: number;
          exceptions: string[];
        }>;
        hardConstraints: string[];
        blindSpots: string[];
        growthArcHints: string | null;
        evidence?: string;
      };
      tokenUsage: number;
    }>(
      `/books/${encodeURIComponent(bookId)}/characters/${encodeURIComponent(characterId)}/suggest-decision-profile`,
      {},
    ),
  suggestDrives: (bookId: string, characterId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        drives: Array<{
          horizon: 'short' | 'medium' | 'long';
          description: string;
          goalState: string;
          motivation: string;
          priority: number;
          progress: number;
          status: 'active';
          blockers: string[];
        }>;
        evidence?: string;
      };
      tokenUsage: number;
    }>(
      `/books/${encodeURIComponent(bookId)}/characters/${encodeURIComponent(characterId)}/suggest-drives`,
      {},
    ),
  suggestRelationships: (bookId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        relationships: Array<{
          fromCharacterId: string;
          toCharacterId: string;
          relationLabel: string;
          currentTension: { class: number; info: number; emotion: number };
          targetTrajectory: null;
          isPublicKnowledge: boolean;
          rationale?: string;
        }>;
        evidence?: string;
      };
      tokenUsage: number;
    }>(`/books/${encodeURIComponent(bookId)}/suggest-relationships`, {}),
  suggestWorldVariables: (bookId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        worldVariables: Array<{
          name: string;
          type:
            | 'economy'
            | 'politics'
            | 'season'
            | 'public_opinion'
            | 'natural'
            | 'tech_level'
            | 'custom';
          scope: { type: 'global' | 'region'; locationId: string | null };
          currentValue: string;
          scale: Array<{ label: string; severity: number }>;
          affects: string[];
          rationale?: string;
        }>;
        evidence?: string;
      };
      tokenUsage: number;
    }>(`/books/${encodeURIComponent(bookId)}/suggest-world-variables`, {}),
  suggestHooks: (bookId: string, currentChapter?: number) =>
    api.post<{
      ok: boolean;
      suggestion: {
        hooks: Array<{
          type:
            | 'foreshadowing'
            | 'debt'
            | 'hidden_object'
            | 'secret_knowledge'
            | 'unfulfilled_promise'
            | 'lurking_threat';
          description: string;
          involvedCharacters: string[];
          involvedEntities: string[];
          plantedAtChapter: number;
          plantedScene: null;
          preferredPayoffWindow: { earliestChapter: number; latestChapter: number };
          urgency: number;
          source: 'auto_planted_by_simulation';
          rationale?: string;
        }>;
        evidence?: string;
      };
      tokenUsage: number;
    }>(
      `/books/${encodeURIComponent(bookId)}/suggest-hooks${currentChapter ? `?currentChapter=${currentChapter}` : ''}`,
      {},
    ),
  suggestDriveEvolution: (bookId: string, driveId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        recommendation: 'no_change' | 'update_status' | 'spawn_new_drive';
        currentDriveUpdate: {
          newStatus: 'active' | 'achieved' | 'abandoned' | 'frustrated' | null;
          newBlockers: string[] | null;
          rationale: string;
        } | null;
        spawnedNewDrive: {
          horizon: 'short' | 'medium' | 'long';
          description: string;
          goalState: string;
          motivation: string;
          priority: number;
          progress: number;
          status: 'active';
          evolvedFrom: string;
          rationale: string;
        } | null;
        evidence?: string;
      };
      tokenUsage: number;
    }>(
      `/books/${encodeURIComponent(bookId)}/drives/${encodeURIComponent(driveId)}/suggest-evolution`,
      {},
    ),
  listDrives: (bookId: string) => api.get<Drive[]>(`/books/${encodeURIComponent(bookId)}/drives`),
  createDrive: (bookId: string, input: Omit<CreateDriveInput, 'bookId'>) =>
    api.post<Drive>(`/books/${encodeURIComponent(bookId)}/drives`, input),
  updateDrive: (bookId: string, driveId: string, input: UpdateDriveInput) =>
    api.patch<Drive>(
      `/books/${encodeURIComponent(bookId)}/drives/${encodeURIComponent(driveId)}`,
      input,
    ),
  listRelationships: (bookId: string) =>
    api.get<Relationship[]>(`/books/${encodeURIComponent(bookId)}/relationships`),
  createRelationship: (bookId: string, input: Omit<CreateRelationshipInput, 'bookId'>) =>
    api.post<Relationship>(`/books/${encodeURIComponent(bookId)}/relationships`, input),
  updateRelationship: (bookId: string, relationshipId: string, input: UpdateRelationshipInput) =>
    api.patch<Relationship>(
      `/books/${encodeURIComponent(bookId)}/relationships/${encodeURIComponent(relationshipId)}`,
      input,
    ),
  listWorldVariables: (bookId: string) =>
    api.get<WorldVariable[]>(`/books/${encodeURIComponent(bookId)}/world-variables`),
  createWorldVariable: (bookId: string, input: Omit<CreateWorldVariableInput, 'bookId'>) =>
    api.post<WorldVariable>(`/books/${encodeURIComponent(bookId)}/world-variables`, input),
  updateWorldVariable: (bookId: string, variableId: string, input: UpdateWorldVariableInput) =>
    api.patch<WorldVariable>(
      `/books/${encodeURIComponent(bookId)}/world-variables/${encodeURIComponent(variableId)}`,
      input,
    ),
  createHook: (bookId: string, input: Omit<CreateChekhovHookInput, 'bookId'>) =>
    api.post<ChekhovHook>(`/books/${encodeURIComponent(bookId)}/hooks`, input),
  listHooks: (bookId: string) =>
    api.get<ChekhovHook[]>(`/books/${encodeURIComponent(bookId)}/hooks`),
  updateHook: (bookId: string, hookId: string, input: UpdateChekhovHookInput) =>
    api.patch<ChekhovHook>(
      `/books/${encodeURIComponent(bookId)}/hooks/${encodeURIComponent(hookId)}`,
      input,
    ),
  listOffscreenActions: (bookId: string, chapterId?: string) => {
    const qs = chapterId ? `?chapterId=${encodeURIComponent(chapterId)}` : '';
    return api.get<{ ok: boolean; actions: OffscreenAction[] }>(
      `/books/${encodeURIComponent(bookId)}/offscreen-actions${qs}`,
    );
  },
  runOffscreenTicker: (bookId: string, chapterId: string, force = false) =>
    api.post<{
      ok: boolean;
      skipped: boolean;
      reason?: string;
      actions?: OffscreenAction[];
    }>(`/books/${encodeURIComponent(bookId)}/offscreen-ticker/run`, { chapterId, force }),
  listPacingTimeline: (bookId: string) =>
    api.get<{ ok: boolean; evaluations: PacingEvaluation[] }>(
      `/books/${encodeURIComponent(bookId)}/pacing-timeline`,
    ),
  injectEvent: (bookId: string, input: DirectorEventInjectorInput) =>
    api.post<DirectorEventInjectorResult>(
      `/books/${encodeURIComponent(bookId)}/director/inject-event`,
      input,
    ),
  tunePressure: (bookId: string, input: DirectorPressureTunerInput) =>
    api.post<DirectorPressureResponse>(
      `/books/${encodeURIComponent(bookId)}/director/tune-pressure`,
      input,
    ),
  editDrive: (bookId: string, input: DirectorDriveEditorInput) =>
    api.post<DirectorDriveResponse>(
      `/books/${encodeURIComponent(bookId)}/director/edit-drive`,
      input,
    ),
  tuneTension: (bookId: string, input: DirectorTensionTunerInput) =>
    api.post<DirectorTensionResponse>(
      `/books/${encodeURIComponent(bookId)}/director/tune-tension`,
      input,
    ),
  simulateScene: (bookId: string, input: SimulateSceneInput) =>
    api.post<SimulateSceneResponse>(
      `/books/${encodeURIComponent(bookId)}/scenes/simulate`,
      input,
    ),
  adoptScene: (bookId: string, simulationId: string, input: AdoptSceneInput) =>
    api.post<AdoptSceneResponse>(
      `/books/${encodeURIComponent(bookId)}/scenes/${encodeURIComponent(simulationId)}/adopt`,
      input,
    ),
  rerollScene: (bookId: string, simulationId: string, overrides: RerollSceneOverrides = {}) =>
    api.post<SimulateSceneResponse>(
      `/books/${encodeURIComponent(bookId)}/scenes/${encodeURIComponent(simulationId)}/reroll`,
      overrides,
    ),
  suggestNextScene: (bookId: string, chapterId: string) =>
    api.post<{
      ok: boolean;
      suggestion: {
        presentCharacterIds: string[];
        locationId: string | null;
        timeContext: string;
        pressureSources: SceneInitialConditions['pressureSources'];
        authorConstraints: string[] | null;
        alternativeCount: number;
      };
      shouldEndChapter: boolean;
      reasoning: string;
      tokenUsage: number;
    }>(
      `/books/${encodeURIComponent(bookId)}/scenes/suggest-next?chapterId=${encodeURIComponent(chapterId)}`,
      {},
    ),
  listCausalGraph: (bookId: string) =>
    api.get<{ ok: boolean; links: CausalLink[] }>(
      `/books/${encodeURIComponent(bookId)}/causal-graph`,
    ),
  causalImpact: (bookId: string, changedScene: string) =>
    api.get<{
      ok: boolean;
      changedScene: string;
      impacted: Array<{
        sceneRef: string;
        distance: number;
        via: { from: string; type: string; description: string };
      }>;
    }>(
      `/books/${encodeURIComponent(bookId)}/causal-graph/impact?changedScene=${encodeURIComponent(changedScene)}`,
    ),
  plantHook: (bookId: string, input: DirectorHookPlanterInput) =>
    api.post<DirectorHookResponse>(
      `/books/${encodeURIComponent(bookId)}/director/plant-hook`,
      input,
    ),
};
