# Roadmap

Explicit so it's audit-able. Items are grouped by what they unlock, not by
time estimate — for a time-constrained operator, sequence matters more than
dates.

## v0.1 — foundation (shipped)

- [x] Hono-based gateway with OpenAI- and Anthropic-compatible endpoints
- [x] Anthropic + OpenAI providers behind a common `Provider` interface
- [x] Postgres + pgvector semantic cache; in-memory fallback
- [x] Deterministic cache policy (stream=false, low temperature)
- [x] Budget guardrails with per-key monthly USD limits
- [x] Shadow-eval scaffolding: candidate call, LLM-as-judge, rolling stats
- [x] Static + DB-backed API key auth
- [x] Structured logging (pino), redacted auth headers
- [x] Request-level observability tables (`requests`, `routing_decisions`, `shadow_attempts`)
- [x] `/v1/stats` endpoint with 24h + shadow pair breakdown
- [x] Docker image, docker-compose (app + pgvector Postgres)
- [x] GitHub Actions CI: lint, typecheck, tests, Docker build
- [x] Brand system (`brand/`) + polished static landing page (`web/`)
- [x] Unit + component tests for core engine

## v0.2 — "people can actually deploy this" (next)

Priority items that turn the MVP into a thing a single operator can onboard
design partners with, in order.

- [ ] **Streaming support.** SSE for both endpoints. Stream-aware cache is
  explicitly out of scope; streamed responses skip cache like today.
- [ ] **Admin API for keys + budgets.** `POST /v1/admin/keys` to create /
  rotate / disable keys without SQL. Gated by a separate admin bearer.
- [ ] **Usage CSV export.** `/v1/admin/usage.csv?month=...` — the #1 thing
  finance asks for.
- [ ] **Per-request trace IDs** propagated to providers via
  `X-Keel-Request-Id`, returned in responses, logged on shadow attempts.
- [ ] **Provider health / circuit-breaker.** When a provider's error rate in
  a 60s window exceeds a threshold, stop routing to it for a cooldown.
- [ ] **Prometheus `/metrics`.** Latency histograms, cost counters, cache hit
  rate, shadow pair means.
- [ ] **Terraform + Fly.io one-click deploy.** Minimum viable hosted story.

## v0.3 — differentiation (the moat)

- [ ] **Automatic shadow-eval promotion** with multi-signal safety: mean ≥ threshold, min ≥ floor, minimum-sample gate, cooldown after promotion, automatic rollback on judge-score regression.
- [ ] **Judge ensemble + calibration.** Optional second judge model; disagreement above a threshold disqualifies a sample. Optional human rating feedback loop.
- [ ] **Content-type classification before routing.** Use a tiny model to tag
  `{code, summarization, extraction, qa, creative}`, route per-class
  independently. A cheaper model might be safe for extraction but not for creative.
- [ ] **Prompt-caching passthrough.** Translate Anthropic `cache_control` and
  OpenAI cached-input marker across providers so the gateway doesn't
  interfere with provider-side prompt caching.
- [ ] **Bring-your-own eval dataset.** Point Keel at a Braintrust /
  Langfuse / file-based dataset; score candidates offline on the dataset
  *before* exposing them to shadow traffic.

## v0.4 — monetizable surface

- [ ] **Hosted dashboard** (Next.js, reuses `brand/tokens.*`). Same design as
  the reference mockup: routing-intelligence donut, shadow card, request
  trends, budget guardrails. Sign in, paste a gateway URL, get a live view.
- [ ] **Team + org model.** Users, orgs, keys scoped to orgs.
- [ ] **Stripe billing.** Usage-based tier priced as a percentage of
  realized savings, capped. A simpler fixed tier for predictability.
- [ ] **Self-serve SaaS.** Hosted Keel for teams that don't want to run it.
  OSS core stays Apache-2.0; cloud stays closed, but exports are always
  portable.

## v0.5+ — compliance (self-serve only)

These ship behind the Business tier paywall. Anything that requires a sales
call, an account-manager, or a custom contract is intentionally out of scope
— see the operating model note at the bottom of this file.

- [ ] **EU AI Act Article 12 evidence export.** One button → zip of all logs
  for a time range with model versions, request/response payloads,
  routing decisions, judge scores, in an auditor-friendly format.
- [ ] **Audit log append-only store.** Per-org, cryptographically hash-chained.
- [ ] **Data residency.** Pin request/response storage to EU / US regions.
- [ ] **SOC 2 Type 1 → Type 2.** Pursued once Business-tier MRR justifies the
  $10–20k cost. Type 2 only after 12 months of Type 1.

## Explicit non-goals

- A general-purpose agent framework. Keel is the layer *underneath* your agent framework.
- A prompt IDE, prompt versioning UI, or "playground." Other products do this well.
- A vendor-lock-in dashboard. Export everything. Self-host everything.
- Competing with provider-native prompt caching. We pass it through.
- **Custom enterprise contracts, named CSMs, dedicated phone support, or any
  motion that requires synchronous human interaction.** Keel is built and run
  asynchronously. Buyers who require sales calls or account managers are not
  the target. The Business tier is the ceiling; everything above is by exception.
- **SSO + SCIM in v0.5.** Deferred until Business-tier demand demonstrably
  needs it. Adds support burden disproportionate to revenue at this stage.

## Operating model

Keel is run as a small, async, written-first project:

- All support is via email and GitHub issues; no live chat, no calls.
- All product communication is via the changelog, blog, and brand-only
  social accounts.
- All sales are self-serve through Stripe; no quotes, no PoCs, no demos
  beyond the public 2-minute screen-recording on the landing page.
- The roadmap is public and conservative; features ship when they're ready,
  not when a single buyer asks.

This shape caps the revenue ceiling but keeps the time cost predictable —
which is the deliberate trade.

