# Press kit

Everything someone needs to write about agentrails without contacting us.

---

## One-liners

Pick by length.

**6 words:**
> One AGENTS.md. Every coding agent.

**12 words:**
> One AGENTS.md. Every coding agent. Senior-engineer behavior, enforced by
> your CI.

**25 words:**
> agentrails ships one canonical `AGENTS.md` plus a 200-line CLI that
> mirrors it to `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
> `copilot-instructions.md` — keeping every coding agent on the same rules.

**50 words:**
> Every team using AI coding agents now maintains four near-identical
> config files. agentrails replaces them with one canonical `AGENTS.md` —
> synthesizing Karpathy's four principles, Boris Cherny's Claude Code
> workflow, and a year of community lessons — plus a CLI and CI lint that
> keep every agent's wrapper file in sync. MIT-licensed, drop-in, no
> subscription.

**100 words:**
> In April 2026, a single `CLAUDE.md` file
> ([andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills))
> hit 70k stars in three weeks — proving that the highest-leverage upgrade
> for an AI coding agent is giving it good rules. But that file only works
> in Claude Code. **agentrails** ships one canonical `AGENTS.md` —
> compatible with the Linux Foundation's open spec — plus a 200-line
> zero-dependency CLI that mirrors it to `CLAUDE.md`, `GEMINI.md`,
> `.cursorrules`, and `.github/copilot-instructions.md`. A GitHub Action
> fails CI if anyone deletes a principle or lets the wrappers drift.
> MIT-licensed, drop-in in 30 seconds.

---

## Project boilerplate (for press release / about-us footers)

> **agentrails** is an open-source operating standard for AI coding agents.
> A single `AGENTS.md` file plus a zero-dependency CLI and CI lint, it
> keeps Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Aider,
> opencode, and Devin all reading the same set of senior-engineer rules.
> Built on Karpathy's four principles and the Linux Foundation's
> [`AGENTS.md`](https://agents.md) spec. MIT-licensed. Source:
> github.com/rke6693/Build-space-.

---

## Quotable lines (for journalists / influencers to quote)

Each line is self-contained, attributable, and frames the project clearly.

> "Every team running AI coding agents now maintains four near-identical
> config files. The fix was a single markdown file."

> "Karpathy proved that one good `CLAUDE.md` can change agent behavior at
> scale. We made it work in every other agent too."

> "We CI-check the rules. The first repo we lint scored 47 out of 100. It
> had a 600-line `AGENTS.md` and was still missing verification loops and
> stop conditions."

> "The product is the *opinions*. The CLI just keeps them mirrored."

> "Five forbidden phrases. If your agent ever says one, something got
> skipped: 'this should work,' 'I simplified the logic,' 'for robustness,'
> 'to be safe I also,' 'I noticed and fixed.'"

> "Coding agents in 2026 are senior engineers paid by the token. They need
> a senior engineer's standards, not a chatbot's."

---

## Founder / maintainer bio (one paragraph)

> [Maintainer name] builds developer tools at the seam where AI agents
> meet real codebases. Previously [prior role]. Has been running coding
> agents on production code since [year]. Lives in [city]. Reachable at
> [email]. Talks at conferences about agent operating standards, AI
> coding workflows, and the surprisingly large effect of small markdown
> files. <https://github.com/[handle]>

*(Replace bracketed fields. Keep under 70 words. Journalists copy-paste.)*

---

## Key facts (for fact-checking)

- **Project name:** agentrails
- **License:** MIT
- **Language:** Markdown + Node.js (CLI is one `.mjs` file, zero deps)
- **First public commit:** April 2026
- **AGENTS.md size:** 200 lines (target ≤ 250 enforced by lint)
- **Modular rules:** 10 in `rules/01..10`
- **Wrapper files generated:** `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `.github/copilot-instructions.md`
- **CLI commands:** `sync`, `check`, `compose`, `list`
- **Agents tested with:** Claude Code, Codex CLI, Cursor, Gemini CLI,
  GitHub Copilot, Aider, opencode, Devin
- **Repo:** <https://github.com/rke6693/Build-space->

---

## Social preview / OG image spec

Image dimensions: **1200×630 px** (Twitter/Open Graph standard).

**Layout:**
- Background: matte off-black (`#0F1115`), subtle dot grid
- Centered title, two lines, sans-serif (Inter or IBM Plex Sans):
  - Line 1: `agentrails` in 110pt monospace, white
  - Line 2: `One AGENTS.md. Every coding agent.` in 60pt regular, slightly muted
- Below the title, a horizontal row of small monospace tags:
  `claude code · codex · cursor · gemini · copilot · aider · opencode · devin`
- Bottom-left: small repo handle in muted text:
  `github.com/rke6693/build-space-`
- Bottom-right: a tiny terminal frame showing:
  ```
  $ npx agentrails sync
  wrote CLAUDE.md
  wrote GEMINI.md
  wrote .cursorrules
  wrote .github/copilot-instructions.md
  ```
- No emoji. No screenshots of full files. No human faces.

**Generation prompt** (if using an AI image tool — verify the result by
hand, AI rendering of monospace text is unreliable, prefer Figma):

> Minimal developer-tool social card, 1200×630, matte off-black background
> (#0F1115) with a subtle dot grid. Center: the word "agentrails" large in
> white monospace, with a smaller subtitle "One AGENTS.md. Every coding
> agent." Bottom: small monospace list of agent names. No emoji, no people.
> Style: GitHub README aesthetic, Vercel marketing aesthetic.

**Test:** screenshot the preview as Twitter/Slack/iMessage would render
it. Read at 360px wide. If the title isn't legible, the image is wrong.

---

## Logo & brand

**Wordmark:** `agentrails` lowercase, monospace (default to JetBrains Mono
or IBM Plex Mono). No icon required at launch — a wordmark is enough and
keeps the project from feeling like a corporate brand.

**Color palette:**
- Black: `#0F1115`
- Off-white: `#F5F5F2`
- Accent green (for terminal output, very sparing): `#3DDC84`
- Muted gray (for body text on dark): `#7B7F89`

No gradients. No glows. The brand is "competent and quiet."

---

## Standard responses (for journalists / podcasters)

**"Why does this matter?"**
> Because the highest-leverage change you can make to a coding agent is
> giving it good rules — but every team rediscovers the same lessons by
> trial and error. agentrails makes the lessons portable.

**"Isn't this just a markdown file?"**
> Yes. That's why it's adoptable in 30 seconds. The product isn't the file
> format — it's the curated principles, the CI lint that enforces them,
> and the sync tool that keeps every agent on the same rules.

**"Does this replace [Cursor / Claude Code / Copilot]?"**
> No. It works *inside* those tools. Each one already reads its own config
> file. agentrails generates all of those files from one source so they
> can't drift.

**"Is this affiliated with Anthropic / OpenAI / Google?"**
> No. It's an independent open-source project. We follow the AGENTS.md
> open spec stewarded by the Linux Foundation's Agentic AI Foundation.

**"What's the business model?"**
> None. MIT-licensed, no SaaS, no cloud, no telemetry. If a future paid
> product fits the project, it'll be a separate thing — the rules library
> stays free forever.
