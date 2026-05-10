import {
  type ChekhovHook,
  type Drive,
  type Relationship,
  type SceneInitialConditions,
  type SceneSimulationResult,
  sceneSimulationResultSchema,
  type WorldVariable,
} from '@grid-story/schema';

export interface SceneReferenceContext {
  relationships: Relationship[];
  drives: Drive[];
  worldVariables: WorldVariable[];
  hooks: ChekhovHook[];
}

export interface ParseSceneOutputOptions {
  initialConditions: SceneInitialConditions;
  modelUsed: string;
  costTokens: number;
  references: SceneReferenceContext;
}

export function parseSceneSimulationOutput(
  text: string,
  options: ParseSceneOutputOptions,
): SceneSimulationResult {
  const json = extractJson(text);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json) as Record<string, unknown>;
  } catch (error) {
    const truncated = looksTruncated(json);
    const detail = error instanceof Error ? error.message : String(error);
    const hint = truncated
      ? '（疑似 LLM 输出被截断 → 已增大 maxTokens；若仍重现，请缩短初始条件 / 减少候选数）'
      : '';
    throw new Error(
      `LLM 输出 JSON 解析失败 ${hint}：${detail}（输出长度 ${json.length} chars）`,
    );
  }
  raw.sceneId ??= `${options.initialConditions.chapterId}:scene-${options.initialConditions.sceneIndex}`;
  raw.initialConditions = options.initialConditions;
  raw.modelUsed ??= options.modelUsed;
  raw.costTokens ??= options.costTokens;

  const result = sceneSimulationResultSchema.parse(raw);
  validateSceneReferences(result, options.references);
  return result;
}

function looksTruncated(json: string): boolean {
  const trimmed = json.trimEnd();
  if (trimmed.length === 0) return false;
  const lastChar = trimmed[trimmed.length - 1];
  // 完整闭合的 JSON 应以 } 或 ] 结尾；任何其他字符（,/"/字母/数字）几乎都是截断
  return lastChar !== '}' && lastChar !== ']';
}

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export function validateSceneReferences(
  result: SceneSimulationResult,
  references: SceneReferenceContext,
): void {
  const presentCharacters = new Set(result.initialConditions.presentCharacterIds);
  for (const branch of [result.primaryBranch, ...result.alternativeBranches]) {
    const justified = new Set(branch.characterChoiceJustifications.map((item) => item.characterId));
    for (const characterId of presentCharacters) {
      if (!justified.has(characterId)) {
        throw new Error(
          `Missing characterChoiceJustification for present character: ${characterId}`,
        );
      }
    }
    validateStateDeltaReferences(branch.stateDelta, references);
  }
}

function validateStateDeltaReferences(
  delta: SceneSimulationResult['primaryBranch']['stateDelta'],
  references: SceneReferenceContext,
): void {
  const relationshipIds = new Set(references.relationships.map((item) => item.id));
  const driveIds = new Set(references.drives.map((item) => item.id));
  const worldVariableIds = new Set(references.worldVariables.map((item) => item.id));
  const plantedHookIds = new Set(
    references.hooks.filter((item) => item.status === 'planted').map((item) => item.id),
  );

  for (const item of delta.relationships) {
    if (!relationshipIds.has(item.relationshipId)) {
      throw new Error(`Unknown relationshipId in stateDelta: ${item.relationshipId}`);
    }
  }
  for (const item of delta.drives) {
    if (!driveIds.has(item.driveId)) {
      throw new Error(`Unknown driveId in stateDelta: ${item.driveId}`);
    }
  }
  for (const item of delta.worldVariables) {
    if (!worldVariableIds.has(item.worldVariableId)) {
      throw new Error(`Unknown worldVariableId in stateDelta: ${item.worldVariableId}`);
    }
  }
  for (const item of delta.paidOffHooks) {
    if (!plantedHookIds.has(item.hookId)) {
      throw new Error(`Unknown or non-planted hookId in stateDelta: ${item.hookId}`);
    }
  }
}
