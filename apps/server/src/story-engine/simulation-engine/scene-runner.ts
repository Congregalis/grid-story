import type { BibleSlice } from '@grid-story/composer';
import type { GenerateInput, GenerateOutput, TaskType } from '@grid-story/llm';
import type {
  AuthorForcedChange,
  ChekhovHook,
  DecisionProfile,
  Drive,
  PacingTarget,
  Relationship,
  SceneInitialConditions,
  SceneSimulationResult,
  WorldVariable,
} from '@grid-story/schema';
import { parseSceneSimulationOutput, type SceneReferenceContext } from './output-parser';

const SIMULATION_SYSTEM = '你是一个角色驱动的小说场景模拟器。只输出 JSON，严格遵循输入 schema。';

export class MultiAgentNotImplementedError extends Error {
  readonly code = 'MULTI_AGENT_NOT_IMPLEMENTED';
  constructor() {
    super('multi-agent 模式将在 V2 提供，请使用 group 模式');
    this.name = 'MultiAgentNotImplementedError';
  }
}

export interface StoryEngineRouter {
  generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput>;
}

export interface StoryEnginePromptRegistry {
  render(agent: string, task: string, vars: Record<string, string>, version?: number): string;
}

export interface SceneRunnerInput {
  initialConditions: SceneInitialConditions;
  bible: BibleSlice;
  wikiContext: string | null;
  decisionProfiles: DecisionProfile[];
  drives: Drive[];
  relationships: Relationship[];
  worldVariables: WorldVariable[];
  candidateHooks: ChekhovHook[];
  pacingTarget: PacingTarget | null;
  authorForcedChanges?: AuthorForcedChange[];
}

export class SceneRunner {
  constructor(
    private router: StoryEngineRouter,
    private prompts: StoryEnginePromptRegistry,
  ) {}

  async run(input: SceneRunnerInput): Promise<SceneSimulationResult> {
    if (input.initialConditions.simulationMode === 'multi-agent') {
      throw new MultiAgentNotImplementedError();
    }
    const contextJson = JSON.stringify(input, null, 2);
    const prompt = this.prompts.render('story-engine', 'simulate-scene', {
      context_json: contextJson,
    });

    const output = await this.router.generate(
      {
        messages: [
          { role: 'system', content: SIMULATION_SYSTEM },
          { role: 'user', content: prompt },
        ],
        maxTokens: 16384,
        temperature: 0.8,
      },
      'draft',
    );

    const references: SceneReferenceContext = {
      relationships: input.relationships,
      drives: input.drives,
      worldVariables: input.worldVariables,
      hooks: input.candidateHooks,
    };

    return parseSceneSimulationOutput(output.content, {
      initialConditions: input.initialConditions,
      modelUsed: 'story-engine-router',
      costTokens: output.usage.inputTokens + output.usage.outputTokens,
      references,
    });
  }
}
