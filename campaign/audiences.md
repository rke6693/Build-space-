# Audiences & channel fit

Five concrete ICPs. For each: who they are, where they live online, what
gets them to click.

---

## ICP 1 — The Claude Code power user

**Who:** developer who's been using Claude Code daily for 6+ months, has a
hand-tuned `CLAUDE.md` already, follows @karpathy and has an opinion about
the four principles.

**Pain:** they've tuned `CLAUDE.md` but their team uses Codex / Cursor /
Copilot too — those agents ignore the file and re-introduce the bugs they
already fixed.

**Lives:**
- r/ClaudeAI, r/ChatGPTCoding
- Anthropic Discord (#claude-code, #share-your-projects)
- Twitter list of "Claude Code people" — usually <10k followers, very active
- `awesome-claude-code` PR threads
- Latent Space pod listeners

**Lead with:** "If your team mixes Claude Code with Codex/Cursor, your
`CLAUDE.md` is half the rules. Mirror it everywhere with one file."

---

## ICP 2 — The Cursor / Codex / Copilot user feeling left out of Karpathy hype

**Who:** Cursor or Copilot daily user, saw the Karpathy thread, opened the
repo, realized it's Claude-only, closed the tab.

**Pain:** wants the same behavioral upgrade their Claude-using friends got,
doesn't want to switch tools, doesn't want to copy-paste the file every
time.

**Lives:**
- r/cursor (~150k subs), Cursor Discord
- r/github (Copilot threads)
- HN comments on every Karpathy / Skills post
- Twitter — replies to Karpathy / Forrest Chang threads asking "is there a
  Cursor version?"

**Lead with:** "Karpathy's principles, in your tool. `.cursorrules` and
`copilot-instructions.md` are first-class wrappers, not an afterthought."

---

## ICP 3 — The tech lead at a 50–500 person engineering team

**Who:** staff/senior engineer or eng manager whose org adopted AI coding
agents in 2025 and is now drowning in inconsistency. Different teams have
different rules; rules drift; nobody enforces them.

**Pain:** governance. They need a way to standardize agent behavior across
the org and *prove* it's standardized.

**Lives:**
- LinkedIn, Hacker News (lurks more than posts)
- Pragmatic Engineer / Lenny's Newsletter readers
- Conference attendees: KubeCon, QCon, NDC, AI Engineer Summit
- Internal Slack channels that subscribe to TLDR and AlphaSignal

**Lead with:** "CI fails when your `AGENTS.md` drifts or someone deletes the
verification rule. Governance for AI coding agents."

---

## ICP 4 — The open-source maintainer

**Who:** maintains a popular repo (1k–50k stars). Contributors are
increasingly using AI agents. PRs are getting noisy: drive-by refactors,
invented APIs, unverified claims.

**Pain:** can't review 30 LLM-assisted PRs a week. Wants `AGENTS.md` so the
contributors' agents pre-comply with the project's standards.

**Lives:**
- GitHub itself (issue threads, discussions)
- Mastodon, Bluesky (post-Twitter OSS crowd)
- r/programming, r/opensource
- Maintainer-focused podcasts: Maintainable, Open Source Friday

**Lead with:** "Drop `AGENTS.md` in your repo. Now every contributor's
coding agent reads your conventions before opening a PR."

---

## ICP 5 — The solo dev / indie hacker

**Who:** building alone, uses 2–3 coding agents depending on task, doesn't
have a team to coordinate with. Wants the upgrade for free.

**Pain:** nothing in particular — but pattern-matches on "Karpathy" and
"30-second install."

**Lives:**
- Indie Hackers, r/SideProject
- Twitter (build-in-public hashtag)
- Buildspace Discord, Y Combinator alumni Slack
- Daily.dev, Hacker Newsletter

**Lead with:** "30 seconds. One file. No subscription. Every coding agent
in your repo behaves better."

---

## Channel × audience matrix

| Channel | ICP1 | ICP2 | ICP3 | ICP4 | ICP5 | Day-1 priority |
|---|---|---|---|---|---|---|
| Hacker News | ✅✅ | ✅ | ✅✅ | ✅✅ | ✅ | **P0** |
| Twitter / X | ✅✅ | ✅✅ | ✅ | ✅ | ✅✅ | **P0** |
| r/ClaudeAI | ✅✅ | — | — | — | — | **P0** |
| r/cursor | — | ✅✅ | — | — | — | **P1** |
| r/programming | ✅ | ✅ | ✅✅ | ✅✅ | ✅ | **P1** |
| r/ChatGPTCoding | ✅ | ✅✅ | — | — | ✅ | **P1** |
| LinkedIn | — | — | ✅✅ | ✅ | — | **P1** |
| Hashnode/dev.to | ✅ | ✅ | ✅ | ✅✅ | ✅ | **P1** |
| Bluesky | ✅ | — | — | ✅✅ | — | **P2** |
| Mastodon | ✅ | — | — | ✅✅ | — | **P2** |
| Discords (Anthropic, Cursor, OpenAI dev) | ✅✅ | ✅✅ | ✅ | — | ✅ | **P0** |
| Indie Hackers | — | — | — | — | ✅✅ | **P2** |
| Newsletters (TLDR / AlphaSignal / Pragmatic / Latent Space) | ✅ | ✅ | ✅✅ | ✅ | ✅ | **P0 pitch** |
| Podcasts (Latent Space / Changelog / Practical AI) | ✅ | ✅ | ✅ | ✅ | — | **P1 pitch** |

**P0 = launch day. P1 = days 1–3. P2 = week 2.**

## What each channel rewards

- **HN:** specific, surprising, technical. "What problem did you actually
  solve and how?" Punished: marketing-speak, hype, vague claims.
- **Twitter:** the screenshot. Show the before/after. The thread is for
  receipts.
- **Reddit (per sub):** authentic problem framing. "I built this because X
  was annoying" beats "Introducing X."
- **LinkedIn:** the framing of *consequence* — "Engineering velocity went
  up 12% after we standardized our agent rules."
- **Discord:** quick share in the right channel, no @everyone, respond fast
  if anyone asks a question.
- **Newsletters:** the *story*, not the project. Editors want a hook (the
  Karpathy wave, the cross-tool gap, the CI angle).
