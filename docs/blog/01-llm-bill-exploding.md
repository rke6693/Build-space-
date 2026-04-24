---
title: "Why your LLM bill is exploding (and four levers to pull right now)"
slug: llm-bill-exploding
date: 2026-04-24
description: Enterprise LLM API spend doubled in a year. Most of it is preventable. Here are the four levers that move the P&L — and the order to pull them.
tags: [llm, cost-optimization, openai, anthropic, infrastructure]
canonical: https://keel.dev/blog/llm-bill-exploding
author: The Keel Team
---

In April 2025, Menlo Ventures published a number that should have been a wake-up call across every AI engineering team:

> **Enterprise LLM API spend more than doubled in a single year — from $3.5B in 2024 to $8.4B in 2025**, with $15B projected by 2026.[^menlo]

That growth isn't bad on its own. The problem is that almost nobody's spend grew because their *traffic* grew that fast. It grew because the costs were sloppy. We had production teams running every request — including FAQ-style traffic that gets the same 12 questions all day — through an Opus-class model with no cache. We had startups paying $4 to summarize a tweet.

Most of that money is preventable. This post is about the four levers that actually move the P&L, in the order they pay back.

If you'd rather see than read: clone [Keel](https://github.com/rke6693/build-space-) and run `DEMO_MODE=true npm run dev`. The dashboard at `/dashboard/` will show all four mechanisms running on synthetic traffic in under 30 seconds. No API keys required.

## Lever 1: Provider failover — the cheapest insurance you'll ever buy

Before you optimize cost, optimize *not paying for failure*. Anthropic, OpenAI, and the others all have outages. They're publicly shameless about it. Your CFO won't be when a four-hour 5xx storm makes your support agent unusable for a day.

Provider failover means: when the request to your primary upstream fails or times out, the gateway transparently retries on the secondary. From the caller's perspective, nothing happened.

Two practical realities:

1. **It only works if your gateway is the layer doing it.** SDK-level failover doesn't compose across providers — the OpenAI SDK can't fall back to Anthropic, because the request shapes are different. A gateway that translates request shapes is the only place this can live.
2. **The "hard part" is failure detection, not the retry.** A 5xx is obvious; a hung connection is the one that breaks you. Set explicit upstream timeouts (we default to 60 seconds in Keel, see [`UPSTREAM_TIMEOUT_MS`](https://github.com/rke6693/build-space-/blob/main/.env.example)) and treat a `null` return as failure.

Cost impact: indirect, but real. A four-hour outage on a $50k/month provider is ~$280 of revenue you didn't bill plus whatever the support backlog cost. Failover converts those into footnotes.

## Lever 2: Semantic caching — where the actual money is

If you're going to make exactly one change, make it this one. Published case studies are unambiguous:

- **VentureBeat, 2025**: a production SaaS cut their LLM bill from **$47k to $12.7k per month — a 73% reduction** — by adding semantic caching.[^vb]
- **AWS Database blog**: at the right similarity threshold, semantic caching produces **86% cost reduction with 88% latency improvement** and 91% response accuracy.[^aws]
- **Percona engineering**: workload-dependent **40–80% savings**, with up to a **250× latency speedup** on hits.[^percona]

The reason this works is unsurprising once you look at real production traffic: a frighteningly high percentage of LLM calls are paraphrases of previous calls. "How do I reset my password?" / "I forgot my password — how do I reset it?" / "password reset help" all want the same response. An exact-string cache (which is what most teams build first) catches none of these. A semantic cache catches all three.

A workable architecture for it isn't complex:

1. Hash the **non-prompt** parameters (model, temperature, max_tokens, stop) to produce a `cache_key`. Two requests with the same cache_key are eligible to share a response.
2. **Embed the prompt** with a small fast model (`text-embedding-3-small` is fine; ~$0.02 / million tokens).
3. Store the embedding in a vector index (`pgvector` works for the first ~10M entries; reach for a dedicated vector DB after that).
4. On a new request: compute the cache_key, embed the prompt, and find the nearest neighbor *within that cache_key*. If cosine similarity ≥ a configurable threshold (we default to 0.93), return the cached response.

There are two policy decisions to make on top of that:

- **Don't cache when temperature > 0.15.** The caller is asking for variation; a cached response defeats the purpose.
- **Don't cache when streaming.** You can't replay a stream cleanly, and anyone using streaming usually wants progressive output rather than a stale full response.

Keel's [PostgresCache](https://github.com/rke6693/build-space-/blob/main/src/core/cache/postgres.ts) implements exactly this. ~120 lines.

## Lever 3: Budget guardrails — stop the surprise bill

This one is unglamorous and crucial.

Your CFO does not want a phone call telling them your AI bill is 5× this month because a runaway agent fell into an infinite loop and called Opus 12,000 times in an hour. You don't want it either. The fix is mechanical:

1. Enforce a **monthly USD budget per API key** at the gateway layer.
2. When an API key crosses its budget, return `402 Payment Required` (we use `KeelError('budget_exceeded')`) with a structured body the calling team can branch on.
3. Set **soft and hard** thresholds — warn at 80%, block at 100% — so the on-call team has time to investigate before the gateway just stops serving.

This is mundane code, but the act of putting a number on it forces useful conversations. *Should the customer-success automation have a $200/month budget or $2,000?* Nobody knows the answer until you make them pick one.

Keel's [`PostgresBudgetTracker`](https://github.com/rke6693/build-space-/blob/main/src/core/budget.ts) sums actual spend from the requests log so the budget can never drift from reality. Aggregating once per request is fine up to about 10k req/month per key; past that you'd add a counter or a materialized monthly ledger.

## Lever 4: Shadow-eval routing — the one nobody else ships

Levers 1–3 are well-trodden. They'll get you most of the way to a healthier bill. But there's a fourth lever that, in our experience, has the steepest dollar-per-engineering-hour curve, and almost nobody implements it cleanly.

**The premise**: for any given primary model in production, there's some cheaper model that *might* be safe to use instead — for some subset of your traffic. The only honest way to know is to test it on real traffic, judge whether the cheaper model holds up, and downshift only when the data agrees.

The mechanism we built into Keel:

1. **Sample**: for X% of eligible requests (configurable, often 5–10%), call the candidate model in parallel with the primary. The candidate response is **never returned to the client**.
2. **Judge**: a small fast model (we default to `claude-haiku-4-5`) compares the two responses against the original user query and returns a strict numeric score in `[0, 1]`. The judge prompt forces a single-line `SCORE: 0.87`-style output and we throw out anything that doesn't parse — to keep noise out of the rolling window.
3. **Aggregate**: we keep a per-pair rolling window of recent scores plus cumulative cost delta.
4. **Promote** *manually, with one config line*: when the rolling-window mean crosses your threshold for a given `(primary, candidate)` pair, an operator promotes the candidate by adding the pair to `ROUTING_OVERRIDES`.

Why manual promotion? Because the dollar impact of promoting a worse model is *also* measured in dollars — refunds, churn, retention. We're explicitly conservative on the auto-promotion path until we have ensemble judges and a regression-detection layer.

What this gets you: a continuously-running A/B that converts directly into savings. If you're spending $100k/month on Sonnet and 60% of your traffic could be served by Haiku at parity, you've found about $4k/month in plain English. The shadow-eval loop tells you that with statistical confidence rather than a guess.

## The order matters

If you do these in the wrong order you'll waste a weekend.

1. **Failover first.** Cheap, immediate, builds the gateway layer that everything else lives in.
2. **Caching second.** Highest-dollar lever, easiest to measure ("look at the 24-hour cache hit rate before and after").
3. **Budgets third.** Cheap politically once the gateway exists. Defensive insurance.
4. **Shadow-eval last.** Builds on the gateway and budget infrastructure. The compounding lever — it pays back forever.

Try to skip ahead and you'll find yourself rebuilding step 1 inside step 4.

## Where Keel fits

[Keel](https://github.com/rke6693/build-space-) is the open-source gateway we built to ship all four levers behind one drop-in API surface. It speaks OpenAI and Anthropic on both sides — change one base URL and you're routed. It's Apache-2.0 and self-hostable; if you'd rather not run infrastructure, the managed cloud is on the roadmap and waitlist signups go to `hello@keel.dev`.

The competitors in this space — Portkey, Helicone, Langfuse, LiteLLM — each ship some of these levers. We didn't find anyone shipping all four together with shadow-eval, which is why we built Keel. If you'd rather use one of them, we list them honestly in [`docs/RESEARCH.md`](https://github.com/rke6693/build-space-/blob/main/docs/RESEARCH.md), including which problems they solve better than we do.

If you want to try Keel: clone it, run `DEMO_MODE=true npm run dev`, and the dashboard will be live in a browser tab in under a minute. No API keys needed for the demo.

If you'd rather just read the code first: start at [`src/core/router.ts`](https://github.com/rke6693/build-space-/blob/main/src/core/router.ts). It's 80 lines.

---

[^menlo]: Menlo Ventures, [2025 Mid-Year LLM Market Update](https://menlovc.com/perspective/2025-mid-year-llm-market-update/).
[^vb]: VentureBeat, [Why your LLM bill is exploding — and how semantic caching can cut it by 73%](https://venturebeat.com/orchestration/why-your-llm-bill-is-exploding-and-how-semantic-caching-can-cut-it-by-73).
[^aws]: AWS Database blog, [Optimize LLM response costs and latency with effective caching](https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/).
[^percona]: Percona engineering blog, [Semantic caching for LLM apps: reduce costs by 40–80% and speed up by 250×](https://www.percona.com/blog/semantic-caching-for-llm-apps-reduce-costs-by-40-80-and-speed-up-by-250x/).
