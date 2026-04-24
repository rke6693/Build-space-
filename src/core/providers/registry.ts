import { KeelError } from '../../util/errors.js';
import type { Provider, ProviderRegistry } from './base.js';

export class StaticProviderRegistry implements ProviderRegistry {
  private readonly providers: Provider[];

  constructor(providers: Provider[]) {
    this.providers = providers;
  }

  forModel(model: string): Provider {
    const p = this.providers.find((x) => x.supports(model));
    if (!p) {
      throw new KeelError('bad_request', `no configured provider supports model '${model}'`, {
        details: { model, available: this.providers.map((x) => x.id) },
      });
    }
    return p;
  }

  available(): Provider['id'][] {
    return this.providers.map((p) => p.id);
  }

  /** Lookup by provider id; throws if missing. Used for embedding provider selection. */
  byId(id: Provider['id']): Provider {
    const p = this.providers.find((x) => x.id === id);
    if (!p) {
      throw new KeelError('bad_request', `provider '${id}' is not configured`, {
        details: { requested: id, available: this.providers.map((x) => x.id) },
      });
    }
    return p;
  }
}
