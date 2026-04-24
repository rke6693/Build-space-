# Reddit posts

Subreddit-specific. **Do not cross-post the same text** — each sub has a
different culture and the auto-mods notice.

Stagger by 30–60 minutes between subs to avoid looking coordinated. Use a
single account that already has comment history in dev subs (low-karma
brand-new accounts get auto-filtered).

---

## r/ClaudeAI (216k subs) — primary

**Posting time:** 8:00 AM PT Tuesday.

**Title:** `I shipped agentrails — Karpathy's CLAUDE.md style, mirrored to every other coding agent your team uses`

**Body:**

> If you're on this sub you've probably already pasted something Karpathy-
> shaped into your `CLAUDE.md`. That works great when everyone on your team
> uses Claude Code.
>
> Mine doesn't. I have one teammate on Cursor, one on Codex, and our PR
> reviewer bot is Copilot. Four config files. They drifted in three weeks
> and the agents started giving us conflicting "fixes."
>
> So I shipped **agentrails**: one `AGENTS.md` (Karpathy's four principles
> plus verification loops, scope discipline, the five forbidden phrases,
> dep hygiene, git discipline, stop conditions) and a 200-line zero-dep CLI
> that mirrors it to `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
> `copilot-instructions.md`. A GitHub Action fails CI when they drift.
>
> Repo: https://github.com/rke6693/Build-space-
>
> What I'd love feedback on:
>
> 1. The principles I added beyond Karpathy's four — anything you'd cut?
> 2. The lint check (`agentrails check`) currently scores 0–100. Run it
>    against your `CLAUDE.md` and tell me what false negatives you hit.
> 3. Wrapper integrations I'm missing (Windsurf, Replit, Trae, Amp).
>
> MIT, drop-in, no subscription, no telemetry. The thing I'm most uncertain
> about: I'm calling the rules "senior-engineer behavior" but really only
> the verification loops and stop conditions have rigorous evidence behind
> them — the rest is well-argued opinion. Treat accordingly.

---

## r/cursor (~150k subs) — different angle

**Posting time:** 8:30 AM PT Tuesday.

**Title:** `Cursor users: drop-in .cursorrules synced from a single AGENTS.md`

**Body:**

> Cursor users keep getting left out of the Karpathy hype because his
> `CLAUDE.md` only works in Claude Code.
>
> I shipped agentrails: one `AGENTS.md` mirrored to `.cursorrules`
> (and CLAUDE.md, GEMINI.md, copilot-instructions.md if you also use those
> agents). Same principles, your tool, no copy-paste.
>
> Drop in:
>
>     curl -O https://raw.githubusercontent.com/rke6693/build-space-/main/AGENTS.md
>     npx agentrails sync
>
> The `.cursorrules` it generates is a real file Cursor reads natively —
> it's not just a re-paste with the wrong header. Verified end-to-end with
> Cursor 0.x (current at time of post).
>
> Repo: https://github.com/rke6693/Build-space-
>
> What works in Cursor specifically:
> - The five forbidden phrases get caught reliably (Cursor's chat is the
>   most likely to say "this should work" without running it)
> - The scope discipline rule cuts down drive-by refactors a lot
>
> What doesn't:
> - Cursor sometimes ignores `.cursorrules` for edits inside very large
>   files. That's a Cursor thing, not a rules thing — flagging.
>
> MIT. Drop-in. PRs welcome if you want to add Cursor-specific rules.

---

## r/programming (6M subs) — heaviest skepticism

**Posting time:** 9:00 AM PT Tuesday.

> r/programming is allergic to anything that smells like marketing. Lead
> with the technical artifact, not the project.

**Title:** `We CI-checked our AI coding agents' rules. The first run scored 47/100.`

**Body:**

> Three months ago my team noticed that `CLAUDE.md`, `.cursorrules`, and
> `.github/copilot-instructions.md` had quietly drifted apart. Different
> agents were giving different fixes for the same bugs. Nobody owned the
> rules.
>
> I built a small CLI that:
>
> 1. Treats `AGENTS.md` (the LF-stewarded open spec) as the source of
>    truth.
> 2. Mirrors it to `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
>    `.github/copilot-instructions.md` on every commit.
> 3. Lints `AGENTS.md` for 5 required principles (verification, scope,
>    ambiguity-handling, stop conditions, tradeoffs) and flags 5 forbidden
>    phrases that mean something got skipped ("this should work," "I
>    simplified the logic," etc.).
> 4. Fails CI if the wrappers drift or the lint score drops.
>
> First time I ran it on our internal `AGENTS.md`: **47/100**. Missing
> verification loops, missing stop conditions, three forbidden phrases
> shipped to engineers as guidance. We rewrote it and now it scores 100.
>
> Open-sourced as `agentrails`: https://github.com/rke6693/Build-space-
> MIT. Zero deps. One `.mjs` file plus 200 lines of curated `AGENTS.md`.
>
> Honest caveats: behavioral change is hard to causally measure. The
> before/after transcripts in the repo are illustrative composites. The
> only thing I'm A/B testing right now is lint score vs. PR review pass
> rate — too few data points to publish yet.

---

## r/ChatGPTCoding (~80k subs)

**Posting time:** 11:00 AM PT Tuesday.

**Title:** `Drop-in rules for Codex, Cursor, Copilot, Claude — one file, all of them`

**Body:**

> If you're using more than one coding agent (almost everyone is now), you
> probably maintain `CLAUDE.md` AND `.cursorrules` AND
> `.github/copilot-instructions.md` AND `GEMINI.md`. They drift.
>
> agentrails: one `AGENTS.md`, mirrored to all of them by a 200-line CLI.
> Plus a CI lint that fails when they drift.
>
> 30-second install:
>
>     curl -O https://raw.githubusercontent.com/rke6693/build-space-/main/AGENTS.md
>     npx agentrails sync
>
> The `AGENTS.md` itself is opinionated (Karpathy + verification loops +
> scope + forbidden phrases + stop conditions). Don't agree with a rule?
> Pick the ones you want from `rules/01..10` and `compose` your own.
>
> https://github.com/rke6693/Build-space-
>
> MIT, no SaaS, no telemetry.

---

## r/MachineLearning (3M subs) — only if you can frame as research

**Posting time:** Skip on launch day. Submit on T+7 with the lint-study
data ("we ran the lint on 20 popular repos' agent config files, here's
the distribution"). r/MachineLearning rejects vendor posts hard.

---

## r/opensource (~150k subs)

**Posting time:** 10:00 AM PT Tuesday.

**Title:** `agentrails — MIT-licensed, zero-dep, drop-in rules for AI coding agents`

**Body:**

> Open-source maintainers: your contributors increasingly use AI coding
> agents. PRs are getting noisy — drive-by refactors, invented APIs,
> unverified claims.
>
> agentrails is one `AGENTS.md` you drop into your repo. Every contributor's
> agent (Claude Code, Codex, Cursor, Gemini, Copilot, Aider) reads it
> before they open a PR.
>
> The canonical file enforces:
>
> - "Don't invent files / functions / APIs" (no more hallucinated imports
>   in PRs)
> - "Run the tests before declaring done"
> - "No drive-by refactors" (no more 800-line PRs for 4-line bug fixes)
> - "No `--no-verify`, no force-push to main"
>
> Zero dependencies. One markdown file plus a 200-line CLI. MIT.
>
> https://github.com/rke6693/Build-space-

---

## r/SideProject and r/IndieHackers — week 2, not launch day

These subs reward "I built a thing, here's what I learned and what I made"
posts after the project has metrics. Save for T+7 with stars/usage data.

---

## Reddit engagement playbook

- **Reply to every top comment within 30 minutes for the first 4 hours.**
  Reddit's algorithm weights early engagement heavily.
- Format replies in markdown. Reddit users notice.
- **Never** edit a post to add "EDIT: thanks for the upvotes!" — looks
  needy and gets downvoted.
- If a comment goes hostile, reply once with substance and move on. Don't
  feed it.
- If a thread gets locked or removed, do **not** repost. PM the mods, ask
  why, fix the issue, then come back in 30 days.
- Don't post to more than 4 subs in 24 hours. Reddit's site-wide spam
  filter triggers around 5 in a short window.
- Use the same account everywhere; brand-new accounts get auto-filtered
  on r/programming.

---

## Backup posts (if launch day underperforms)

If by 6pm PT none of the launches has hit 100 upvotes, switch to plan B
on **T+1**:

- **r/programming, T+1:** "I lint-checked the AGENTS.md of 20 popular
  repos. Here's the distribution." (Generates the data first, then posts.)
- **r/cursor, T+1:** "I wrote a script to mirror Cursor's `.cursorrules`
  from a master file. Reasonable / reinventing the wheel?"

These reframe the launch as a *finding* or a *question* rather than an
announcement, which Reddit responds to better when the announcement format
underperforms.
