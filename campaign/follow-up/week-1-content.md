# Week 1 follow-up content (T+1 to T+7)

Pre-queued so you can ship daily without dropping engagement after launch.
Each day: one core post + 1–2 short engagement-driven posts.

**Rule:** if launch day went poorly (HN <100 points, Twitter <500
impressions, Reddit removed), pause this calendar and switch to triage.
The content below assumes a baseline of "the post landed, people are
clicking, the repo is gaining stars."

---

## T+1 (Wednesday) — "What the launch numbers say"

Goal: transparency post. People love post-launch retrospectives, and
they generate 2x the engagement of the launch itself if numbers are
honest.

**Twitter (single post or short thread, ~3 tweets):**

> 24 hours after shipping agentrails:
>
> ⭐ [N] stars
> 🍴 [N] forks
> 👀 [N] HN points (peaked at #[N])
> 📥 [N] issues / [N] PRs opened
>
> Top criticism: [PARAPHRASED REAL CRITICISM]
> Best surprise: [PARAPHRASED REAL UPSIDE]
>
> What I'd do differently: [HONEST]

**dev.to or Hashnode (~600-word post):**

Title: "What I learned shipping a viral-shaped GitHub repo (the honest
numbers)"

- The launch sequence: HN → Twitter → Reddit
- Where the traffic actually came from (with rough %s)
- What worked: [LIST]
- What didn't: [LIST]
- The ratio of stars to actual *adopters* (always sobering)

**Don't:** brag. Numbers without context look like flexing. Numbers with
analysis look like a postmortem, which is shareable.

---

## T+2 (Thursday) — "The five forbidden phrases"

Goal: peel off the single most-shareable rule into a standalone post.
This will outperform the launch thread if framed right.

**Twitter (image-first single post):**

> The five phrases your AI coding agent should NEVER say:
>
> "This should work." → I didn't run it.
> "I've simplified the logic." → I deleted code I didn't understand.
> "For robustness, I added…" → I added a try/except that swallows errors.
> "To be safe, I also…" → I expanded scope without asking.
> "I noticed and fixed…" → I changed something unrelated.
>
> If your agent says one of these, something got skipped.

**Image:** clean dark-mode card. Each phrase on a row, the "actually
means" on a second line in muted color. Generate in Figma; do *not*
auto-generate, monospace text rendering by AI tools is unreliable at
small sizes.

**LinkedIn (longer version):**

> Five phrases your engineers' AI coding agents should never say —
> because each one means a step got skipped. After running this rule
> across [N] repos, the most common one in shipped LLM-assisted PRs is
> "this should work." It means the agent didn't run the tests. The fix
> in our AGENTS.md is one line: "'I think this works' is not
> verification."
>
> Five phrases. Five anti-patterns. Drop them into your `AGENTS.md`
> today: github.com/rke6693/Build-space-

---

## T+3 (Friday) — "Before & after"

Goal: receipts. Show what changes when the rules are in place.

**Twitter (5-tweet mini-thread):**

> Same prompt: "Fix the off-by-one in the pagination."
>
> Same model. Different rules. ↓

> WITHOUT agentrails: 800-line PR. Renames the function. Extracts a
> helper. Adds pagination to two unrelated endpoints. Updates the
> README. "This should work." [screenshot]

> WITH agentrails: identifies *which* of the two pagination call sites
> is the off-by-one. One-line fix. One regression test, run, green.
> Flags the second site without touching it. [screenshot]

> The difference is one line in AGENTS.md: "Do exactly what was asked.
> A bug fix does not need surrounding cleanup."

> Repo: github.com/rke6693/Build-space-
> Examples folder has 4 more transcript pairs.

**Bluesky:** post a single condensed version, one screenshot.

---

## T+4 (Saturday) — engage only, no posting

Saturdays die on every dev channel. Don't post launches, posts, or
updates. **Use the day to:**

- Reply to issues and PRs
- Read every HN/Reddit comment from the week and write down patterns
- Outline week 2 content based on what's actually resonating

If something was a runaway hit (e.g., the forbidden phrases tweet went
to 1M impressions), draft the *follow-on* for Monday.

---

## T+5 (Sunday) — long-form blog cross-post

Goal: capture the long-tail Sunday-evening developer-blog audience.
People bookmark on Sunday, click on Monday.

**Title:** "AGENTS.md is the new package.json (a case for one operating
file per repo)"

~1200 words. Outline:

1. Setup: every repo grows a constellation of config files. Why?
2. Each agent reads a different file. Each team writes a different
   `CLAUDE.md`. Drift.
3. The standardization argument: AGENTS.md is what `package.json` was
   to npm — a single file every tool agrees on.
4. What the standardization unlocks: CI lint, sharing rules, comparing
   teams.
5. The opinionated default (agentrails) and how to fork it.
6. What's *not* yet standardized (skill files, tool registries) and
   what comes next.

Cross-post: dev.to, Hashnode, Medium, personal blog (canonical).

---

## T+6 (Monday) — "Why your AGENTS.md fails the lint"

Goal: utility post that brings *new traffic* by being practical, not by
being announce-shaped.

**Twitter (10-tweet thread):**

The 10 most common reasons `agentrails check` returns < 80, with the
fix for each. Examples:

> 1/ Missing verification loops. Your AGENTS.md says "be careful" but
> doesn't say "run the typecheck and the tests." Fix: add the
> verification-loops section. Template:
> github.com/rke6693/Build-space-/blob/main/rules/02-verification-loops.md

> 2/ No stop conditions. Your agent doesn't know when to ask. Without
> this, it pushes through failures. Fix: list 5 specific situations
> where it should stop and surface to the human.

> 3/ Vague principles ("write good code"). The lint won't catch these
> directly but the agent can't act on them. Replace with specific
> negatives: "don't invent files," "don't use --no-verify."

… (continue for all 10)

**Reddit (r/programming, T+6):**

Same content, formatted as a top-level post. Title: "I lint-checked
the AGENTS.md files of 20 popular GitHub repos. Here are the patterns."

This is the post that earns the credibility. It must be **real data**
— actually run the lint across 20 real repos before posting and
publish the table.

---

## T+7 (Tuesday) — "Add a rule"

Goal: convert audience into contributors.

**Twitter:**

> One week of agentrails. ⭐ [N] stars, [N] PRs merged.
>
> The thing I'm proudest of: the rules library is meant to be
> contributed to. If you've added something to your `AGENTS.md` that
> caught a real bug or saved a real review cycle — open a PR.
>
> Rule template: 1 file, ~40 lines, before/after example required.
>
> github.com/rke6693/Build-space-/blob/main/rules/

**Discord / Slack communities (Anthropic, Cursor, OpenAI dev,
agentic-ai foundation):**

> Hey — week 1 of agentrails (one AGENTS.md, every coding agent) is
> done. Stars climbing, but the *next* phase is community-driven
> rules. If your team has a CLAUDE.md or .cursorrules section that's
> caught real bugs, send it as a PR — the rules/ folder is meant to
> grow.
>
> Template + example: github.com/rke6693/Build-space-/blob/main/rules/01-karpathy-canon.md
>
> One concrete ask: a "Python type-hints discipline" rule and a
> "test fixtures hygiene" rule are both gaps right now. Anyone
> deep in those?

---

## Hard rules for week 1

- **Don't repeat the launch announcement.** No "missed it? Here's
  agentrails" tweets. Once is enough.
- **Don't post engagement-bait questions.** "What's YOUR favorite
  AGENTS.md rule? RT and tell us!" reads as desperate.
- **Don't pile on every news event.** If Anthropic ships something
  new, comment thoughtfully if it's actually relevant; don't graft
  agentrails onto unrelated news.
- **Do** reply to every meaningful comment within 4 hours, every
  PR within 24 hours, every issue within 48 hours.
- **Do** retire any post that flops within 1 hour by deleting it
  (Twitter only — never delete on HN, Reddit, LinkedIn).

---

## Backup posts (if a planned post falls flat)

If T+2's forbidden-phrases post gets <300 impressions in the first hour
(implying it's getting algorithm-buried), pivot to the backup:

**Backup post — "I rewrote my pre-commit hook to fail on a CLAUDE.md
forbidden phrase":**

A code-snippet post showing how to wire the lint into a git hook. More
practical, less aphoristic. Will land with the *practitioner* audience
even if the aphorism audience didn't bite.

```bash
# .git/hooks/pre-commit
#!/bin/sh
node bin/agentrails.mjs check || {
  echo "AGENTS.md lint failed — fix before committing"
  exit 1
}
```
