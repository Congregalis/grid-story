import type { GenerateInput, GenerateOutput, ModelConfig, Provider, RouterConfig, StreamOutput, TaskType } from './types';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAICompatProvider } from './providers/openai-compat';

const DEFAULT_TASK_MODELS: Partial<Record<TaskType, ModelConfig>> = {
  draft:          { provider: 'anthropic',    modelId: 'claude-opus-4-7' },
  rewrite:        { provider: 'anthropic',    modelId: 'claude-opus-4-7' },
  review:         { provider: 'anthropic',    modelId: 'claude-opus-4-7' },
  summary:        { provider: 'anthropic',    modelId: 'claude-haiku-4-5-20251001' },
  proofread:      { provider: 'anthropic',    modelId: 'claude-haiku-4-5-20251001' },
  classification: { provider: 'anthropic',    modelId: 'claude-haiku-4-5-20251001' },
};

const KNOWN_BASE_URLS: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export class ModelRouter {
  private providers = new Map<string, Provider>();
  private taskModels: Partial<Record<TaskType, ModelConfig>>;
  private defaultModel: ModelConfig;
  private config: RouterConfig;

  constructor(config: RouterConfig) {
    this.config = config;
    this.taskModels = { ...DEFAULT_TASK_MODELS, ...config.taskModelMap };
    this.defaultModel = config.defaultModel;
  }

  /** Lazy-init a provider by name. */
  private getProvider(name: string, baseUrl?: string): Provider {
    const existing = this.providers.get(name);
    if (existing) return existing;

    const apiKey = this.config.apiKeys[name];
    if (!apiKey) throw new Error(`No API key configured for provider "${name}"`);

    let provider: Provider;
    if (name === 'anthropic') {
      provider = createAnthropicProvider(apiKey);
    } else {
      const resolvedBaseUrl = baseUrl ?? KNOWN_BASE_URLS[name] ?? 'https://api.deepseek.com/v1';
      provider = createOpenAICompatProvider(apiKey, resolvedBaseUrl);
    }

    this.providers.set(name, provider);
    return provider;
  }

  /** Resolve which ModelConfig to use for a given task. */
  resolveModel(task?: TaskType): ModelConfig {
    return (task && this.taskModels[task]) ?? this.defaultModel;
  }

  async generate(input: GenerateInput, task?: TaskType): Promise<GenerateOutput> {
    let modelCfg: ModelConfig;
    if (input.provider) {
      modelCfg = { provider: input.provider as ModelConfig['provider'], modelId: input.model ?? input.provider };
    } else {
      modelCfg = this.resolveModel(task);
    }
    const provider = this.getProvider(modelCfg.provider, modelCfg.baseUrl);
    return provider.generate({ ...input, model: modelCfg.modelId });
  }

  async generateStream(input: GenerateInput, task?: TaskType): Promise<StreamOutput> {
    let modelCfg: ModelConfig;
    if (input.provider) {
      modelCfg = { provider: input.provider as ModelConfig['provider'], modelId: input.model ?? input.provider };
    } else {
      modelCfg = this.resolveModel(task);
    }
    const provider = this.getProvider(modelCfg.provider, modelCfg.baseUrl);
    return provider.generateStream({ ...input, model: modelCfg.modelId });
  }
}
