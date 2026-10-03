# GitHub repo metadata

The settings on the GitHub repo page itself. Often skipped, often the
difference between a click and a bounce.

---

## Repo description (the one-line under the title)

Hard cap: 350 chars (GitHub limit). Practical cap: ≤ 150 to render fully
on mobile. Use the punchiest version:

> **One AGENTS.md. Every coding agent. Senior-engineer behavior, CI-enforced. Cross-tool wrappers for Claude Code, Codex, Cursor, Gemini, Copilot, Aider.**

That's 161 chars. Acceptable.

Set via: repo → ⚙ Settings → "About" → "Description".

---

## Topics (the chip tags)

GitHub allows up to 20 topics. Use 12–15 high-signal ones. Order matters
for SEO weighting.

```
agents-md
claude-code
ai-coding-agents
cursor
codex
gemini-cli
github-copilot
aider
agentrails
karpathy
llm-rules
ci
code-quality
developer-tools
opensource
```

Set via: repo → ⚙ Settings → "About" → "Topics".

**Avoid:**
- Topics with <100 repos using them (low traffic)
- Topics that don't apply ("react", "python") even if popular
- Personal-brand topics

---

## "About" panel checklist

- [x] Description (above)
- [x] Website: link to the launch blog post URL (or homepage if you
      have one). Don't leave blank.
- [x] Topics (above)
- [x] "Releases" section: enabled, with at least one tagged release
      (`v0.1.0`) at launch
- [x] "Packages" section: hidden (no npm package yet) — toggle off if
      it shows "Used by 0"
- [x] "Used by" section: hidden until ≥10 dependents

---

## Social preview image (the OG card)

Generated per the spec in [`press-kit.md`](./press-kit.md). 1200×630.

**Upload via:** repo → ⚙ Settings → "Social preview" → upload PNG.

**Test:** post the repo URL into Slack, Twitter, iMessage. Check the
preview renders correctly on all three. Mobile especially.

---

## Pinned issues / discussions (5 max)

Pin these in order. Each one is a *funnel* into a community task.

1. **"📌 Read this first: agentrails in 60 seconds"** — issue with the
   condensed pitch + install command. (Even if visitors skip the README
   they'll see this.)
2. **"💬 Discussion: which rule are we missing?"** — open question to the
   community. Generates engagement and seeds rules.
3. **"🤝 Contributing: add a wrapper for [tool]"** — list of unimplemented
   wrappers (Windsurf, Replit, Trae, Amp). Frames them as "good first
   issues."
4. **"📊 The agentrails lint study"** — discussion thread with the lint
   distribution data, updated as more repos get sampled.
5. **"📅 Roadmap"** — what's coming in v0.2, v0.3.

> *Avoid the emoji if your project's tone is austere.* They help on
> mobile to differentiate pinned items from regular issues — but cut
> them if they don't fit. (The repo's `AGENTS.md` itself uses no
> emoji, so the pinned issues should match.)

---

## Discussions

Enable Discussions. Categories to set up:

| Category | Use |
|---|---|
| **General** | catch-all |
| **Show & Tell** | adopters paste their AGENTS.md scores |
| **Q&A** | install / debugging |
| **Ideas** | rule and wrapper proposals |
| **Announcements** | maintainer-only; release notes |

Disable: **Polls** (low signal), **Voting** at the category level.

Seed each non-Announcements category with one starter post on launch
day so it doesn't look empty. Real questions, no fake personas.

---

## Issue templates

Drop these into `.github/ISSUE_TEMPLATE/`:

- `bug_report.md`
- `new_rule.md` — proposal template (rule + before/after + anti-pattern)
- `new_wrapper.md` — agent name, file format, header conventions
- `lint_false_positive.md` — for `agentrails check` reports

Each template is short (≤ 30 lines). Long templates discourage submissions.

---

## PR template

`.github/pull_request_template.md`:

```markdown
## What this PR does

<!-- One sentence. What changed and why. -->

## Type of change

- [ ] Bug fix
- [ ] New rule (added file in rules/)
- [ ] New wrapper (added support for a new agent)
- [ ] Documentation
- [ ] CLI improvement

## Verification

- [ ] `node bin/agentrails.mjs check` passes
- [ ] `node bin/agentrails.mjs sync` produces clean output
- [ ] If a new rule: includes before/after example
- [ ] If a new wrapper: tested with the actual tool

## Notes for the reviewer

<!-- Anything tricky, any tradeoffs, any rejected alternatives. -->
```

The PR template is the agent-rules' principles applied to PR review:
verification, scope, tradeoffs.

---

## CODE_OF_CONDUCT, SECURITY, FUNDING

- **`CODE_OF_CONDUCT.md`** — adopt the standard Contributor Covenant.
  Drop-in. GitHub auto-links it.
- **`SECURITY.md`** — short. "Report security issues to [email]. We
  respond within 72h." That's enough for a project this size.
- **`.github/FUNDING.yml`** — skip on launch. Asking for sponsorship
  before there's adoption looks needy. Add at T+30 if there's real
  usage and one obvious sponsor target (GitHub Sponsors).

---

## Branch protection

For `main`:
- Require PRs (no direct pushes by maintainer except hotfixes)
- Require the `agentrails-check` CI to pass
- Require 1 approval from a maintainer for external PRs
- Auto-merge once green (low friction for trusted contributors)

This is signaled in the README's "How we ship" footer — adopters notice
that the project follows its own rules.

---

## README badges (top of README)

Use *real* badges that link to *real* status. No "AI-powered ⚡" /
"made with ❤️" badges.

```markdown
[![CI](https://github.com/rke6693/Build-space-/actions/workflows/agentrails-check.yml/badge.svg)](https://github.com/rke6693/Build-space-/actions/workflows/agentrails-check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![AGENTS.md](https://img.shields.io/badge/AGENTS.md-100%2F100-3DDC84)](./AGENTS.md)
```

The third badge is meta-funny: the lint scoring its own canonical file
100/100. Use sparingly — a row of 6+ badges reads as compensating.

---

## When to publish to npm

`agentrails` is currently `npx`-able from the GitHub repo via direct URL.
For real `npx agentrails sync` to work without specifying the repo URL,
publish to npm.

**Publish at T+0** (launch day) so the README's `npx agentrails sync`
command actually works.

```bash
npm login                    # one-time
npm publish --access public  # from the repo root
```

After publishing:
- Add the npm badge to README:
  `![npm](https://img.shields.io/npm/v/agentrails?color=blue)`
- Verify a clean install in a fresh Docker container:
  `docker run -it --rm node:20 sh -c "npx agentrails help"`

If `agentrails` is taken on npm (it might be), pivot to `@<scope>/agentrails`
*before launch*. Never launch with a broken `npx` in the README.

---

## What to do BEFORE pressing the launch button

A 10-item pre-flight check. Don't post on HN until every box is checked.

- [ ] CI green on `main`
- [ ] README scannable in 6 seconds (open in incognito to verify)
- [ ] Social preview renders cleanly on Twitter, Slack, iMessage
- [ ] `npx agentrails sync` works from a clean directory
- [ ] `npx agentrails check` works from a clean directory
- [ ] All four wrapper files in the repo are in sync (no drift in the
      repo's own diff)
- [ ] LICENSE present
- [ ] Issue templates present
- [ ] Discussions enabled, seeded
- [ ] Topics set, description set
- [ ] Pinned issues set
- [ ] At least one tagged release (`v0.1.0`)
- [ ] npm package published (or scope decided)
- [ ] Personal blog post published with canonical URL set
- [ ] All links in launch artifacts (HN, Twitter, Reddit, blog)
      verified click-through
- [ ] You've read your own README cold and it makes you proud
