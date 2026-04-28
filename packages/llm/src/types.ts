export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateInput {
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Mark the last system message for ephemeral caching (Anthropic only). */
  cacheSystemPrompt?: boolean;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface GenerateOutput {
  content: string;
  usage: Usage;
}

export interface StreamOutput {
  text: AsyncIterable<string>;
  usage: Promise<Usage>;
}

export interface Provider {
  readonly name: string;
  generate(input: GenerateInput): Promise<GenerateOutput>;
  generateStream(input: GenerateInput): Promise<StreamOutput>;
}

export type TaskType = 'draft' | 'rewrite' | 'review' | 'summary' | 'proofread' | 'classification';

export interface ModelConfig {
  provider: 'anthropic' | 'openai-compat';
  modelId: string;
  /** For openai-compat providers, the base URL of the API. */
  baseUrl?: string;
}

export interface RouterConfig {
  /** API key per provider name. */
  apiKeys: Record<string, string>;
  /** Task → model mapping. Defaults provided for common tasks. */
  taskModelMap: Partial<Record<TaskType, ModelConfig>>;
  /** Default model when no task mapping matches. */
  defaultModel: ModelConfig;
}
