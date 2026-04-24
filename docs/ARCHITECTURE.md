# Architecture

Keel is deliberately a small codebase with a single sharp responsibility:
sit between your app and any LLM provider, and make every call a little
cheaper and a little more reliable without changing the caller's contract.

## Request lifecycle

```
   POST /v1/chat/completions
            │
   ┌────────▼────────┐
   │  errorHandler    │  translates thrown KeelError → HTTP
   └────────┬────────┘
   ┌────────▼────────┐
   │  auth middleware│  static key or DB-backed api_keys
   └────────┬────────┘
   ┌────────▼────────┐
   │ zod schema      │  OpenAI / Anthropic request shape
   └────────┬────────┘
   ┌────────▼────────┐
   │ Router.route    │
   │  1. cache.lookup          (exact → semantic via pgvector)
   │  2. apply overrides
   │  3. registry.forModel().complete()
   │  4. cache.store (fire-and-forget)
   │  5. return afterCommit(...) hook
   └────────┬────────┘
   ┌────────▼────────┐
   │  response       │  adapted back to OpenAI / Anthropic wire format
   └────────┬────────┘
   ┌────────▼────────┐
   │  repo.insert*   │  requests + routing_decisions rows written
   └────────┬────────┘
   ┌────────▼────────┐
   │  afterCommit()  │  shadow.maybeShadow() fires (async, non-blocking)
   └─────────────────┘
```

Every stage is overridable by dependency injection — providers, cache, repo,
shadow controller, and judge all satisfy small interfaces in `src/core/`.

## Module map

```
src/
├── config.ts                env parsing (zod)
├── util/
│   ├── logger.ts            pino, auto-redacts auth headers
│   ├── errors.ts            KeelError + KeelErrorCode
│   ├── hash.ts              sha256, constant-time compare, stable JSON
│   └── tokens.ts            heuristic token estimator
├── core/
│   ├── types.ts             CompletionRequest / Response / RoutingContext
│   ├── pricing.ts           $/Mtok map + costUsd() + cached-input support
│   ├── router.ts            Router class, wires cache → provider
│   ├── budget.ts            BudgetTracker interface + Postgres impl
│   ├── providers/           Provider interface, Anthropic, OpenAI, registry
│   ├── cache/               cache.ts (policy) / memory.ts / postgres.ts / embed.ts
│   └── shadow/              shadow.ts + judge.ts + stats.ts
├── db/
│   ├── client.ts            pg Pool factory
│   └── repo.ts              Repo: api_keys, requests, shadow_attempts, stats
└── server/
    ├── app.ts               Hono app factory
    ├── index.ts             entrypoint: config → deps → serve
    ├── middleware/
    │   ├── auth.ts          Bearer token → AuthContext
    │   └── errors.ts        KeelError → JSON
    └── routes/
        ├── chat.ts          OpenAI adapter
        ├── messages.ts      Anthropic adapter
        ├── stats.ts         /v1/stats aggregates
        └── health.ts        /health + /health/ready
```

## Core types

```ts
interface CompletionRequest {
  model: string;
  messages: { role: Role; content: string; name?: string }[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  metadata?: Record<string, string>;
}

interface CompletionResponse {
  id: string;
  model: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'other';
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  latencyMs: number;
}
```

Every adapter (OpenAI `/v1/chat/completions`, Anthropic `/v1/messages`)
translates into/out of these types. The router, cache, shadow, and providers
deal only with this shape.

## Cache policy

Only deterministic requests are cached:
- `stream === false`
- `temperature === undefined || temperature <= 0.15`

The cache has two layers:
1. **Exact** — `sha256(stable-JSON(messages))` keyed by `sha256(stable-JSON(non-prompt params))`. One indexed read.
2. **Semantic** — `pgvector` cosine similarity within the same non-prompt key. Only attempted when an embedder is configured.

Cache misses that produce a response are stored immediately in the same
transaction path. Stores are fire-and-forget from the router's perspective;
store failures log a warning and never affect the client response.

The `cache_key` incorporates a schema version (`CACHE_SCHEMA_VERSION` in
`src/core/cache/cache.ts`). Bump it to invalidate every entry without
touching the DB.

## Shadow-eval routing

**Goal:** prove when a cheaper candidate model can safely replace the
current primary for your traffic mix, without shipping guesses to users.

Mechanism:
1. For each primary model, operator defines a candidate (`SHADOW_CANDIDATES` env JSON).
2. `SHADOW_SAMPLE_PERCENT`% of eligible non-streaming requests fire a
   second, parallel call to the candidate. The candidate's response is
   **never returned to the client**.
3. `LlmJudge` calls a cheap fast model (default `claude-haiku-4-5`) with
   the user's original query plus both responses, and parses a numeric
   score in [0, 1] out of a strict `SCORE: x.xx` format.
4. `ShadowStats` keeps a per-pair rolling window of the last
   `SHADOW_WINDOW_SIZE` scores + cumulative cost delta.
5. Operator reads `/v1/stats`. When a pair's mean ≥ `SHADOW_PROMOTION_THRESHOLD`,
   operator promotes by adding the pair to `ROUTING_OVERRIDES`.
   (Auto-promotion is explicitly opt-in and not yet implemented — a high bar
   for correctness; see roadmap.)

Safety properties:
- Shadow calls cannot block or slow the primary response. They're fire-and-forget, bounded by `maxConcurrent` (default 32).
- Shadow attempts that throw are swallowed and logged, not escalated.
- Streaming requests are skipped (can't fairly compare).
- Cache hits are skipped (no "real" primary call to compare against).

## Budget guardrails

`PostgresBudgetTracker` sums `cost_usd` from `requests` grouped by month and
`api_key_id`. If spend ≥ budget and `BUDGET_HARD_BLOCK=true`, new requests
from that key throw `KeelError('budget_exceeded', status=402)`.

At >10k req/month/key this aggregation becomes meaningful latency; when we
hit that threshold we'll add a materialized monthly ledger or a Redis
counter. Until then, the "compute from truth" model is simpler and can't
drift from actual spend.

## Schema

`docker/initdb/01-schema.sql` is the single source of truth. The five tables:

| Table | Purpose |
|---|---|
| `api_keys` | Hashed gateway keys + per-key monthly budgets. |
| `requests` | One row per inbound request. Joins to routing + shadow tables. |
| `routing_decisions` | Audit — why did we pick the served model? |
| `shadow_attempts` | Candidate calls + judge scores. |
| `cache_entries` | Semantic cache rows with pgvector(1536) column. |

All indices are declared in the same file. IVFFlat on `prompt_embedding` for
the vector similarity search, btree on hot query paths.

## Error model

`KeelError` carries a `code: KeelErrorCode` that maps to a stable HTTP status
(see `src/util/errors.ts`). The JSON error body is `{ error: { type, message, details? } }` —
stable across the whole API so clients can branch on `type` reliably.

Provider errors from `@anthropic-ai/sdk` / `openai` are caught and wrapped
into the appropriate `KeelError`. 429 and 5xx from upstream become
`upstream_error`; everything else is `bad_request` so the client can fix its input.

## Observability

- Every request is logged structured JSON via `pino` with latency, status,
  served model, cache status, cost, api_key_id.
- Auth headers are redacted at the logger level; grepping logs for keys
  can't expose credentials.
- `/v1/stats` gives a live dashboard-ready JSON of 24h totals + shadow pairs.

## What we deliberately did NOT build

- **Streaming.** Adds complexity; caching is irrelevant on streamed
  responses; initial buyers live fine without it. On the roadmap.
- **A full dashboard / auth / billing.** Brand system + tokens are shipped
  in `brand/` so a dashboard can be added later without visual drift.
- **Every provider under the sun.** Two majors ship; more are trivial to
  add given the `Provider` interface. No point in a long tail we can't test.
- **Auto-promotion from shadow stats.** Ships as a known-future feature,
  explicitly. Promoting a cheaper model is a decision with revenue impact;
  we want an operator in the loop until confidence is very high.

All of these are tracked explicitly in [`ROADMAP.md`](ROADMAP.md).
