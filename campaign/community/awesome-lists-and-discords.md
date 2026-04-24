# Community: awesome-list submissions, Discords, contributor funnel

The slow-burn channels. Weeks 1–4 of the campaign. Lower per-post traffic,
but cumulative — and the audience is the highest-quality on the internet.

---

## Awesome-list submissions

### How awesome-list submissions work

Each "awesome-X" is a curated GitHub repo (usually `awesome-foo`).
Submissions = pull requests adding a line in the relevant section.
**The PR is the marketing.** Maintainers and contributors see every PR,
and the lists themselves are aggregated into newsletters and "I starred
this" feeds.

**Hard rules:**
1. Read each list's `CONTRIBUTING.md` *before* the PR. Some require
   passing a `awesome-lint` check.
2. One PR per list. Don't bulk-submit.
3. Add to the *right* section, alphabetized correctly.
4. Use the list's exact entry format (some are `- [name](url) — desc`,
   some are `* [name](url): desc`, etc.).
5. Description: ≤ 12 words, no marketing language, no emoji, no exclamation.
6. Don't open a "feature this at the top" issue. Just add the entry.

### The list of awesome-lists to submit to

#### Week 1 (T-1 to T+3) — directly relevant lists

| Repo | Section | Suggested entry |
|---|---|---|
| `hesreallyhim/awesome-claude-code` | Skills | `- [agentrails](https://github.com/rke6693/Build-space-) — One AGENTS.md mirrored to CLAUDE.md and three other agents` |
| `kyrolabs/awesome-agents` | Tools | `- [agentrails](https://github.com/rke6693/Build-space-) — Cross-tool AGENTS.md sync + CI lint` |
| `caramaschiHG/awesome-ai-agents-2026` | Frameworks/Tools | same shape |
| `Zijian-Ni/awesome-ai-agents-2026` | Tools | same shape |
| `eudk/awesome-ai-tools` | Developer tools | same shape |
| `VoltAgent/awesome-claude-code-subagents` | Tools / Adjacent | `- [agentrails](https://github.com/rke6693/Build-space-) — Cross-tool rule sync (works alongside subagents)` |
| `agentsmd/agents.md` (if it has a "Tooling" section) | Tooling | `- [agentrails](https://github.com/rke6693/Build-space-) — CLI for syncing wrapper files from a canonical AGENTS.md` |

#### Week 2 (T+7 to T+14) — adjacent lists

| Repo | Section |
|---|---|
| `sindresorhus/awesome` | (skip — too broad to be useful) |
| `awesome-cli` lists (multiple) | Developer tools |
| `awesome-static-analysis` | Misc / linters |
| `awesome-pre-commit` | Hooks |
| `awesome-developer-tools` | DX |
| `awesome-opensource-ai` | Tools |
| Language-specific lists where AGENTS.md helps that lang's contributors | Tools |

#### Week 3 (T+15 to T+21) — long-tail, niche

- Newsletter aggregations (Console, Daily.dev custom feeds)
- Trade-niche lists (awesome-monorepo, awesome-typescript-tools, etc.)
  where the project's "rules for AI agents" angle fits

### PR template

```
title: Add agentrails

body:
Adds agentrails — one AGENTS.md mirrored to CLAUDE.md, GEMINI.md,
.cursorrules, and .github/copilot-instructions.md. Includes a CI lint
that fails when the wrappers drift or principles get weakened.

MIT-licensed, zero dependencies, drop-in.

Repo: https://github.com/rke6693/Build-space-

Submitted under [SECTION], alphabetized, follows the list's entry format.
```

If the list has a checklist (`- [ ] passes awesome-lint`, `- [ ] alphabetized`,
etc.), check every box you genuinely satisfy. Don't lie.

### Tracking

| List | PR opened | PR merged | Status |
|---|---|---|---|
| awesome-claude-code | | | |
| awesome-agents | | | |
| awesome-ai-agents-2026 (caramaschiHG) | | | |
| awesome-ai-agents-2026 (Zijian-Ni) | | | |
| awesome-ai-tools | | | |
| awesome-claude-code-subagents | | | |

Realistic merge rate: 60–70% within 14 days for a *real* dev-tool with a
working repo. If a list rejects, read why; usually it's a category fit
issue, sometimes the description was too marketing-y.

---

## Discord & Slack communities

The unsung-hero channel. Less viral than HN, but more **adopters per
visitor** by far.

### Hard rules

1. **Be a member first, share second.** Brand-new accounts that drop a
   link get auto-deleted in most communities.
2. **Use the right channel.** Don't post in #general; find #show-your-work,
   #share-projects, #show-and-tell, or the agent-specific channel.
3. **No @everyone, no @here.** Ever.
4. **One post, one community, one day.** Don't blast.
5. **Stay around to answer questions.** Drop and run is rude.

### Communities to share in

| Server | Best channel | Best day | Notes |
|---|---|---|---|
| Anthropic Discord | #share-your-projects (or equivalent) | Tuesday afternoon | Claude Code crowd; lead with the CLAUDE.md angle |
| Cursor Discord | #show-your-work | Wednesday | Cursor-specific angle; .cursorrules wrapper is the lead |
| OpenAI Developer Forum / Discord | Tools / Show-and-tell | Mid-week | Codex CLI angle |
| MLOps community Slack | #side-projects | Tuesday | Engineering-governance angle |
| Latent Space Discord | #projects | Mid-week | Long-form; this audience reads carefully |
| Indie Hackers Discord | #show-iy | Anytime | Solo-dev angle |
| The Pragmatic Engineer Discord (if member) | #side-projects | Mid-week | Tech-lead audience |
| Buildspace / YC Slack (if member) | #show-your-work | Mid-week | Indie founder audience |
| Agentic AI Foundation (Linux Foundation) Discord/Slack | #tools | Weekday | Specifically welcome here — they steward the AGENTS.md spec |

### Post template (Discord)

> Shipped this last week and figured this room would have the strongest
> opinions: agentrails — one AGENTS.md, mirrored to CLAUDE.md, GEMINI.md,
> .cursorrules, .github/copilot-instructions.md. Plus a CI lint.
>
> https://github.com/rke6693/Build-space-
>
> The angle that's relevant to this server: [TAILORED — e.g., "Cursor's
> .cursorrules is a first-class wrapper, not a copy-paste afterthought"
> for the Cursor server, or "the rules library is meant to be community-
> contributed" for AAIF].
>
> Honest about what's untested: [the thing that's least proven, in this
> server's expertise area].
>
> No ask — would love any criticism, especially of the principles I picked
> for the canonical file.

### Tracking

| Server | Channel | Posted | Reactions / replies | Adopters traced |
|---|---|---|---|---|
| ... | ... | | | |

---

## Contributor funnel

The point of community engagement isn't stars — it's **converting users
into contributors.** A repo with 50 contributors and 5k stars has a
deeper moat than a repo with 0 contributors and 50k stars.

### The funnel

1. **Visitor** lands on README.
2. **User** runs `npx agentrails sync`.
3. **Active user** runs `agentrails check` weekly, fixes their AGENTS.md.
4. **Reporter** opens an issue when something breaks.
5. **Contributor** sends a PR — usually a new wrapper or rule.
6. **Maintainer** stays around and reviews other PRs.

### Conversion levers (per stage)

| Stage | Lever |
|---|---|
| Visitor → User | Clear "30-second install" in the README. Done. |
| User → Active user | Pre-commit hook snippet in README. CI workflow as copy-paste. |
| Active user → Reporter | Friendly issue templates (see below). Quick triage. |
| Reporter → Contributor | "Help wanted" labels on tractable issues. Mentor PRs. |
| Contributor → Maintainer | Public credit in CHANGELOG. Invite to a co-maintainer org after 3+ merged PRs. |

### Issue templates (drop into `.github/ISSUE_TEMPLATE/`)

- **`bug_report.md`** — short, actionable. Asks for the failing
  `agentrails check` output and the OS.
- **`new_rule.md`** — "Propose a new rule for the rules/ library." Asks
  for the rule, the before/after example, and the anti-pattern it
  prevents.
- **`new_wrapper.md`** — "Add support for a new coding agent." Asks for
  the agent name, the file format it reads, and any header/footer
  requirements.

### Recognizing contributors

- Pin a "Hall of fame" issue with first contributors' handles.
- Tag releases with the contributor's name in the changelog
  (`v0.2 — added by @handle`).
- After a contributor's third merged PR, DM them with: *"want write
  access to the repo? You've earned it."*
- **Don't** write thank-you tweets that name a contributor unless you
  ask them first. Some contributors are private.

---

## Don't-do list

- ❌ Don't post in 12 Discords on the same day. Three at most.
- ❌ Don't private-message a Discord moderator asking them to "feature"
  the project.
- ❌ Don't @-mention well-known members of a server with a link to
  agentrails. Earn the attention.
- ❌ Don't auto-DM new server members.
- ❌ Don't open identical PRs on three awesome-lists in 5 minutes.
  Maintainers talk to each other and the project gets a "spam" label.
- ❌ Don't rage-quit if a PR gets rejected. Politely ask why, learn,
  move on.
