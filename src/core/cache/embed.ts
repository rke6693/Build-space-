import type { Provider } from '../providers/base.js';
import type { Embedder } from './postgres.js';

export class ProviderEmbedder implements Embedder {
  constructor(
    private readonly provider: Provider,
    private readonly model: string,
  ) {
    if (!provider.embed) {
      throw new Error(`provider '${provider.id}' does not support embeddings`);
    }
  }

  embed(text: string): Promise<number[]> {
    return this.provider.embed!(text, this.model);
  }
}
