# LinkedIn, Bluesky, Mastodon, Threads

Three different audiences, three different tones. Same project.

---

## LinkedIn — for ICP 3 (tech leads)

**Posting time:** 7:30 AM PT Tuesday (most US tech-lead engagement
happens 7–10am Pacific or 11am–2pm Eastern).

**Tone:** Consequential, not promotional. Lead with the *organizational*
problem.

**Image:** the social preview card from `press-kit.md`.

**Post:**

> Three months ago I noticed our engineering org had quietly grown a new
> kind of technical debt: four AI coding agent config files, one per tool,
> all out of sync.
>
> CLAUDE.md said one thing. .cursorrules said another. Nobody owned them.
> Different teams' agents were giving conflicting fixes for the same bugs.
> Code review was catching the same anti-patterns over and over because the
> rules that would've prevented them lived in one config file but not the
> others.
>
> So I built **agentrails**: one canonical AGENTS.md, mirrored to every
> tool's wrapper, with a CI check that fails the build when they drift or
> when someone deletes a principle.
>
> The principles in the canonical file are not invented — they're
> synthesized from Andrej Karpathy's four rules, Boris Cherny's Claude
> Code workflow, and the Linux Foundation's open AGENTS.md spec. The value
> isn't the file format, it's:
>
> 1. **One source of truth** across every coding agent your org uses.
> 2. **CI-enforced** — your engineers can't quietly weaken the rules in a
>    PR.
> 3. **Modular** — you keep the principles you agree with, you swap the
>    rest, you compose your own.
>
> If your org has more than one team using more than one coding agent —
> and most do now — this is the governance layer you're missing.
>
> MIT-licensed, no SaaS, no signup. Drop one file into your repo, run
> `npx agentrails sync`, done.
>
> github.com/rke6693/Build-space-
>
> Honest disclosure: I shipped this last week. The before/after impact
> claims in the README are illustrative, not benchmarked — behavioral
> change in coding agents is hard to causally measure. What I AM measuring
> and will publish in a few weeks: linter score distribution across the
> AGENTS.md files of 20 popular open-source repos.
>
> #DeveloperTools #AIAgents #OpenSource #AGENTS_md

**Why this works on LinkedIn:**
- Opens with a *consequence* ("technical debt") not a feature
- Names the *organizational* failure mode (conflicting fixes, ownership)
- Frames it as *governance* — a word that resonates on LinkedIn the way
  "anti-pattern" resonates on HN
- Pre-empts skepticism with the honest-disclosure paragraph
- Hashtags only at the bottom, sparingly

---

## Bluesky — for ICP 4 (open-source maintainers, post-Twitter dev crowd)

**Posting time:** 10:00 AM PT Tuesday (Bluesky peaks slightly later than
Twitter; the audience is more West-coast and more European).

**Tone:** Conversational, link-friendly (Bluesky doesn't penalize links
the way Twitter does). Threads work fine.

**Post (single, with one follow-up):**

> if your repo's contributors are using AI coding agents — and they
> increasingly are — you should ship an AGENTS.md.
>
> agentrails: one drop-in AGENTS.md (Karpathy principles + verification +
> scope + stop conditions) mirrored to CLAUDE.md, GEMINI.md, .cursorrules,
> copilot-instructions.md. CI fails when they drift.
>
> github.com/rke6693/Build-space-

**Follow-up reply (~30s later):**

> what it changes for maintainers: contributor PRs stop hallucinating
> imports, stop drive-by-refactoring unrelated code, and stop saying "this
> should work" without running the tests. their agent reads your rules
> before opening the PR.
>
> MIT, zero deps, no SaaS.

---

## Mastodon — for ICP 4 (FOSS-leaning maintainers)

**Posting time:** 10:30 AM PT Tuesday.

**Server choice:** post from your primary instance. Don't cross-instance.

**Tone:** Even less salesy than Bluesky. Mastodon hates marketing language.

**Post (single, with content warning if your instance norms expect one):**

> Maintainers, this might help: a single AGENTS.md that every coding agent
> your contributors use will read — Claude Code, Codex, Cursor, Gemini,
> Copilot, Aider.
>
> Drops in. MIT-licensed. Zero dependencies. Generated wrappers stay synced
> via a small CLI.
>
> The thing it actually fixes: PRs stop introducing hallucinated imports
> and drive-by refactors, because the contributor's agent read your rules
> first.
>
> Source: https://github.com/rke6693/Build-space-

---

## Threads — secondary, low effort

**Posting time:** anytime in the launch window. Threads is mostly a Meta
audience play and not core for dev tools, but cross-posting takes 30
seconds.

**Post:**

> One AGENTS.md, every coding agent. Drop it into your repo and Claude
> Code, Codex, Cursor, Gemini, and Copilot all read the same rules.
>
> github.com/rke6693/Build-space-

---

## Cross-posting hygiene

- **Don't** auto-syndicate. Each post should be tonally tuned to its
  channel — LinkedIn formal, Bluesky/Masto informal, Twitter punchy.
- **Don't** post the same image on every channel without resizing — Bluesky
  prefers 1200×675, LinkedIn 1200×627, Twitter 1200×630, Mastodon any.
- **Do** link only to the GitHub repo from each — avoid linking to your
  Twitter/Bluesky from LinkedIn or vice versa, looks needy.
- **Do** have a single canonical "follow me elsewhere" line in your
  GitHub README's footer instead of trying to cross-pollinate followers
  in the launch posts.
