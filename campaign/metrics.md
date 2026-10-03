# Metrics & targets

What to track, what to ignore, what success looks like at 7 / 30 / 90 days.

The goal of measurement is to **decide what to do next**, not to feel good
about numbers. If a metric doesn't change a decision, don't track it.

---

## Top-line targets

| Window | Stars | Forks | Adopters (rough) | Contributors |
|---|---|---|---|---|
| **Day 7** | 2,000–5,000 | 100–250 | 100–500 | 3–10 |
| **Day 30** | 8,000–20,000 | 500–1,500 | 2,000–10,000 | 20–50 |
| **Day 90** | 25,000–60,000 | 2,000–6,000 | 15,000–80,000 | 60–200 |

These are **plausible-not-promised** ranges, calibrated against:

- `andrej-karpathy-skills`: 70k stars in 3 weeks. Outlier.
- `agents-md` (Donahoe): ~5k stars in 2 months. Median for this category.
- `awesome-claude-code`: ~15k in 6 months. Slow-and-steady.
- Typical viral "single markdown file" repo: 2–10k in 30 days.

If we hit the **upper** end of the day-7 range, double down on
sustaining content. If we hit the **lower** end, reassess positioning
(see "What to change if numbers underperform" below).

---

## Metrics to track

### Tier 1 — daily, first 14 days

| Metric | Source | Why |
|---|---|---|
| Stars | GitHub Insights | The headline. Compare day-over-day. |
| Stars-from-traffic ratio | GitHub Insights → Traffic | Tells you which channel is converting. |
| Top referrers | GitHub Insights → Traffic → Referring sites | Tells you where the audience came from. |
| HN rank (if applicable) | hnrankings.info | Front-page minutes is the leading indicator. |
| Twitter impressions, profile clicks | Twitter Analytics | Engagement is more useful than impressions. |
| Reddit upvotes, comments per post | Reddit | Per-sub, separately. |
| Open issues | GitHub | Healthy repo: issues open faster than they close in week 1. |
| PR open + merge rate | GitHub | Contributor-funnel leading indicator. |

### Tier 2 — weekly, first 90 days

| Metric | Source | Why |
|---|---|---|
| Adopters (proxied by GitHub code search for `# managed by agentrails`) | `github.com/search?q=...&type=code` | The real-usage number. Stars overstate; this is closer to truth. |
| `npx agentrails` downloads | npm stats (when published) | Adoption-by-CLI proxy. |
| Newsletter mentions | manual count | Distribution health. |
| Podcast downloads (post-appearance) | host's analytics | Long-tail amplification. |
| Backlinks (do-follow) | Ahrefs / Search Console | SEO compound. |
| Contributor count | GitHub | Moat-building. |
| Issue close rate | GitHub | Maintainer responsiveness. |

### Tier 3 — monthly, first 6 months

| Metric | Why |
|---|---|
| Stars per active week | "Sustained interest" indicator. Falls off a cliff after launch typically; measure the rate of decay. |
| Lint score across surveyed-repo population | The signature data point that becomes a recurring blog post. |
| Wrapper integrations supported | Breadth of category coverage. |
| External coverage count (mentions in talks, books, courses) | Cultural moat. |

---

## What NOT to track

These look impressive and don't change decisions. Skip them:

- ❌ "Followers gained" on Twitter / LinkedIn / Bluesky — vanity, not
  conversion.
- ❌ Total website visits if there's no website — irrelevant.
- ❌ Watch time on the demo video — if the README is doing its job, the
  video is bonus.
- ❌ Number of *posts* you made — quality, not quantity.
- ❌ Karma on Reddit. The repo's the product, not your account.
- ❌ Engagement *rate* without absolute numbers — "30% engagement rate
  on a 50-impression post" is meaningless.

---

## What to change if numbers underperform

### Day 1: HN drops off page 2 in <90 minutes

- **Stop pushing HN.** Don't resubmit, don't ask people to re-vote.
- Pivot: lead with the **lint-finding** angle on Reddit instead of the
  product-launch angle. ("I lint-checked 20 repos' AGENTS.md files —
  median 62/100" works better as a finding than as a tool launch.)
- Push more weight to LinkedIn — the tech-lead audience cares more
  about governance than about HN-style tool launches.

### Day 1: Twitter gets <500 impressions on the launch tweet

- Quote-tweet your own launch with a different angle (the forbidden
  phrases) at T+6h.
- Pivot to Bluesky and Mastodon, where the OSS audience may be
  underserved by Twitter's algorithm changes.
- **Don't** repost the launch thread on a new account, "boost" with
  paid promotion, or buy followers.

### Day 7: stars below the day-7 lower bound (2,000)

- Re-read the README cold. Is the value clear in 6 seconds? If not,
  rewrite.
- Run a five-person user-test of the README: ask each "what does this
  do?" Their answer should be "one AGENTS.md for every coding agent,
  CI-checked." If 3+ say something else, the framing is broken.
- Pivot to **utility content** — the lint-distribution post, before
  the announcement post.

### Day 30: stars stalled

- Ship a v0.2 with one *substantive* feature (e.g., `extends:` syntax,
  rule registries) — relaunches reset the algorithmic decay.
- Announce on the same channels with the **delta**, not the project.
- Court a corporate adoption story as social proof.

### Day 90: contributors haven't followed

- Audit the issue tracker: is "good first issue" actually labeled?
- Run a "rule-pull-request day" event in Discord.
- Reach out to the 5–10 most engaged commenters from launch and
  invite them to maintainership.

---

## Weekly review template

Every Friday for the first 12 weeks:

```
WEEK [N]
1. Stars now / last week / delta
2. Top 3 traffic sources this week
3. Best-performing post (and why)
4. Worst-performing post (and what we'd change)
5. Issues opened / closed
6. PRs opened / merged
7. New contributors
8. One thing we'll try next week
```

If the review takes >20 minutes, it's too detailed. The point is
**deciding what to do next**, not making a dashboard.

---

## What success actually looks like

In rough decreasing importance:

1. **Real adoption.** GitHub code search returns >5k repos with
   `# managed by agentrails`. The thing is in production use.
2. **Contributor flywheel.** Five+ active contributors who've each
   merged 3+ PRs. The project survives the maintainer's vacation.
3. **Category reference.** The phrase "agentrails" appears in other
   tools' docs as the recommended way to manage AGENTS.md.
4. **Spec contribution.** PRs back to the LF AGENTS.md spec from
   lessons learned in agentrails.
5. **Star count.** Last on the list. A vanity metric that's nice but
   not load-bearing.

If you got 100k stars and 0 of items 1–4, the campaign succeeded and
the project failed. Don't optimize for stars.
