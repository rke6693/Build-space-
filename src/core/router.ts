import { logger } from '../util/logger.js';
import type { Cache } from './cache/cache.js';
import type { ProviderRegistry } from './providers/base.js';
import type { ShadowController } from './shadow/shadow.js';
import type { CompletionRequest, CompletionResponse, RoutingContext } from './types.js';

export interface RouterOptions {
  registry: ProviderRegistry;
  cache: Cache;
  shadow: ShadowController | null;
  /**
   * Map of explicit model overrides (e.g. after operator promotion of a
   * shadow candidate). Key = requested model, value = actually-served model.
   * Kept small and hot-reloadable.
   */
  overrides: Readonly<Record<string, string>>;
}

export interface RouteResult {
  response: CompletionResponse;
  ctx: RoutingContext;
  /** Called by the gateway after the response is fully handed back to the client. */
  afterCommit: (requestId: string) => void;
}

export class Router {
  constructor(private readonly opts: RouterOptions) {}

  async route(req: CompletionRequest, ctx: RoutingContext): Promise<RouteResult> {
    // 1. Cache lookup first — cheapest possible path.
    const hit = await this.opts.cache.lookup(req).catch((err) => {
      logger.warn({ err }, 'cache lookup failed');
      return null;
    });
    if (hit) {
      const resolvedCtx: RoutingContext = {
        ...ctx,
        servedModel: hit.response.model,
        cacheStatus: hit.status,
        routingRule: hit.status === 'exact' ? 'exact-cache' : 'semantic-cache',
        ...(hit.similarity !== undefined
          ? { routingReason: `semantic similarity=${hit.similarity.toFixed(3)}` }
          : {}),
      };
      return { response: hit.response, ctx: resolvedCtx, afterCommit: () => {} };
    }

    // 2. Apply overrides (shadow promotion, per-key routing, etc).
    const servedModel = this.opts.overrides[req.model] ?? req.model;
    const effectiveReq: CompletionRequest = servedModel === req.model ? req : { ...req, model: servedModel };

    // 3. Select provider + call.
    const provider = this.opts.registry.forModel(servedModel);
    const response = await provider.complete(effectiveReq);

    // 4. Store in cache (best-effort, non-blocking from the caller's perspective).
    this.opts.cache.store(req, response).catch((err) => {
      logger.warn({ err }, 'cache store failed');
    });

    const resolvedCtx: RoutingContext = {
      ...ctx,
      servedModel: response.model,
      cacheStatus: 'miss',
      routingRule: servedModel !== req.model ? 'override' : 'default',
      ...(servedModel !== req.model
        ? { routingReason: `override ${req.model} -> ${servedModel}` }
        : {}),
    };

    // 5. Shadow. Fire-and-forget with backpressure inside the controller.
    const shadow = this.opts.shadow;
    const afterCommit: (requestId: string) => void = shadow
      ? (requestId: string) => {
          shadow.maybeShadow({ requestId, request: effectiveReq, primary: response });
        }
      : () => {};

    return { response, ctx: resolvedCtx, afterCommit };
  }
}
