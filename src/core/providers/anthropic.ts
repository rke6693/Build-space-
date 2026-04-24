import Anthropic from '@anthropic-ai/sdk';
import { KeelError } from '../../util/errors.js';
import type { CompletionRequest, CompletionResponse, Message } from '../types.js';
import type { Provider } from './base.js';

const ANTHROPIC_MODEL_PREFIXES = ['claude-'];

export class AnthropicProvider implements Provider {
  readonly id = 'anthropic' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  supports(model: string): boolean {
    return ANTHROPIC_MODEL_PREFIXES.some((p) => model.startsWith(p));
  }

  async complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    const { system, messages } = splitSystem(req.messages);
    const started = Date.now();

    let res: Anthropic.Messages.Message;
    try {
      res = await this.client.messages.create(
        {
          model: req.model,
          max_tokens: req.maxTokens ?? 1024,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          ...(system ? { system } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.topP !== undefined ? { top_p: req.topP } : {}),
          ...(req.stop && req.stop.length > 0 ? { stop_sequences: req.stop } : {}),
        },
        signal ? { signal } : undefined,
      );
    } catch (err) {
      throw toKeelError(err);
    }

    const text = res.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return {
      id: res.id,
      model: res.model,
      content: text,
      finishReason: mapStopReason(res.stop_reason),
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        ...(typeof res.usage.cache_read_input_tokens === 'number'
          ? { cachedInputTokens: res.usage.cache_read_input_tokens }
          : {}),
      },
      latencyMs: Date.now() - started,
    };
  }
}

function splitSystem(messages: Message[]): { system: string | null; messages: Message[] } {
  const sys: string[] = [];
  const rest: Message[] = [];
  for (const m of messages) {
    if (m.role === 'system') sys.push(m.content);
    else rest.push(m);
  }
  return { system: sys.length > 0 ? sys.join('\n\n') : null, messages: rest };
}

function mapStopReason(r: Anthropic.Messages.Message['stop_reason']): CompletionResponse['finishReason'] {
  switch (r) {
    case 'end_turn':
    case 'stop_sequence':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool_calls';
    default:
      return 'other';
  }
}

function toKeelError(err: unknown): KeelError {
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 502;
    const code = status === 429 || (status >= 500 && status < 600) ? 'upstream_error' : 'bad_request';
    return new KeelError(code, err.message, { status, cause: err });
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new KeelError('upstream_timeout', 'upstream request aborted', { cause: err });
  }
  return new KeelError('upstream_error', 'anthropic error', { cause: err });
}
