# agentrails launch campaign — playbook

> The whole campaign in one folder. Read top-to-bottom on launch week.

## What this campaign is trying to do

Land **agentrails** as the canonical "drop this into your repo" answer for
cross-tool AI coding agent rules — riding the April 2026 Skills/AGENTS.md
wave that put `andrej-karpathy-skills` at 70k stars in three weeks.

The repo's job is to be useful. The campaign's job is to put the repo in
front of the people who already have the pain (managing four agent config
files by hand) and let them adopt it in 30 seconds.

## The one-line pitch

> **One AGENTS.md. Every coding agent. Senior-engineer behavior.**
> Drop one file into your repo. Claude Code, Codex, Cursor, Gemini CLI,
> Copilot, Aider, opencode, and Devin all read the same rules.

## Why now (the wave we're surfing)

- **April 22, 2026:** `andrej-karpathy-skills` at +44k stars/week, 70k+ total.
  A single `CLAUDE.md` file. Proves the format.
- **AGENTS.md** stewarded by Linux Foundation Agentic AI Foundation since Q1.
  60k+ repos using it.
- **Pain point:** every team writes `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `.github/copilot-instructions.md` from scratch and re-discovers the same
  anti-patterns.
- **Window:** 6–10 weeks before this category becomes "owned" by whoever
  ships the cleanest version. We have to ship now.

## Campaign shape

```
T-7 ── T-1   Pre-launch     repo polish, soft DMs, 5 awesome list seeds
T+0          Launch day     HN at 5am PT, Twitter 7am, Reddit staggered
T+1 ── T+7   Sustain        daily content, podcast pitches, eng with PRs
T+8 ── T+30  Compound       case studies, follow-up posts, conference CFPs
T+31 ── T+90 Defend         own the category: docs, talks, integrations
```

## Files in this folder

| File | Use |
|---|---|
| [`positioning.md`](./positioning.md) | Messaging matrix, competitor framing, what we say / what we don't |
| [`audiences.md`](./audiences.md) | ICPs by channel, where each ICP lives |
| [`calendar.md`](./calendar.md) | 30-day day-by-day plan |
| [`press-kit.md`](./press-kit.md) | One-liners, boilerplate, quotable lines, OG image spec |
| [`github-meta.md`](./github-meta.md) | Repo description, topics, social preview, pinned issues |
| [`metrics.md`](./metrics.md) | Targets at 7/30/90 days; what to track |
| `launch-day/hacker-news.md` | Show HN title + first comment |
| `launch-day/twitter-thread.md` | 12-tweet launch thread |
| `launch-day/reddit-posts.md` | Variants per sub |
| `launch-day/linkedin-bluesky-mastodon.md` | Other social |
| `launch-day/blog-post.md` | The 1500-word launch essay (cross-post: dev.to, Hashnode, Medium, personal blog) |
| `outreach/influencer-list.md` | Who to DM, which angle, DM templates |
| `outreach/newsletters-and-podcasts.md` | Pitch templates + target list |
| `follow-up/week-1-content.md` | Seven daily posts queued for week 1 |
| `follow-up/blog-series-and-video.md` | 5 follow-up post outlines + 3-min demo video script |
| `community/awesome-lists-and-discords.md` | Lists to submit to + servers to share in |

## Operating principles for the campaign

These follow the same pattern as `AGENTS.md` itself:

1. **Don't lie.** No "10x productivity," no fabricated benchmarks, no fake
   testimonials. The product is good — say what it does, not what it might.
2. **Don't fake virality.** No upvote rings, no sock-puppet accounts, no
   reposting your own content with new accounts. HN and Reddit detect this
   and the consequence is a permanent shadow-ban for the repo's domain.
3. **Credit upstream.** Karpathy, Forrest Chang, Boris Cherny, the Linux
   Foundation team, the AGENTS.md community. Standing on shoulders is the
   whole pitch — pretending otherwise reads as theft.
4. **Surface tradeoffs.** Every comparison post says clearly when the
   alternative is the better choice. No bashing.
5. **Engage live for the first 6 hours.** HN and Reddit reward engagement.
   Block the calendar.
6. **Stop when something doesn't land.** If the HN post falls off page 2 in
   the first 90 minutes, it's not coming back — pivot to plan B (Reddit
   takes the headline) instead of pushing.

## "Don't do" list

- ❌ Don't post to HN on a Friday afternoon, weekend, or holiday.
- ❌ Don't open with "Hey HN!" / emoji-heavy intros.
- ❌ Don't tag Karpathy directly on day 1. Earn the mention.
- ❌ Don't @-spam newsletter editors. One pitch, one follow-up after a week.
- ❌ Don't gate anything behind email signup on launch day. Friction kills
  stars.
- ❌ Don't claim "supports X tool" until the tool's wrapper is verified
  end-to-end.
- ❌ Don't run a Product Hunt launch on the same day as HN — cannibalizes
  attention.

## Owner & cadence

- **Single owner:** one person ships the launch. No committee.
- **Daily 15-min standup** for the first 14 days: what landed, what didn't,
  what's the next 24h.
- **Weekly review** for weeks 3–12, using `metrics.md`.
