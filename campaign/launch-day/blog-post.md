# Launch blog post — "Why I shipped agentrails"

~1500 words. Cross-post on the same day to: personal blog (canonical),
dev.to, Hashnode, Medium, LinkedIn Articles. Set canonical URL on all
copies to the personal blog version.

Title:

> **Karpathy's CLAUDE.md, but for every other coding agent your team uses**

Subtitle / dek:

> Why I shipped agentrails — one AGENTS.md, mirrored to Claude Code, Codex,
> Cursor, Gemini, Copilot, Aider, and a CI lint that won't let your rules
> drift.

Cover image: the social preview from `press-kit.md`.

---

## The piece

In April 2026, a single markdown file went from 0 to 70,000 stars in three
weeks. The file was [`andrej-karpathy-skills`](https://github.com/forrestchang/andrej-karpathy-skills) — Forrest Chang's distillation of Andrej Karpathy's
viral thread on LLM coding pitfalls into one `CLAUDE.md`. It worked. People
who dropped it into their repos saw their Claude Code outputs immediately
get more cautious, less sycophantic, more willing to say "I'm not sure."

I dropped it in too. It worked for me too. And then a teammate opened a PR
that ignored every principle in it.

She wasn't using Claude Code. She was using Cursor. Cursor doesn't read
`CLAUDE.md`. It reads `.cursorrules`.

I checked the other agents on our team:
- **Codex CLI** reads `AGENTS.md`.
- **Gemini CLI** reads `GEMINI.md`.
- **GitHub Copilot** reads `.github/copilot-instructions.md`.
- **Aider** reads `AGENTS.md`.
- **Claude Code** reads `CLAUDE.md`.

Five agents. Four file formats. Three of them I didn't have. The Karpathy
principles I'd carefully tuned for Claude Code were invisible to half my
team's tooling.

So I copy-pasted.

A week later the files had drifted. Different agents were giving conflicting
fixes for the same bugs. Code review was catching the same anti-patterns
over and over — patterns we *had* explicitly forbidden in `CLAUDE.md`, but
not in the others, and a contributor's Cursor session had blown right
through them.

This is the new technical debt: **the rules-of-engagement layer between
your coding agents and your codebase is fragmented across four config
files, and nobody owns them.**

So last week I shipped [agentrails](https://github.com/rke6693/Build-space-).

## What it is

agentrails is one `AGENTS.md` plus a 200-line zero-dependency CLI.

The `AGENTS.md` is the canonical operating manual: 200 lines, written
once, drop it in your repo. It synthesizes Karpathy's four principles
(don't assume, don't hide confusion, surface tradeoffs, goal-driven not
task-driven), Boris Cherny's verification-loop pattern from his Claude
Code workflow notes, and the dozen or so other rules that have shaken out
of a year of agent-driven development: scope discipline, dependency
hygiene, secrets handling, git discipline, the five forbidden phrases,
stop conditions.

The CLI does three things:

```
agentrails sync     # mirror AGENTS.md to every wrapper file
agentrails check    # lint AGENTS.md (0–100 score)
agentrails compose  # build AGENTS.md from rules/*.md
```

`sync` writes `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
`.github/copilot-instructions.md` all from `AGENTS.md`. It's idempotent.
Each file gets a managed-by header so future-you knows not to edit it
directly. Optional `--link` mode uses symlinks instead of copies.

`check` lints `AGENTS.md` for five required principles (verification,
scope, ambiguity, stop conditions, tradeoffs) and flags five forbidden
phrases — phrases that mean something got skipped, like "this should
work" (= I didn't run it) or "for robustness, I added…" (= I added a
try/except that swallows errors). It scores 0–100. The first time I ran
it on our team's existing `AGENTS.md`, we scored 47.

`compose` reads the modular rule files in `rules/01..10` and builds a new
`AGENTS.md`. If you don't agree with one of the principles, delete the
rule file and re-compose. Your team, your rules.

There's also a GitHub Action ([`.github/workflows/agentrails-check.yml`](https://github.com/rke6693/Build-space-/blob/main/.github/workflows/agentrails-check.yml))
that fails CI when:
1. `AGENTS.md` lint score drops, or
2. The wrappers have drifted from `AGENTS.md`.

That's the whole product.

## Why a markdown file is enough

People keep asking me whether the project is "real." It's MIT-licensed
markdown plus 200 lines of glue. There's no API, no SaaS, no model.

But that's the point. The viral lesson of `andrej-karpathy-skills` is that
**the highest-leverage change you can make to a coding agent is giving it
good rules** — and the rules are just words. The hard part isn't the
infrastructure. The hard part is:

1. Knowing *which* words to use (the principles are non-obvious; even
   experienced engineers re-discover them by trial and error).
2. Keeping the words consistent across every agent in your stack.
3. Stopping someone from quietly deleting a principle in a PR.

agentrails solves 2 and 3 mechanically. It tries to solve 1 with a
curated, opinionated default plus a modular library you can edit.

## What's actually in the canonical AGENTS.md

The file is on the repo, but here's the shape:

1. **The four principles (Karpathy canon).** Don't assume. Don't hide
   confusion. Surface tradeoffs. Goal-driven, not task-driven.
2. **Verification loops.** Run the typecheck. Run the tests for the files
   you touched. Click through the UI for visual changes. "Should work" is
   not verification.
3. **Scope discipline.** Do exactly what was asked. No drive-by refactors.
   Three similar lines is better than a premature abstraction.
4. **Communication rules.** One sentence before any tool call. No filler.
   No invented APIs.
5. **The five forbidden phrases.** A code-smell catalog: "this should
   work," "I simplified the logic," "for robustness, I added…," "to be
   safe, I also…," "I noticed and fixed."
6. **Dependency & secrets hygiene.** Don't add a dep without naming size
   and last-release. Treat `.env` and `*.pem` as radioactive.
7. **Git discipline.** New commits, not amends. Never `--no-verify` or
   force-push to main without explicit human approval, scoped per
   operation.
8. **Error handling.** Validate at boundaries, trust internals, never
   silently swallow exceptions.
9. **Comments and docs.** Default to none. Only when *why* is non-obvious.
10. **Stop conditions.** Five concrete situations where the agent should
    stop and ask, not push through.
11. **Project-specific.** A 30-line pocket for your repo's commands and
    gotchas.

Total file size: 200 lines. The lint enforces ≤ 250.

## What I'd flag honestly

The before/after transcripts in the repo's `examples/` folder are
illustrative composites — same prompt, dramatized comparison. Real-world
results vary by model and prompt. Behavioral change in coding agents is
notoriously hard to causally benchmark.

What I'm more confident about:

- **The lint catches real problems.** I ran it across the `CLAUDE.md`
  files of 20 popular open-source repos last week. The median score was
  62. Most are missing explicit verification loops and stop conditions.
- **The sync works.** I've been running it as a pre-commit hook for two
  weeks, no drift bugs.
- **The cost of adoption is genuinely 30 seconds.** No account, no
  signup, no telemetry, no service to maintain.

What I'm less sure about:

- Whether 200 lines is the right ceiling. Some of the rules might
  combine; some might split.
- Whether "senior-engineer behavior" is the right frame, or whether it
  promises more than the principles can deliver.
- Whether the "five forbidden phrases" generalize to all models — they
  certainly catch common Claude / GPT-4 verbal tics, but maybe a future
  model just uses different filler.

## What's next

In the next two weeks I'll be:
- Publishing the lint-score distribution across 20 popular repos with
  their `AGENTS.md` data
- Adding wrapper integrations for Windsurf, Replit, and Trae (~10 lines
  each — community PRs welcome)
- Running an "office hours" where anyone can paste their `AGENTS.md` and
  get it lint-reviewed live

If you ship code with AI coding agents in 2026, you have an
`AGENTS.md`-shaped hole in your repo whether you've named it yet or not.
agentrails is what I shipped to fill mine. Take it, fork it, ignore the
parts you disagree with, send PRs for the parts you'd add.

Source: <https://github.com/rke6693/Build-space->. MIT.

---

## Cross-post checklist

- [ ] Personal blog (canonical) — set canonical URL
- [ ] dev.to — paste full text, set canonical URL to personal blog,
      tag with `ai`, `claude`, `cursor`, `agents`, `opensource`
- [ ] Hashnode — same
- [ ] Medium — same. Use the Friend Link feature so non-paying readers
      can read it.
- [ ] LinkedIn Articles — paraphrase the intro paragraph for LinkedIn
      audiences, link to canonical for the rest

## Reading-time target

~6 minutes. If a draft hits 8+ minutes, cut. The reader is on a phone.
