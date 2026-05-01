import OpenAI from 'openai';
import type { ChatMessageContent, GenerateInput, GenerateOutput, Provider, StreamOutput, Usage } from '../types';

function flattenContent(content: ChatMessageContent): string {
  if (typeof content === 'string') return content;
  return content.map((block) => block.text).join('\n\n');
}

export function createOpenAICompatProvider(
  apiKey: string,
  baseUrl: string,
): Provider {
  const client = new OpenAI({ apiKey, baseURL: baseUrl });

  function toUsage(
    resp: OpenAI.Chat.Completions.ChatCompletion,
  ): Usage {
    return {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    };
  }

  async function generate(input: GenerateInput): Promise<GenerateOutput> {
    const resp = await client.chat.completions.create({
      model: input.model ?? 'deepseek-chat',
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      messages: input.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: flattenContent(m.content),
      })),
    });

    return {
      content: resp.choices[0]?.message?.content ?? '',
      usage: toUsage(resp),
    };
  }

  async function generateStream(input: GenerateInput): Promise<StreamOutput> {
    const stream = await client.chat.completions.create({
      model: input.model ?? 'deepseek-chat',
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      messages: input.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: flattenContent(m.content),
      })),
      stream: true,
    });

    // Resolve usage from the final stream event (if available).
    let resolveUsage: (u: Usage) => void;
    const usage = new Promise<Usage>((r) => { resolveUsage = r; });

    async function* text() {
      let lastUsage: Usage = { inputTokens: 0, outputTokens: 0 };
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          lastUsage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
          };
        }
      }
      resolveUsage(lastUsage);
    }

    return { text: text(), usage };
  }

  return { name: 'openai-compat', generate, generateStream };
}
