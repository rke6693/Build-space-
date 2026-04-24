# Pre-launch verification

Every gate below must pass before pointing real traffic at Keel — and
absolutely before the HN Show post goes live. The cost of a launch-day
crash is paid in years of trust; the cost of an extra day of testing is
hours.

Mark each box. If you can't honestly check it, do not launch.

---

## Gate 1 — The build actually works (30 min)

```bash
# Clean install
rm -rf node_modules dist
npm install
npm run typecheck         # must exit 0
npm run lint              # must exit 0
npm test                  # all tests green
npm run build             # produces dist/server/index.js
```

- [ ] `npm install` succeeds with no peer-dep warnings beyond the known set
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` reports 100% of tests passed
- [ ] Coverage on `src/core/**` and `src/server/**` is ≥80% (`npm run test:coverage`)
- [ ] `npm run build` produces a `dist/server/index.js` that boots: `node dist/server/index.js` should log `keel listening`

## Gate 2 — Docker image works end-to-end (15 min)

```bash
docker compose -f docker/docker-compose.yml up --build
# wait for "keel listening" in the logs
```

- [ ] Postgres comes up healthy (the schema applies from `docker/initdb/01-schema.sql`)
- [ ] `keel` container reports `keel listening`, providers wired, postgres=true
- [ ] `curl http://localhost:8787/health` returns `{"status":"ok",...}`
- [ ] `curl http://localhost:8787/health/ready` returns `postgres: "up"`
- [ ] `docker stats keel-keel-1` shows steady RSS (no slow leak in 10 minutes)

## Gate 3 — Smoke test the real wire (15 min)

With real Anthropic + OpenAI keys in `.env`:

```bash
export KEY=$KEEL_API_KEYS  # whatever you put in .env

# OpenAI shape, real call
curl -s http://localhost:8787/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hi"}],"temperature":0}' | jq

# Anthropic shape, real call
curl -s http://localhost:8787/v1/messages \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-haiku-4-5","max_tokens":64,"messages":[{"role":"user","content":"Hi"}]}' | jq

# Run the same OpenAI call twice — second should hit cache
# (look for "cache_status":"exact" in the second response)
```

- [ ] OpenAI-shape response has `keel.cache_status: "miss"` first time, `"exact"` second
- [ ] Anthropic-shape response includes `usage.input_tokens`/`output_tokens`
- [ ] `keel.cost_usd` is non-zero on a miss, zero on a hit
- [ ] Asking the same question with a slightly different phrasing returns `"semantic"` (only if `OPENAI_API_KEY` set so embeddings work)

## Gate 4 — Negative-path testing (15 min)

- [ ] No Authorization header → 401, `error.type: "auth_missing"`
- [ ] Wrong API key → 401, `error.type: "auth_invalid"`
- [ ] Invalid JSON body → 400, `error.type: "bad_request"`
- [ ] `model: "doesnt-exist-7b"` → 400 with provider-list in `details`
- [ ] `stream: true` → 400 (streaming explicitly unsupported in v0.1)
- [ ] Body > 1 MiB → 413, `error.type: "payload_too_large"`
- [ ] Hammering one key past `capacity` → 429 with `Retry-After` header

## Gate 5 — Load test (20 min)

Run the bundled in-process load test. The overhead claim in the README is
**< 2 ms p95 on cache miss**.

```bash
npm run bench:load -- --n 20000 --c 64 --mode miss
npm run bench:load -- --n 20000 --c 64 --mode hit
npm run bench:load -- --n 20000 --c 128 --mode mixed
```

- [ ] **Miss-path p95 < 2 ms** (gateway overhead only — no upstream)
- [ ] **Hit-path p95 < 0.5 ms**
- [ ] **No errors** in stdout
- [ ] Throughput at c=128 ≥ 5,000 req/s on a laptop CPU

If any of these fail, profile with `node --prof dist/server/index.js` before launching.

## Gate 6 — External load test against the deployed instance (30 min)

Stand up the gateway on Fly.io / Railway / your laptop reachable over the
network, then beat on it from a different machine:

```bash
# autocannon (npm i -g autocannon)
autocannon -c 64 -d 60 -m POST \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -b '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}],"temperature":0}' \
  https://keel.fly.dev/v1/chat/completions

# Or k6
k6 run scripts/k6-baseline.js   # write your own; see autocannon as a template
```

- [ ] Sustained 60s load → no 5xx errors
- [ ] p95 end-to-end (incl. provider) < 2× a direct upstream call to the same model
- [ ] No memory growth on the container after 60s

## Gate 7 — Soak test (overnight)

```bash
# 8 hours of low-but-steady load. Anthropic + OpenAI permitting,
# this will cost you a few dollars. Worth it.
autocannon -c 8 -d 28800 ...   # 8h
```

- [ ] No restarts, no OOM kills
- [ ] RSS stable within ±10% of starting value
- [ ] Postgres connection count stable
- [ ] No log spam (`grep ERROR keel.log | wc -l` should be near zero)
- [ ] `/v1/stats` returns plausible cumulative numbers
- [ ] `/metrics` cardinality stays bounded (no per-request labels leaking)

## Gate 8 — Failure-injection (30 min)

- [ ] Kill Postgres mid-traffic (`docker compose stop postgres`) — gateway should keep responding for cache hits, return 5xx cleanly for misses, and recover when Postgres comes back without a restart
- [ ] Set `ANTHROPIC_API_KEY=invalid` — calls to Anthropic models return 401/502 with the error mapped to `upstream_error`, not crashing
- [ ] Set `EMBEDDING_PROVIDER=off` — semantic cache disables, exact cache still works
- [ ] Block outbound to `api.anthropic.com` via firewall — calls time out at 60s and return `upstream_timeout`, not hang forever

## Gate 9 — Security checks (20 min)

- [ ] `npm audit --omit=dev` reports 0 high or critical vulnerabilities
- [ ] No secrets in the repo (`git grep -E '(sk-ant-|sk-proj-|sk_live_|kl_)'` in tracked files returns only `.env.example`)
- [ ] `.env` is in `.gitignore` and not in any commit (`git log --all --full-history -- .env` empty)
- [ ] Auth headers + cookies redacted in logs (drive a real request, search the log for the api key — should not appear)
- [ ] CORS in production is set to your specific origins, not `*`, if a browser client will call the gateway directly
- [ ] Run the included security review skill (`/security-review` if available in your harness) and triage findings

## Gate 10 — Public surface review (15 min)

Cold-read your own README, landing page, and docs as if you've never seen
them. Better: have a friend do it.

- [ ] README explains *what* in the first sentence, *why* in the next, *how to try* within 30 seconds of scrolling
- [ ] All landing-page links work, no 404s
- [ ] Favicon loads in a fresh-tab browser
- [ ] Brand assets render correctly on light and dark GitHub themes
- [ ] License year + holder are correct
- [ ] `docs/RESEARCH.md` citations all resolve (no dead links)

## Gate 11 — Operational readiness (15 min)

- [ ] `hello@keel.dev` actually receives mail (send yourself a test from another address)
- [ ] Newsletter signup on the landing actually creates a subscriber in Buttondown
- [ ] Status page reachable at `status.keel.dev` (even if just a stub)
- [ ] You have credentials for: domain registrar, Cloudflare, GitHub, hosting provider, Stripe (test mode at least), email provider
- [ ] You can deploy a hotfix in under 10 minutes (`git push` → hosting auto-deploys)
- [ ] Runbook exists (even one page) for: "gateway is down," "Postgres full," "one provider degraded," "abuse from a single API key"

## Gate 12 — Launch-day readiness (15 min)

- [ ] HN Show post drafted in a `.txt` file ready to paste, with the first comment also pre-written
- [ ] All 12 short social posts queued in Buffer/Typefully
- [ ] First 4 long posts published or scheduled
- [ ] Calendar blocked from 8am–5pm on launch day
- [ ] Phone notifications muted *except* for GitHub mentions and `hello@keel.dev`
- [ ] One trusted person has the launch URL and is on standby to upvote / report problems

---

## What I deliberately skipped

Not on this list because they're roadmap, not launch-blockers:

- Streaming support (v0.2)
- Provider circuit breaker (v0.2)
- Auto-shadow-promotion (v0.3)
- SOC 2 (only when revenue justifies)

If a single design partner blocks on any of those, that's data — but don't
chase them before the foundation is hardened.

---

## When to abort the launch

Pull the plug if any of these are true the day before:

1. Any **Gate 5 or 6** load-test target is missed
2. **Gate 7** soak test shows memory growth > 10% in 8 hours
3. **Gate 8** failure injection causes a hang (vs. a clean error)
4. **Gate 9** finds a critical vulnerability or a secret in git history
5. You're personally exhausted — a tired solo founder mishandling launch-day questions costs more than waiting a week

Reschedule. The HN front page will still be there.
