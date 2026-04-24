import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { costUsd } from '../../core/pricing.js';
import type { Router } from '../../core/router.js';
import type { CompletionRequest, Message, RoutingContext } from '../../core/types.js';
import type { Repo } from '../../db/repo.js';
import { KeelError } from '../../util/errors.js';
import type { AuthContext } from '../middleware/auth.js';

/**
 * Anthropic-compatible /v1/messages. We accept the main shape; tool-use blocks
 * and vision blocks are passed through as stringified content. Clients that
 * need full fidelity should hit Anthropic directly.
 */

const contentBlock = z.union([
  z.string(),
  z.array(
    z.union([
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.string(), text: z.string().optional() }).passthrough(),
    ]),
  ),
]);

const messagesSchema = z.object({
  model: z.string().min(1),
  max_tokens: z.number().int().positive().optional().default(1024),
  system: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string() }))]).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: contentBlock,
      }),
    )
    .min(1),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  metadata: z.record(z.string()).optional(),
});

export function messagesRoutes(deps: { router: Router; repo: Repo | null }): Hono<{
  Variables: { auth: AuthContext };
}> {
  const r = new Hono<{ Variables: { auth: AuthContext } }>();

  r.post('/v1/messages', async (c) => {
    const auth = c.get('auth');
    const body = await c.req.json().catch(() => {
      throw new KeelError('bad_request', 'invalid JSON body');
    });
    const parsed = messagesSchema.safeParse(body);
    if (!parsed.success) {
      throw new KeelError('bad_request', 'invalid request body', {
        details: { issues: parsed.error.issues },
      });
    }
    const req = parsed.data;
    if (req.stream) {
      throw new KeelError('bad_request', 'streaming is not yet supported on this gateway');
    }

    const messages: Message[] = [];
    if (req.system) {
      const sys =
        typeof req.system === 'string' ? req.system : req.system.map((s) => s.text).join('\n\n');
      messages.push({ role: 'system', content: sys });
    }
    for (const m of req.messages) {
      const content =
        typeof m.content === 'string'
          ? m.content
          : m.content
              .map((b) => (b.type === 'text' && 'text' in b ? b.text : ''))
              .filter(Boolean)
              .join('\n');
      messages.push({ role: m.role, content });
    }

    const internal: CompletionRequest = {
      model: req.model,
      messages,
      maxTokens: req.max_tokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.top_p !== undefined ? { topP: req.top_p } : {}),
      ...(req.stop_sequences ? { stop: req.stop_sequences } : {}),
      ...(req.metadata ? { metadata: req.metadata } : {}),
    };

    const requestId = randomUUID();
    const ctx: RoutingContext = {
      apiKeyId: auth.apiKeyId,
      endpoint: 'messages',
    };
    const { response, ctx: resolvedCtx, afterCommit } = await deps.router.route(internal, ctx);

    const cost = costUsd(
      response.model,
      response.usage.inputTokens,
      response.usage.outputTokens,
      response.usage.cachedInputTokens ?? 0,
    );

    if (deps.repo) {
      await deps.repo
        .insertRequest({
          id: requestId,
          apiKeyId: auth.apiKeyId.startsWith('static-') ? null : auth.apiKeyId,
          endpoint: 'messages',
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
      type: 'message',
      role: 'assistant',
      model: response.model,
      content: [{ type: 'text', text: response.content }],
      stop_reason:
        response.finishReason === 'stop'
          ? 'end_turn'
          : response.finishReason === 'length'
            ? 'max_tokens'
            : response.finishReason === 'tool_calls'
              ? 'tool_use'
              : 'end_turn',
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
        ...(response.usage.cachedInputTokens !== undefined
          ? { cache_read_input_tokens: response.usage.cachedInputTokens }
          : {}),
      },
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
