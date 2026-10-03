# 30-day campaign calendar

Times are **Pacific** (PT) because that's when both HN and dev Twitter peak.
Adjust by ±1h depending on US time-zone audience mix.

Target launch date: **Tuesday or Wednesday** (HN traffic is highest mid-week,
weekends die). Avoid: Mondays (mailbox triage), Fridays (people checked out),
and the week of any major Anthropic / OpenAI / Google launch.

---

## Pre-launch — T-7 to T-1

### T-7 (Tuesday)
- Finalize repo: README, AGENTS.md, CLI, CI green, social preview generated
- Generate the OG image (1200×630) using the spec in `press-kit.md`
- Add GitHub topics, repo description, pinned discussion
- Test `npx agentrails sync` from a clean directory

### T-6 (Wednesday)
- Soft-share in 2 small private Discords for technical feedback
- DM 5 close-friend developers asking for a 10-min review
- Submit to **3 awesome lists** (start the seed):
  - `awesome-claude-code` (PR adding to "Skills" section)
  - `awesome-ai-agents-2026`
  - `awesome-agents-md`

### T-5 (Thursday)
- Apply feedback from T-6
- Set up tracking: `metrics.md` spreadsheet, GitHub Insights baseline,
  Twitter Analytics, Reddit notifications
- Draft and *self-review* every launch-day post for forbidden phrases

### T-4 (Friday)
- Pre-pitch 3 newsletters with the **embargo** angle: "launching Tuesday,
  exclusive look if you cover that day" (TLDR-AI, AlphaSignal, Ben's Bites)
- Schedule no posts; weekend = invisible

### T-3 / T-2 (weekend)
- Off. Recover. Don't tweak the repo.

### T-1 (Monday)
- Final dry run: open repo in incognito, walk through README as a stranger
- Verify all links in launch artifacts resolve
- Schedule:
  - HN post for **Tue 5:00 AM PT**
  - Twitter thread to publish at **Tue 7:00 AM PT**
  - LinkedIn at **Tue 7:30 AM PT**
- Sleep early. The first 6 hours of launch day matter more than the rest of
  the campaign combined.

---

## Launch day — T+0 (Tuesday)

| Time PT | Action | Channel |
|---|---|---|
| 4:30 AM | Wake, coffee, repo check (CI still green?) | — |
| 5:00 AM | **Submit Show HN.** Title, no flame-bait, no emoji. | HN |
| 5:05 AM | Post the canned **first comment** (the "show your work" elaboration) | HN |
| 5:10 AM | Begin **HN reply rotation** — every comment in <30 min for first 6h | HN |
| 7:00 AM | **Twitter launch thread** (12 tweets) | Twitter/X |
| 7:30 AM | **LinkedIn post** (the "engineering governance" angle) | LinkedIn |
| 8:00 AM | **Reddit posts** — staggered: r/ClaudeAI first | Reddit |
| 8:30 AM | r/cursor (different angle, different post) | Reddit |
| 9:00 AM | r/programming (the "we CI-checked the rules" angle) | Reddit |
| 9:30 AM | **Send influencer DMs** (10 people, 10 different angles) | DM |
| 10:00 AM | Cross-post short thread to Bluesky and Mastodon | Bluesky/Masto |
| 10:30 AM | Discord shares in 4 servers (Anthropic, Cursor, OpenAI dev, AI agents) | Discord |
| 11:00 AM | Drop into r/ChatGPTCoding | Reddit |
| 12:00 PM | Email follow-up to 3 newsletters that didn't reply pre-launch | Email |
| 1:00 PM | Lunch, *don't* check stars | — |
| 2:00 PM | Status check: HN rank, Twitter eng, top issue/PR — respond | All |
| 4:00 PM | Engagement burst on whichever platform is hottest | Hottest |
| 6:00 PM | Bluesky and Mastodon **follow-up** with the day's stats | Bluesky/Masto |
| 8:00 PM | Final HN/Reddit reply pass, write tomorrow's content | — |
| 10:00 PM | Stop. Sleep. |  |

**If HN dies in the first 90 min:** don't repost. Pivot the headline to
Reddit (different angle, see `launch-day/reddit-posts.md`) and double the
LinkedIn push.

---

## Sustain — T+1 to T+7

Daily content pre-queued in `follow-up/week-1-content.md`. Theme per day:

| Day | Theme | Channel mix |
|---|---|---|
| T+1 (Wed) | "What the launch numbers say" — transparency post | Twitter, dev.to |
| T+2 (Thu) | "The five forbidden phrases" — most shareable rule | Twitter, LinkedIn |
| T+3 (Fri) | "Before & after: same prompt, same model" — receipts | Twitter, Bluesky |
| T+4 (Sat) | Quiet — engage only | — |
| T+5 (Sun) | Long-form blog cross-posted to dev.to / Hashnode / Medium | Blog |
| T+6 (Mon) | "Why your AGENTS.md fails the lint" — utility post | Twitter, Reddit |
| T+7 (Tue) | "Add a rule" — call for contributions | Twitter, Discord |

Also during T+1 to T+7:
- Pitch 6 podcasts (template in `outreach/newsletters-and-podcasts.md`)
- Submit to **5 more awesome lists**
- Reply to every issue / PR within 4h on weekdays

---

## Compound — T+8 to T+30

Weekly cadence:

**Week 2 (T+8 to T+14):**
- Publish "case study" blog: a real repo's `AGENTS.md` score before/after
- Conference CFP submissions: AI Engineer Summit, Strange Loop, GitHub
  Universe, KubeCon, NeurIPS workshops
- Add 2 wrapper integrations from community PRs (Windsurf, Replit, Trae)
- Newsletter pitches round 2 (the ones that passed first time, with new
  hook: "since launch X stars, here's what we learned")

**Week 3 (T+15 to T+21):**
- Open a **GitHub Discussion** for community-submitted rules
- Run a 1-hour office hours / open call (Twitter Spaces or Discord stage)
- Pitch one major podcast (Latent Space, Changelog, Practical AI)
- Publish "AGENTS.md Linter Studies" — 20 popular repos, here are their
  scores

**Week 4 (T+22 to T+30):**
- Ship v0.2 of the CLI (community-requested features) → launch post
- Land one corporate adoption story ("Team X at Y is now using agentrails")
- Aggregate community rules → publish `rules-extras/` based on submissions
- Set the next 60-day plan

---

## Defend — T+31 to T+90

Goal: own the "AI coding agent operating standard" category before it
crystallizes elsewhere.

Monthly:
- One conference talk
- One major blog cross-posted everywhere
- 5+ wrapper integrations shipped
- Quarterly review of `AGENTS.md` itself — adjust principles based on what
  agents actually do in 2026

---

## Key rules for execution

- **Block your calendar.** Launch day is 14h. Don't let a meeting overlap
  with the first 6 hours.
- **One owner.** Decisions need to ship in <2 minutes. Committees kill
  launches.
- **Engage in public.** Every reply on HN/Reddit/Twitter is a chance to
  recruit a contributor.
- **No "we" if it's just you.** "I built this" is honest and reads well.
  "We're proud to announce" reads like a marketing team.
- **Don't push when it's not working.** If a channel falls flat, switch.
  Don't double-post the same thing on the same channel 6 hours later.
