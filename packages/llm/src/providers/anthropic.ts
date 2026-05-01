import Anthropic from '@anthropic-ai/sdk';
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import type { ChatMessageContent, GenerateInput, GenerateOutput, Provider, StreamOutput, Usage } from '../types';

function flattenContent(content: ChatMessageContent): string {
  if (typeof content === 'string') return content;
  return content.map((block) => block.text).join('\n\n');
}

function toTextBlocks(content: ChatMessageContent): string | TextBlockParam[] {
  if (typeof content === 'string') return content;
  return content.map((block) => {
    const textBlock: TextBlockParam = { type: 'text', text: block.text };
    if (block.cacheControl === 'ephemeral') {
      textBlock.cache_control = { type: 'ephemeral' };
    }
    return textBlock;
  });
}

export function createAnthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey });

  function buildSystemBlocks(input: GenerateInput): TextBlockParam[] {
    const systemMsg = input.messages.filter((m) => m.role === 'system');
    if (systemMsg.length === 0) return [];
    const text = systemMsg.map((m) => flattenContent(m.content)).join('\n\n');
    const block: TextBlockParam = { type: 'text', text };
    if (input.cacheSystemPrompt) {
      block.cache_control = { type: 'ephemeral' };
    }
    return [block];
  }

  function buildUserMessages(input: GenerateInput) {
    return input.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: toTextBlocks(m.content),
      }));
  }

  function toUsage(resp: Anthropic.Messages.Message): Usage {
    return {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cacheCreationInputTokens: resp.usage.cache_creation_input_tokens ?? undefined,
      cacheReadInputTokens: resp.usage.cache_read_input_tokens ?? undefined,
    };
  }

  async function generate(input: GenerateInput): Promise<GenerateOutput> {
    const resp = await client.messages.create({
      model: input.model ?? 'claude-sonnet-4-6',
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      system: buildSystemBlocks(input),
      messages: buildUserMessages(input),
    });
    return {
      content: resp.content[0]?.type === 'text' ? resp.content[0].text : '',
      usage: toUsage(resp),
    };
  }

  async function generateStream(input: GenerateInput): Promise<StreamOutput> {
    const stream = client.messages.stream({
      model: input.model ?? 'claude-sonnet-4-6',
      max_tokens: input.maxTokens ?? 4096,
      temperature: input.temperature,
      system: buildSystemBlocks(input),
      messages: buildUserMessages(input),
    });

    async function* text() {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }

    const usage: Promise<Usage> = stream.finalMessage().then((msg) => toUsage(msg));

    return { text: text(), usage };
  }

  return { name: 'anthropic', generate, generateStream };
}
