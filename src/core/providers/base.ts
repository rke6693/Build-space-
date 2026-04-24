import type { CompletionRequest, CompletionResponse } from '../types.js';

export interface Provider {
  readonly id: 'anthropic' | 'openai';
  /** Returns true if this provider can serve the given model id. */
  supports(model: string): boolean;
  /** Non-streaming completion. */
  complete(req: CompletionRequest, signal?: AbortSignal): Promise<CompletionResponse>;
  /** Embed text. Not every provider implements this; throws if unsupported. */
  embed?(input: string, model: string, signal?: AbortSignal): Promise<number[]>;
}

export interface ProviderRegistry {
  /** Find the provider for a model, or throw KeelError('bad_request'). */
  forModel(model: string): Provider;
  /** List of provider ids that are configured (have creds). */
  available(): Provider['id'][];
}
