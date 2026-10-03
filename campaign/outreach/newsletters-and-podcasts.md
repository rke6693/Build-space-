# Newsletters & podcasts

Long-tail amplification. A newsletter mention puts the project in front of
5–50k high-intent developers who *will* click through.

Pitch ahead of launch where possible. Lead time:
- **Newsletters:** pitch 5–7 days before launch.
- **Podcasts:** pitch 14–30 days before launch.

---

## Newsletter target list

Tier-ranked. Pitch top tier first; if 2/3 reply, deprioritize bottom tier.

### Tier 1 (highest dev/AI relevance)

| Newsletter | Audience | Hook to lead with |
|---|---|---|
| **TLDR / TLDR-AI** | mass-dev, mass-AI | "Karpathy CLAUDE.md → cross-tool: same idea, every agent" |
| **AlphaSignal** | AI engineers | The lint-data finding (median 62/100 across 20 popular repos) |
| **Latent Space (newsletter)** | AI engineers | The CI angle + the AGENTS.md spec adoption story |
| **Ben's Bites** | AI builders | The 30-second drop-in + cross-tool framing |
| **Pragmatic Engineer** | senior eng / EMs | The org-governance angle, not the tool angle |

### Tier 2 (dev-tool aligned)

| Newsletter | Audience | Hook |
|---|---|---|
| **Bytes** | JS developers | Zero-dep CLI, drop-in markdown |
| **JavaScript Weekly** | JS-only | The CLI is one .mjs file, no deps |
| **Hacker Newsletter** | HN distillation | If we made HN front page, this is automatic |
| **Changelog Nightly** | OSS-aware | The project itself is the hook, no spin needed |
| **Daily.dev digest** | dev-feed | "If your team uses more than one coding agent…" |
| **Lenny's Newsletter** | PMs/leaders | Probably skip — not a fit unless we have org-adoption story |

### Tier 3 (long-tail, low effort to pitch)

| Newsletter | Audience |
|---|---|
| **AI Tidbits** | AI-curious |
| **The Rundown AI** | mass-AI |
| **Import AI** (Jack Clark) | research-leaning |
| **Deep Learning Weekly** | research |
| **The Algorithmic Bridge** | applied AI |
| **DataElixir** | data eng |
| **DevOps'ish** | ops-flavored audiences |
| **Console** (oss tools) | new tools weekly |

> **Verify each newsletter still publishes** before pitching (a lot
> change cadence or shut down). Skip any whose website hasn't been
> updated in 90 days.

---

## Newsletter pitch template

Subject line (≤ 60 chars):

> agentrails: one AGENTS.md, every coding agent — for [NEWSLETTER]?

Body:

> Hi [EDITOR FIRST NAME],
>
> Quick pitch for [NEWSLETTER NAME]. Skip if not a fit, no follow-up
> required.
>
> **The hook:** April's `andrej-karpathy-skills` repo proved a single
> `CLAUDE.md` can change agent behavior at scale (70k+ stars in three
> weeks). The unanswered question: what about every other coding agent
> your team uses?
>
> **What I shipped:** agentrails, an open-source MIT project. One
> canonical `AGENTS.md` plus a 200-line zero-dep CLI that mirrors it to
> `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
> `.github/copilot-instructions.md`. A GitHub Action fails CI when the
> wrappers drift or someone weakens a principle.
>
> **The data point:** I ran the included lint across 20 popular repos'
> existing agent config files. **Median score: 62/100.** Most are
> missing explicit verification loops and stop conditions. Happy to
> send the chart if you want it.
>
> **What I can offer:**
> - Exclusive first publish of the lint-distribution chart
> - 250-word summary written to your house style
> - A short interview (text or voice)
>
> **Repo:** https://github.com/rke6693/Build-space-
> **License:** MIT
> **Launch date:** [DATE]
>
> Thanks for considering.
> [YOUR NAME]
> [YOUR TITLE/ONE-LINER]
> [LINK TO PERSONAL SITE]

**Follow-up email** (one only, T+7 if no reply):

> Hi [EDITOR] — circling back on agentrails. No pressure either way; if
> not a fit, no need to reply. The repo's at [STAR COUNT] now and the
> lint-distribution data is publishable if you want exclusive use.
> [LINK]

---

## Podcast target list

Podcasts have longer lead times (record 2–4 weeks ahead, publish 4–8
weeks ahead). Pitch 14–30 days before launch ideally, or right after
launch when stars are climbing — whichever's true.

### Tier 1

| Podcast | Audience | Pitch angle |
|---|---|---|
| **Latent Space** (swyx, Alessio) | AI engineers | The cross-tool standardization story; how AGENTS.md became *the* spec |
| **Practical AI** | applied-AI builders | The "from prompt-engineering to agent-engineering" arc |
| **Changelog** (Adam Stacoviak, Jerod Santo) | OSS / hacker | The maintainer-pain story; "why I built this" |
| **Software Engineering Daily** | broad SWE | Engineering governance; CI for agent rules |
| **Maintainable** (Robby Russell) | maintainers / code-quality | The contributor-PR-noise angle |

### Tier 2

| Podcast | Audience |
|---|---|
| **The Pragmatic Engineer Podcast** | senior eng / EMs |
| **Code with Jason** | full-stack devs |
| **Open Source Friday (GitHub)** | OSS community |
| **The Stack Overflow Podcast** | broad dev |
| **JS Party** | JS community |
| **Dev Tools FM** | dev tools builders |

### Tier 3 (podcasters with smaller but very engaged audiences)

| Podcast | Audience |
|---|---|
| **The Geekly podcast** | small-team eng |
| **Indie Hackers podcast** | indie devs |
| **ATP / The Talk Show** | only if cross-platform / mainstream angle exists |

---

## Podcast pitch template

Subject:

> agentrails (AGENTS.md project) — guest pitch for [PODCAST NAME]

Body:

> Hi [HOST FIRST NAME],
>
> Long-time [LISTENER / READER] — particularly the [SPECIFIC EPISODE]
> episode where [SPECIFIC POINT YOU TOOK FROM IT]. (One sentence, real,
> verifiable. If you can't write this honestly, don't send.)
>
> Pitching myself as a guest on the angle of **"agent operating
> standards" — what changes when AI coding agents go from
> prompt-engineered tools to CI-enforced ones**. I shipped agentrails
> last month: one canonical AGENTS.md mirrored to every coding agent's
> config file, plus a CI lint. It rides the Karpathy CLAUDE.md wave
> but extends it to every tool. https://github.com/rke6693/Build-space-
>
> Topics I could go deep on:
> - Why a single markdown file moved 70k stars (and what that says about
>   the leverage point in agent behavior)
> - The five forbidden phrases — why "this should work" is the most
>   expensive sentence in code review
> - Lint scores across 20 popular open-source repos' agent rules
>   (median 62/100; happy to share the chart)
> - The case for AGENTS.md as the next "package.json" for agent-aware
>   repos
> - The case *against* opinionated standards — when a fork is more
>   honest than a "best practices" doc
>
> Available [DAYS / WINDOW]. Happy to record [LENGTH OPTIONS].
>
> Best,
> [YOUR NAME]

---

## Outreach hygiene

- **Real research first.** "I really enjoy your podcast" with no
  specifics gets discarded. One concrete reference proves you've listened.
- **One pitch per outlet.** Don't email the editor *and* the host.
- **No bcc lists.** Each email is individually addressed.
- **Reply-friendly subject.** Don't write "EXCLUSIVE: agentrails launch"
  — that reads as PR-firm boilerplate.
- **Send Tuesday or Wednesday morning.** Not Friday afternoon, not
  Monday morning (mailbox triage).

---

## Tracking

| Outlet | Tier | Pitched | Replied | Status | Notes |
|---|---|---|---|---|---|
| TLDR-AI | 1 | | | | |
| AlphaSignal | 1 | | | | |
| Latent Space (newsletter) | 1 | | | | |
| Ben's Bites | 1 | | | | |
| Pragmatic Engineer | 1 | | | | |
| ... | ... | | | | |

Realistic conversion target: **20–30% reply rate, 5–10% publish/feature
rate** for a tier-1 newsletter on a real, technical, launch-day project.
If your reply rate is below 10%, your pitch is broken — rewrite, don't
send more.

---

## What to *not* do

- ❌ Don't pitch a podcast with "I'd love to come on the show!" with no
  topic.
- ❌ Don't BCC 30 newsletter editors with the same email.
- ❌ Don't ask "did you see my email?" four days later. One follow-up,
  T+7.
- ❌ Don't send a pitch with attachments. One link is enough.
- ❌ Don't pitch the same newsletter twice in 90 days.
- ❌ Don't claim "exclusive" if you've also pitched another outlet
  exclusivity. Word travels in this industry.
