import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registry as metrics } from '../../core/metrics.js';
import type { Router } from '../../core/router.js';
import type { CompletionRequest, Message, RoutingContext } from '../../core/types.js';
import type { Repo } from '../../db/repo.js';
import { costUsd } from '../../core/pricing.js';
import { KeelError } from '../../util/errors.js';
import type { AuthContext } from '../middleware/auth.js';

/**
 * OpenAI-compatible /v1/chat/completions.
 *
 * We accept the subset of params that map to Keel's internal shape. Anything
 * else (tool calls, JSON mode, vision) is not yet translated — the request
 * will still be forwarded to the provider, but won't benefit from caching or
 * shadow-eval routing.
 */

const OAI_ROLE = z.enum(['system', 'user', 'assistant', 'tool', 'function']);

const chatCompletionsSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: OAI_ROLE,
        content: z.union([z.string(), z.null()]).transform((v) => v ?? ''),
        name: z.string().optional(),
      }),
    )
    .min(1),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  metadata: z.record(z.string()).optional(),
});

export function chatRoutes(deps: { router: Router; repo: Repo | null }): Hono<{
  Variables: { auth: AuthContext };
}> {
  const r = new Hono<{ Variables: { auth: AuthContext } }>();

  r.post('/v1/chat/completions', async (c) => {
    const auth = c.get('auth');
    const body = await c.req.json().catch(() => {
      throw new KeelError('bad_request', 'invalid JSON body');
    });
    const parsed = chatCompletionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new KeelError('bad_request', 'invalid request body', {
        details: { issues: parsed.error.issues },
      });
    }
    const req = parsed.data;

    if (req.stream) {
      // Streaming isn't implemented yet; we fail loudly rather than silently
      // demoting to non-streaming, which would break client UX.
      throw new KeelError('bad_request', 'streaming is not yet supported on this gateway');
    }

    const stop = req.stop ? (Array.isArray(req.stop) ? req.stop : [req.stop]) : undefined;
    const messages: Message[] = req.messages.map((m) => ({
      role: m.role === 'function' ? 'tool' : m.role,
      content: m.content,
      ...(m.name ? { name: m.name } : {}),
    }));

    const internal: CompletionRequest = {
      model: req.model,
      messages,
      ...(req.max_tokens !== undefined ? { maxTokens: req.max_tokens } : {}),
      ...(req.max_completion_tokens !== undefined && req.max_tokens === undefined
        ? { maxTokens: req.max_completion_tokens }
        : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.top_p !== undefined ? { topP: req.top_p } : {}),
      ...(stop ? { stop } : {}),
      ...(req.metadata ? { metadata: req.metadata } : {}),
    };

    const requestId = randomUUID();
    const ctx: RoutingContext = {
      apiKeyId: auth.apiKeyId,
      endpoint: 'chat.completions',
    };

    const { response, ctx: resolvedCtx, afterCommit } = await deps.router.route(internal, ctx);

    const cost = costUsd(
      response.model,
      response.usage.inputTokens,
      response.usage.outputTokens,
      response.usage.cachedInputTokens ?? 0,
    );

    // Metrics: cache + cost.
    if (resolvedCtx.cacheStatus && resolvedCtx.cacheStatus !== 'miss') {
      metrics.cacheHits.inc({ status: resolvedCtx.cacheStatus });
    } else {
      metrics.cacheMisses.inc();
    }
    if (cost > 0) {
      metrics.costUsd.inc({ served_model: response.model }, cost);
    }

    if (deps.repo) {
      await deps.repo
        .insertRequest({
          id: requestId,
          apiKeyId: auth.apiKeyId.startsWith('static-') ? null : auth.apiKeyId,
          endpoint: 'chat.completions',
          requestedModel: internal.model,
          servedModel: response.model,
          cacheStatus: resolvedCtx.cacheStatus ?? 'miss',
          statusCode: 200,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          costUsd: cost,
          latencyMs: response.latencyMs,
          errorCode: null,
        })
        .catch(() => {});
      await deps.repo.insertRoutingDecision(requestId, resolvedCtx).catch(() => {});
    }

    afterCommit(requestId);

    return c.json({
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: response.content },
          finish_reason: response.finishReason === 'stop' ? 'stop' : response.finishReason,
        },
      ],
      usage: {
        prompt_tokens: response.usage.inputTokens,
        completion_tokens: response.usage.outputTokens,
        total_tokens: response.usage.inputTokens + response.usage.outputTokens,
      },
      // Keel-specific hints for observability tooling. Extra keys are
      // permitted by the OpenAI SDK; clients that don't know about them
      // ignore them.
      keel: {
        request_id: requestId,
        cache_status: resolvedCtx.cacheStatus,
        routing_rule: resolvedCtx.routingRule,
        cost_usd: cost,
      },
    });
  });

  return r;
}
