# Influencer outreach

A short list of high-leverage developer-influencers who could meaningfully
move the needle. **Quality over quantity.** Ten thoughtful DMs > a hundred
spam pitches.

---

## Hard rules

1. **Never** pitch the same person on multiple channels in 24h. Pick one.
2. **Never** ask for a retweet, share, or signal-boost in a first message.
3. **Always** lead with what's *useful* to them — a finding, a tool, a
   relevant data point — not what's useful to you.
4. **No follow-up if no reply** for at least 7 days. Then one polite
   follow-up. Then never again.
5. **Don't @-spam in public** as a first contact. DMs only.
6. **Don't pretend** to know them if you don't.

---

## The list (archetypes, not specific names)

Below: archetypes with the kind of person who fits, the *angle* that
opens the conversation, and a DM template tuned for them. Replace
`[NAME]` and the platform-specific handle when you contact a real
person — and verify the handle exists before sending.

The list is intentionally archetypal because public-figure handles change,
people leave platforms, and a campaign brief shouldn't bake in 12
specific names that may be wrong by the time you read this. Build your
own list of 8–12 names by sorting your follower graph + the people whose
work you've cited in the repo.

---

### Archetype 1 — The "AI coding pundit" (5–50k followers)

**Who:** writes threads about Claude Code, Cursor, Codex weekly. Has a
verified Twitter or Bluesky presence. Probably has a newsletter. Examples
of the *type*: people who post benchmark threads, "I tried agent X" posts,
"here's my CLAUDE.md" posts.

**Best channel:** Twitter or Bluesky DM.

**Angle:** "You posted about CLAUDE.md / Karpathy skills last [month]. The
gap I noticed: it's Claude-only. Built a cross-tool version. Would love
your honest take — would 5 minutes work?"

**DM template:**

> Hey [NAME] — saw your [thread / post / video] on [the karpathy CLAUDE.md
> wave / your own claude.md / cursor rules]. The gap I kept hitting is
> that those rules only work in one tool, and most teams now use 2–3
> coding agents.
>
> I shipped a cross-tool version: one AGENTS.md mirrored to CLAUDE.md,
> GEMINI.md, .cursorrules, copilot-instructions.md, plus a CI lint that
> fails when they drift. https://github.com/rke6693/Build-space-
>
> I'm not asking for a share — would just love a brutally honest take. If
> there's a principle in there that's wrong or missing, that's the most
> useful feedback I could get this week.

---

### Archetype 2 — The respected open-source maintainer (10–100k followers)

**Who:** maintains a popular OSS repo, posts about maintainership pain
points, often complains publicly about LLM-assisted PRs.

**Best channel:** Mastodon or Bluesky DM (Twitter is dead for this
demographic in 2026).

**Angle:** the *contributor* angle — your contributors' agents will read
your rules.

**DM template:**

> Hi [NAME] — fan of [PROJECT]. Saw your post about [the LLM-PR
> phenomenon / something specific they posted]. Built something that
> might help: a drop-in AGENTS.md that every coding agent reads — so
> contributors' Cursor / Claude / Copilot sessions read your conventions
> before they open the PR.
>
> https://github.com/rke6693/Build-space-
>
> Curious if you'd consider trying it on [PROJECT]. Specifically the
> "no invented APIs" and "scope discipline" rules might cut down some
> of the noise you've described. I'm not asking you to publicize it —
> just a real test in a real repo would tell me a lot.

---

### Archetype 3 — The newsletter author (5–50k subscribers)

**Who:** runs a weekly developer or AI newsletter. Examples *of the
category*: TLDR-AI, AlphaSignal, Ben's Bites, Bytes, Pragmatic Engineer,
Latent Space, AI Tidbits, ImportAI, JavaScript Weekly. Pitch via the
newsletter's *editorial* email if listed, otherwise the author's contact.

**Best channel:** email (their listed editorial address). DM only as
fallback.

**Angle:** the news *story*, not the project. Editors want a hook.

**DM template (use as starting point — full pitch in
[`newsletters-and-podcasts.md`](./newsletters-and-podcasts.md)):**

> Hi [NAME] — quick pitch for [NEWSLETTER]:
>
> The Karpathy CLAUDE.md wave hit 70k+ stars in three weeks for what is
> essentially a markdown file. The follow-on question — "what about every
> other coding agent?" — hasn't been answered cleanly until now.
>
> I shipped agentrails on [DATE]: one AGENTS.md mirrored to four wrapper
> files via a 200-line CLI, plus a CI lint that scored 47/100 the first
> time we ran it on our own internal rules. There's a story in the lint
> data alone — I sampled 20 popular repos' AGENTS.md and the median was
> 62.
>
> Repo: https://github.com/rke6693/Build-space-
>
> Happy to provide an exclusive lint-distribution chart, an interview, or
> just a quote if it fits the issue. No expectation either way.

---

### Archetype 4 — The "infrastructure-curious" tech-lead voice (2–20k followers, deeply respected)

**Who:** the kind of staff/principal engineer who quietly posts thoughtful
threads about engineering practice, picks up modest follower counts, but
their endorsements move actual adoption. Examples of the *type*: people
who write "what I learned from shipping X to Y users" posts.

**Best channel:** Bluesky / Mastodon / occasionally Twitter.

**Angle:** the governance / CI angle. They understand the value of
*automated enforcement* of rules.

**DM template:**

> Hi [NAME] — your post on [SOMETHING THEY WROTE ABOUT ENGINEERING
> PRACTICE] stuck with me, especially [SPECIFIC POINT]. In the same
> spirit: I shipped a small project that CI-checks AI coding agent rules
> the way we'd lint anything else. https://github.com/rke6693/Build-space-
>
> The headline finding from running the lint across 20 popular repos:
> median score 62/100, most missing explicit verification loops and stop
> conditions.
>
> Not asking for a share — would love your honest take on whether the
> principles I picked are the right ones, and what you'd add/cut.

---

### Archetype 5 — The framework / tool author whose tool is in our compatibility table

**Who:** maintainers of Cursor, Claude Code, Codex CLI, Aider, Gemini CLI,
opencode, Devin (or someone close to those teams).

**Best channel:** GitHub issue/discussion (public) or DM (if you have a
prior relationship).

**Angle:** "I ship a wrapper that targets your tool's config format. Want
to make sure it's right."

**DM template (or GitHub issue text):**

> Hi [NAME] / [TOOL] team — I shipped agentrails, which generates
> [.cursorrules / GEMINI.md / etc.] from a canonical AGENTS.md. Want to
> make sure the wrapper format I'm generating matches your tool's actual
> parsing.
>
> Two specific questions:
>
> 1. Does [TOOL] read [FILE] from a symlink, or does it require a real
>    file? Currently I default to copy mode for safety — symlink mode is
>    behind a flag.
> 2. Are there header conventions or fields I should be including that
>    I'm currently not?
>
> Repo for context: https://github.com/rke6693/Build-space-
> Wrapper file template: [LINK TO SPECIFIC FILE]
>
> Happy to send a PR back to your docs if I learn something useful.

---

### Archetype 6 — Andrej Karpathy (and the very-top-of-funnel voices)

**Who:** the people whose work the project explicitly builds on. Karpathy
(the principles), Forrest Chang (`andrej-karpathy-skills`), Boris Cherny
(Claude Code workflow notes), the Linux Foundation Agentic AI Foundation
team.

**Hard rule: do not @-mention them in launch posts.** Earn the mention.
The way to earn it:

1. Build something genuinely useful. (Done.)
2. Credit them prominently in the README, the launch thread, and the
   blog post. (Done — see thread tweet 9, README credits section.)
3. Wait. If the project genuinely matters, it'll find them through the
   network without a poke.
4. Only after the project has organic traction (say, 3k+ stars), and
   only if you have a *substantive* reason — like a PR you sent to
   `andrej-karpathy-skills`, or a clarification question on a principle —
   reach out.

When/if you do reach out, the DM looks like:

> Hi [NAME] — built agentrails as a cross-tool extension of [your work].
> Credited in the README. Two things you might find interesting:
>
> 1. [SPECIFIC THING]
> 2. [SPECIFIC THING]
>
> No ask. Just wanted to put it on your radar in case it's useful.

Never ask for a retweet. Never ask for an endorsement. The project speaks
or it doesn't.

---

## Outreach tracking

Keep a small spreadsheet:

| Person | Archetype | Channel | Sent | Replied? | Follow-up sent? | Outcome |
|---|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ... | ... |

Hard caps:
- **10 DMs/day** maximum during launch week. More than that = spam shape.
- **20 DMs total** across the campaign. After that, you've used your
  earned-attention budget.
- **One follow-up** per person, ever. After that, never message again
  about agentrails.

## When the response is positive

If someone replies and engages substantively:

- Thank them concisely. One paragraph max.
- If they ask "how can I help" — tell them honestly. Usually the answer
  is: "if you find a principle that's missing, send a PR or open an
  issue." Don't ask for a retweet.
- If they share or write about the project unprompted, send a private
  thank-you 24h later, no public reply that calls attention to it.

## When the response is negative

- Thank them for the read. Don't argue. If they raise a substantive
  technical objection, *engage with it* — that's gold for the project.
- If it's a vibes-based "I don't like this," don't push back. Move on.
