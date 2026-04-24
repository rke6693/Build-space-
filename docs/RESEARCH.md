# Why Keel exists — the market case

This document is the business case for the product. If you're considering
forking Keel, using it commercially, or investing time in it, this is the
evidence that the underlying opportunity is real.

All figures are cited inline. "Illustrative" means a reasonable planning
number, not a measured one.

## 1. LLM API spend is now a top-of-mind budget line

- Enterprise model-API spend **more than doubled from $3.5B (2024) to $8.4B
  (2025)**, and Menlo Ventures projects **$15B by 2026** at current velocity.
  [Menlo Ventures — 2025 Mid-Year LLM Market Update][menlo]
- The broader enterprise-LLM market is tracked at **$5–9B in 2025** across
  leading analyst firms, growing to **~$49–71B by 2034 at CAGRs of 25–30%**.
  [Fortune Business Insights][fbi], [Straits Research][straits]
- 75%+ of surveyed enterprises now have at least one production LLM workload.
  [Index.dev — 50+ LLM Enterprise Adoption Stats 2026][indexdev]

**Why this matters for Keel.** Cost control turns from "a thing engineering
might do" into "a thing finance asks about every quarter" once spend crosses
the six-figure-monthly threshold. Keel is the line item finance signs off on.

## 2. Savings are real and well-documented

Multiple published case studies and research papers quantify the cost impact
of gateway-level optimization:

| Study | Technique | Reported savings |
|---|---|---|
| [VentureBeat, 2025][vb] | Semantic caching in production SaaS | **73% ($47k → $12.7k/mo)**; cache hit 18% → 67% |
| [AWS Database blog][aws] | Embedding-based semantic cache at optimal threshold | **86% cost**, 88% latency improvement, 91% response accuracy |
| [Percona engineering blog][percona] | Semantic caching for LLM apps | **40–80% cost reduction**, ~250× latency improvement |
| [arXiv 2411.05276 — GPT Semantic Cache][arxiv] | Production trace, multi-category | **68.8% API call reduction**, 61.6–68.8% hit rate |
| [arXiv 2506.14852 — Agentic Plan Caching][arxiv2] | Plan caching for agents | **46.6% cost reduction** at 96.7% of accuracy-optimal baseline |

Keel's architecture combines semantic caching with continuous shadow-eval
model routing — so the realistic savings envelope for an installation with
both enabled is bounded by the sum of those mechanisms, typically **40–70%
for mixed prompt workloads**, more for FAQ- and support-shaped traffic.

## 3. The competitive landscape is fragmented — no dominant player

Category snapshot as of 2026:

| Project | What it is | Public signals | Overlap with Keel |
|---|---|---|---|
| **LiteLLM** | OSS unified SDK + optional proxy for 100+ providers | **15k+ GitHub stars**, OSS + commercial tier | Router + providers overlap. Weaker on semantic cache + shadow-eval. |
| **Langfuse** | Open-source LLM tracing / observability | **15.5k stars**; **$4.5M raised** post-YC (Berlin) | Complementary (traces); Keel is control-plane, Langfuse is telemetry. |
| **Portkey** | Hosted + OSS LLM gateway (caching, guardrails, routing) | Private; Indian YC-backed; <$50M ARR signals | Closest direct competitor. Rules-based routing; no shadow-eval. |
| **Helicone** | OSS observability + proxy | YC W23; OSS | Overlap on proxy + logging; lighter on pgvector semantic cache. |
| **Braintrust** | Evals + dataset platform | Private; Series A | Complementary (evals); Keel is where evals act on traffic. |
| **OpenRouter** | Hosted multi-provider routing marketplace | Private | Routing only; no self-host, no caching/guardrails. |

Sources: [Helicone's own comparison][helicone-comp], [TrueFoundry — Langfuse vs Portkey][tf], [DEV community LiteLLM alternatives][dev], [Firecrawl — Best LLM observability tools 2026][firecrawl].

**Why this matters for Keel.** No single vendor has stitched the four things
Keel does — routing + semantic cache + budget + shadow-eval — behind one
API with a self-hosted, Apache-2.0 foundation. That's a positioning gap
that maps directly to a real buyer problem.

## 4. Regulatory tailwinds through 2026–2027

- **EU AI Act Article 12** mandates automatic event logging for high-risk AI
  systems (inputs, outputs, model versions, traceability metadata).
  Enforcement begins **August 2, 2026** with **penalties up to €15M or 3% of
  worldwide turnover**. [Help Net Security coverage][hns], [Raconteur
  technical audit guide][raconteur].
- **Finland** activated its AI Act enforcement powers in **January 2026**,
  making EU-wide enforcement operationally real now. [Legal Nodes —
  2026 Updates][legalnodes].
- **ISO/IEC 42001** (AI management systems) and SOC 2 controls now routinely
  require demonstrable log retention, request versioning, and audit trails —
  exactly what a gateway naturally produces. [GuardionAI — LLM Compliance
  2026 Guide][guardion].

**Why this matters for Keel.** A gateway that logs every request with the
served model version, inputs, outputs, tokens, and cost is the cheapest path
to Article-12 compliance an engineering team can ship. Any buyer with EU
exposure needs a story here by Q3 2026.

## 5. Why this fits a time-constrained operator

- **Developer-tool PLG motion.** No phone sales, no demos required. GitHub
  stars → self-serve deploy → paid cloud is the proven playbook that
  LiteLLM, Langfuse, PostHog, Supabase have all used.
- **Picks-and-shovels.** Customers arrive pre-qualified — they already have
  an Anthropic or OpenAI bill. No market education needed.
- **Recurring value, recurring revenue.** Cost savings are monthly and
  measurable, which is the easiest B2B pricing case to make: a percentage
  of observed savings, or a fixed SaaS tier priced below realized savings.
- **Compounds with no marketing spend.** Every design partner who shares a
  "we cut $X on LLMs with this" number is a net distribution event.

## 6. Risks, honestly stated

- **Portkey/Helicone acquisitions or aggressive feature expansion** could
  compress the positioning gap. Mitigation: ship shadow-eval first, loud.
- **Provider-native caching + prompt caching** (Anthropic, OpenAI)
  reduces the marginal value of *exact* semantic caching. Mitigation:
  gateway is still the right seat for routing/budget/shadow, and
  cross-provider caching still has value where provider caching doesn't
  apply.
- **GTM slow-roll risk for a solo/part-time operator.** Self-serve OSS
  distribution is forgiving of slow cadence *if* the README is honest and
  the docs are good — which is why `docs/` is a first-class deliverable in
  this repo.

---

[menlo]: https://menlovc.com/perspective/2025-mid-year-llm-market-update/
[fbi]: https://www.fortunebusinessinsights.com/enterprise-llm-market-114178
[straits]: https://straitsresearch.com/report/enterprise-llm-market
[indexdev]: https://www.index.dev/blog/llm-enterprise-adoption-statistics
[vb]: https://venturebeat.com/orchestration/why-your-llm-bill-is-exploding-and-how-semantic-caching-can-cut-it-by-73
[aws]: https://aws.amazon.com/blogs/database/optimize-llm-response-costs-and-latency-with-effective-caching/
[percona]: https://www.percona.com/blog/semantic-caching-for-llm-apps-reduce-costs-by-40-80-and-speed-up-by-250x/
[arxiv]: https://arxiv.org/html/2411.05276v3
[arxiv2]: https://arxiv.org/html/2506.14852v1
[helicone-comp]: https://www.helicone.ai/blog/top-llm-gateways-comparison-2025
[tf]: https://www.truefoundry.com/blog/langfuse-vs-portkey
[dev]: https://dev.to/debmckinney/top-5-litellm-alternatives-in-2025-1pki
[firecrawl]: https://www.firecrawl.dev/blog/best-llm-observability-tools
[hns]: https://www.helpnetsecurity.com/2026/04/16/eu-ai-act-logging-requirements/
[raconteur]: https://www.raconteur.net/global-business/eu-ai-act-compliance-a-technical-audit-guide-for-the-2026-deadline
[legalnodes]: https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks
[guardion]: https://guardion.ai/blog/llm-compliance-guide-iso-42001-eu-ai-act-soc2-gdpr-2026
