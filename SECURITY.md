# Security policy

## Reporting a vulnerability

Email **`hello@keel.dev`** with subject line starting `[security]`.
Include:

- A description of the issue
- The affected version(s) — commit hash if you can
- Steps to reproduce, or a minimal proof-of-concept
- Your assessment of severity and impact

You'll get an acknowledgement within **3 business days** and a status
update within **7 business days**. We aim to ship a fix or a documented
mitigation within **30 days** of confirmation, faster for high-severity.

Please do **not** file public GitHub issues for security problems before
the fix has shipped and we've coordinated disclosure.

## Scope

In scope:

- The Keel gateway itself (`src/`)
- Brand assets, landing page, and dashboard (`brand/`, `web/`)
- Docker image and Compose config (`docker/`)
- Default provider adapters (Anthropic, OpenAI)

Out of scope:

- Issues in upstream providers (Anthropic, OpenAI) — report to them directly
- Issues in third-party dependencies — please file with the dependency first;
  we'll bump pins promptly once a fix exists upstream
- Self-inflicted misconfigurations (e.g. `KEEL_API_KEYS` checked into a
  public repo). We can advise but they aren't vulnerabilities in Keel.

## Coordinated disclosure

We'll publicly credit the reporter (or keep you anonymous, your choice) in
the release notes once the fix ships. We don't run a paid bounty program
yet — the project is small and self-funded — but we will list contributors
in `RELEASES.md` for confirmed reports.

## Hardened-by-default posture

Keel ships with the following on by default:

- API-key auth on every `/v1/*` route
- Constant-time key comparison (`safeEqual` in `src/util/hash.ts`)
- Request body size cap (default 1 MiB; configurable via `MAX_BODY_BYTES`)
- Per-key token-bucket rate limiting (`RATE_LIMIT_*`)
- Upstream timeouts (default 60s; `UPSTREAM_TIMEOUT_MS`)
- Structured logs with auth headers + cookies redacted
- Parameterized SQL queries throughout (`src/db/repo.ts`)
- No secrets stored in plaintext in the database (API keys are sha256-hashed)
- pgvector cache entries TTL'd (`SEMANTIC_CACHE_TTL_SECONDS`)
- Apache-2.0 license — every line auditable

If you spot a defaults-on issue that violates one of these, that's almost
certainly a real vulnerability.

## Known threat model gaps (deliberate, in roadmap)

- **In-memory rate limiter** — does not share state across processes. A
  multi-node deployment can be saturated by the multiplier of node count.
  Mitigation: deploy single-node until the Redis-backed limiter ships in v0.2.
- **No body authenticity checks beyond Bearer auth** — replay protection
  is the caller's responsibility today.
- **Judge model can be prompt-injected** — a malicious user prompt could
  influence the LLM judge's score, biasing shadow-eval routing. Documented
  in `docs/ARCHITECTURE.md`. Mitigation: stricter score parsing already
  rejects unparseable judge output; ensemble + sandbox prompts on roadmap.

If you have a thought on hardening any of these earlier, file an issue —
this is a good place for community input.
