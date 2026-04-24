<div align="center">
  <img src="brand/logo.svg" alt="Keel" width="240" />
  <p>
    <strong>The LLM optimization gateway.</strong><br/>
    Route, cache, guardrail, and shadow-eval every call — self-hostable, Apache-2.0.
  </p>
  <p>
    <a href="docs/QUICKSTART.md">Quickstart</a> ·
    <a href="docs/ARCHITECTURE.md">Architecture</a> ·
    <a href="docs/RESEARCH.md">Why this exists</a> ·
    <a href="docs/ROADMAP.md">Roadmap</a>
  </p>
</div>

---

## What it is

Keel sits between your app and every LLM provider you use. It speaks OpenAI
and Anthropic on both sides, so it's drop-in: change one base URL and you're
routed.

Once in the path, Keel does four things that move the P&L:

1. **Smart routing** — pick the right provider per request, fail over when one is down.
2. **Semantic cache** — pgvector-backed; matches near-duplicate prompts, not just exact hits.
3. **Budget guardrails** — monthly USD limits per API key, hard-block or warn.
4. **Shadow-eval routing** — the part nobody else ships. Continuously A/B a
   cheaper candidate against your production model on live traffic. An
   LLM-as-judge scores each attempt. Promote only when a rolling window
   crosses your parity threshold. Savings compound while quality is proven.

## Why it's worth your attention

- **LLM API spend grew from $3.5B → $8.4B in a single year (2024→2025)** and is projected to pass $15B by 2026.<sup>[1]</sup> This is a budgeted line item now, not a nice-to-have.
- **Published semantic-cache case studies show 46–86% cost reductions** depending on prompt mix.<sup>[2][3][4]</sup> Caching alone, before routing, pays for the gateway many times over.
- **EU AI Act Article 12 logging takes effect August 2, 2026**, with penalties up to €15M or 3% of worldwide turnover.<sup>[5]</sup> A gateway that logs every request/model/version is the cheapest path to compliance.

See [`docs/RESEARCH.md`](docs/RESEARCH.md) for the full market case with citations.

## Quick look

**See it running with no API keys, in 30 seconds:**

```bash
git clone https://github.com/rke6693/build-space-.git keel && cd keel
cp .env.example .env
echo 'DEMO_MODE=true' >> .env
npm install && npm run dev
# open http://localhost:8787/dashboard/
```

Demo mode swaps in a synthetic provider and an in-process traffic generator
so the dashboard is alive on first load. Disable when you're ready for real
traffic.

**Real usage:**

```bash
# 1. boot Keel + Postgres
docker compose -f docker/docker-compose.yml up --build

# 2. point your client at it
export OPENAI_BASE_URL=http://localhost:8787/v1
export OPENAI_API_KEY=$KEEL_API_KEY

# 3. call as normal
curl -X POST http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $KEEL_API_KEY" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello, Keel."}]}'
```

Full walkthrough in [`docs/QUICKSTART.md`](docs/QUICKSTART.md).
Deploy to Fly.io with `bash scripts/deploy-fly.sh` (set `KEEL_API_KEYS`
plus at least one provider key first).

## Architecture at a glance

```
┌──────────┐    POST /v1/*     ┌───────────────────────────────────┐    upstream    ┌──────────┐
│  Client  │ ────────────────▶ │  Keel gateway (Hono, TS, Node 20) │ ─────────────▶ │ Provider │
└──────────┘                   │                                   │                └──────────┘
                               │   auth → budget → router          │
                               │           │                       │
                               │           ├── cache (pg+vec)      │
                               │           ├── provider call       │
                               │           └── shadow (async)      │
                               │                                   │
                               │   requests + shadow_attempts      │
                               └───────────────▲───────────────────┘
                                               │
                                          ┌────┴────┐
                                          │ Postgres│ (pgvector)
                                          └─────────┘
```

Every request/response pair is logged with the served model, cache status,
token usage, cost, and latency. Shadow attempts are logged separately with
judge score and cost delta. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Status

v0.1.1 — **production-grade MVP foundation, hardened**. Core engine, HTTP
gateway, rate limiting, body-size limits, upstream timeouts, Prometheus
`/metrics`, unit + integration tests, load-test harness, Docker, CI,
landing page, brand system, **demo mode**, **live dashboard**, and Fly.io
one-shot deploy script.

Before any public launch, walk every gate in
[`docs/PRE-LAUNCH.md`](docs/PRE-LAUNCH.md). What's next in
[`docs/ROADMAP.md`](docs/ROADMAP.md): streaming, admin API, a managed cloud.

## License

Apache-2.0. Fork freely.

## Project posture

Keel is run async and written-first. There are no live demos, no quotes,
and no sales calls. Everything ships through the changelog, the docs, and
public release notes. Bugs and ideas live on
[GitHub Issues](https://github.com/rke6693/build-space-/issues); anything
else is `hello@keel.dev`.

---

<sub>
[1] Menlo Ventures, "2025 Mid-Year LLM Market Update." Model API spend doubled from $3.5B (2024) to $8.4B (2025); $15B projected for 2026.<br/>
[2] VentureBeat, "Why your LLM bill is exploding — and how semantic caching can cut it by 73%."<br/>
[3] AWS, "Optimize LLM response costs and latency with effective caching." 86% cost reduction at optimal similarity threshold; 88% latency improvement.<br/>
[4] Percona engineering blog, "Semantic caching for LLM apps: reduce costs by 40–80% and speed up by 250x."<br/>
[5] European Commission, EU AI Act Article 12 and enforcement timeline; Help Net Security and Raconteur coverage, April 2026.
</sub>
