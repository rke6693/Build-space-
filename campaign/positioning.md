# Positioning

## The single sentence

> **One `AGENTS.md`. Every coding agent. Senior-engineer behavior.**

Test: if a developer reads this, can they predict what's in the repo? Yes.

## Three-sentence elevator

> Every team using AI coding agents now maintains four near-identical config
> files: `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
> `.github/copilot-instructions.md`. agentrails ships one canonical
> `AGENTS.md` — synthesizing Karpathy's principles, Cherny's Claude Code
> workflow, and a year of community lessons — plus a 200-line CLI that keeps
> all the wrappers mirrored. Drop it in, run `npx agentrails sync`, and every
> coding agent in your repo behaves like a senior engineer instead of an
> eager intern.

## Category we're fighting for

**"AI coding agent operating standard"** — the rules-of-engagement layer
that sits between a coding agent and a codebase.

We are *not*: a model, a framework, an IDE plugin, a SaaS, a benchmark,
or a "platform." We are a markdown file plus 200 lines of glue.

## What we're against (the status quo)

| Status quo | Why it's broken |
|---|---|
| Every team writes their own `CLAUDE.md` | Same anti-patterns get rediscovered, wastes weeks per team |
| One file per tool | Drift; rules in `CLAUDE.md` contradict `.cursorrules` |
| `andrej-karpathy-skills` (Claude-only) | Doesn't help the 50% of teams using Codex / Cursor / Copilot |
| Vendor-shipped defaults | Generic, can't be customized, can't be audited in CI |
| "Awesome" link lists | Reading 80 links isn't a working solution |

## What we're for (positive frame)

> "Senior-engineer behavior in every coding agent, enforced by your CI."

Three things make this true:
1. **Cross-tool:** one source of truth, mirrored to every agent's config file
2. **Modular:** swap rules in/out from `rules/`; compose your own
3. **CI-checked:** `agentrails check` fails the build when the rules drift
   or someone deletes a principle

## Messaging matrix

For each audience, the **angle** that opens the conversation. Not all are
public — some are DM-specific.

| Audience | Lead angle | Proof point |
|---|---|---|
| Claude Code power user | "Karpathy's CLAUDE.md, but for every agent your team uses too" | 4 wrappers synced from one file |
| Cursor user feeling left out of the Karpathy hype | "Same principles, your tool" | `.cursorrules` is a first-class wrapper |
| Tech lead at a 50-person eng team | "CI fails when the rules drift" | the GitHub Action |
| Open-source maintainer | "Your contributors' agents will follow your rules" | drop-in, MIT, no service to subscribe to |
| Skeptic ("just a markdown file") | "200 lines, before/after transcripts, lint scores 0–100" | examples/before-after.md |
| Solo developer | "30-second install, one file, no subscription" | curl + npx, that's it |
| AGENTS.md community / LF AAIF | "We're a strict superset of the spec, contributing back" | upstream PRs |

## Differentiation table (for the README's FAQ and outreach)

| Project | Single tool | Single file | Modular rules | CI lint | Sync wrappers | Active in 2026 |
|---|---|---|---|---|---|---|
| `andrej-karpathy-skills` | Claude Code | ✅ | ❌ | ❌ | ❌ | ✅ |
| `agents-md` (Donahoe) | cross | ✅ | ❌ | ❌ | partial | ✅ |
| `awesome-claude-code` | Claude Code | ❌ (link list) | ❌ | ❌ | ❌ | ✅ |
| `awesome-claude-code-subagents` | Claude Code | ❌ | ✅ | ❌ | ❌ | ✅ |
| `claude-skills` (alirezarezvani) | cross (8+ tools) | ❌ | ✅ | ❌ | ❌ | ✅ |
| **agentrails** | **cross (8+ tools)** | **✅** | **✅** | **✅** | **✅** | **✅** |

This table goes in: README, blog post, every comparison thread.

## Words to use / words to avoid

**Use:** "drop-in", "canonical", "principles", "verification loops", "scope
discipline", "sync", "lint", "before/after", "senior engineer".

**Avoid:** "revolutionary", "10x", "game-changer", "AI-powered" (everything
on this list is AI-powered, the phrase is empty), "supercharge", "next-gen",
"democratize". And no emoji in headlines.

## Headline test

A headline passes if a tired developer can scroll past it on Twitter and
*still* know what the project is. Failing examples:

- ❌ "I built something that helps with AI coding agents"
- ❌ "Introducing agentrails — the future of coding agents"
- ❌ "🚀 The ULTIMATE AGENTS.md repo just dropped 🔥"

Passing examples:

- ✅ "agentrails: one AGENTS.md, every coding agent"
- ✅ "Karpathy's CLAUDE.md, but for Codex, Cursor, Gemini and Copilot too"
- ✅ "We CI-checked our AI coding rules. The first run scored 47/100."

## Risk and counter-positioning

**Risk:** someone (Anthropic, Cursor, the AGENTS.md spec) ships an official
version and obsoletes us.

**Counter:** that's a *win* for the category — and we contribute the rules
upstream from day 1. The repo's value isn't the file, it's the curated
*principles* and the CI-checkable *workflow*. Even if the spec absorbs the
file, the rules library, the sync tool, and the lint stay useful.

**Risk:** "this is just opinions in markdown."

**Counter:** correct. Opinions are the product. The before/after transcripts
in `examples/` show that small wording changes produce large behavior
changes. The CLI gives you a way to enforce them.
