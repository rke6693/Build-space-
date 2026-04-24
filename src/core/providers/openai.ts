import OpenAI from 'openai';
import { KeelError } from '../../util/errors.js';
import type { CompletionRequest, CompletionResponse, Message } from '../types.js';
import type { Provider } from './base.js';

const OPENAI_MODEL_PREFIXES = ['gpt-', 'o1-', 'o3-', 'text-embedding-'];

export class OpenAIProvider implements Provider {
  readonly id = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  supports(model: string): boolean {
    return OPENAI_MODEL_PREFIXES.some((p) => model.startsWith(p));
  }

  async complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse> {
    const started = Date.now();

    let res: OpenAI.Chat.Completions.ChatCompletion;
    try {
      res = await this.client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages.map(mapMessage),
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.topP !== undefined ? { top_p: req.topP } : {}),
          ...(req.stop && req.stop.length > 0 ? { stop: req.stop } : {}),
        },
        signal ? { signal } : undefined,
      );
    } catch (err) {
      throw toKeelError(err);
    }

    const choice = res.choices[0];
    if (!choice) {
      throw new KeelError('upstream_error', 'openai returned no choices');
    }
    const text = choice.message.content ?? '';

    return {
      id: res.id,
      model: res.model,
      content: text,
      finishReason: mapFinishReason(choice.finish_reason),
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        ...(typeof res.usage?.prompt_tokens_details?.cached_tokens === 'number'
          ? { cachedInputTokens: res.usage.prompt_tokens_details.cached_tokens }
          : {}),
      },
      latencyMs: Date.now() - started,
    };
  }

  async embed(input: string, model: string, signal?: AbortSignal): Promise<number[]> {
    try {
      const res = await this.client.embeddings.create(
        { input, model },
        signal ? { signal } : undefined,
      );
      const vec = res.data[0]?.embedding;
      if (!vec) throw new KeelError('upstream_error', 'empty embedding response');
      return vec;
    } catch (err) {
      throw toKeelError(err);
    }
  }
}

function mapMessage(m: Message): OpenAI.Chat.ChatCompletionMessageParam {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content };
    case 'assistant':
      return { role: 'assistant', content: m.content };
    case 'tool':
      return { role: 'tool', tool_call_id: m.name ?? 'tool', content: m.content };
    case 'user':
      return { role: 'user', content: m.content };
  }
}

function mapFinishReason(r: string | null): CompletionResponse['finishReason'] {
  switch (r) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool_calls';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'other';
  }
}

function toKeelError(err: unknown): KeelError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 502;
    const code = status === 429 || (status >= 500 && status < 600) ? 'upstream_error' : 'bad_request';
    return new KeelError(code, err.message, { status, cause: err });
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new KeelError('upstream_timeout', 'upstream request aborted', { cause: err });
  }
  return new KeelError('upstream_error', 'openai error', { cause: err });
}
