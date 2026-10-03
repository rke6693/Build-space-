# Hacker News launch

Submit at **5:00 AM Pacific** on a **Tuesday or Wednesday**.

URL: <https://news.ycombinator.com/submit>

---

## Title

> **Show HN: Agentrails – one AGENTS.md, every coding agent**

72 chars. Specific, lowercase, no emoji, no exclamation. The "Show HN"
prefix is mandatory for repo launches; HN moderators add it if you forget,
but adding it yourself signals you read the guidelines.

### Title alternates (use only if the primary fails to gain traction in
the first 30 minutes — submit a different post 24h later, do not edit a
live one):

- `Show HN: Karpathy's CLAUDE.md, mirrored to every other coding agent`
- `Show HN: CI-checked rules for Claude Code, Codex, Cursor, Gemini, Copilot`
- `Show HN: One markdown file that keeps every coding agent honest`

Do **not** use:
- ❌ `Show HN: Agentrails 🚀 - the FUTURE of AI coding 🔥` (emoji, hype)
- ❌ `I built an AGENTS.md tool, what do you think?` (no specifics)
- ❌ `Stop maintaining four coding agent configs` (clickbait verb, vague)

---

## URL field

Submit the GitHub repo URL directly:

> https://github.com/rke6693/Build-space-

Not the launch blog post — HN penalizes blog-link launches for repos.
Direct repo links rank higher.

---

## First comment (post within 60 seconds of submission)

> Author here. Built this because in April my team's `CLAUDE.md` had drifted
> from our `.cursorrules`, which had drifted from our
> `.github/copilot-instructions.md`, and three different agents were
> producing three different "fixes" for the same bug.
>
> The repo is one `AGENTS.md` (the canonical 200-line operating manual: four
> Karpathy principles plus verification loops, scope discipline, the five
> forbidden phrases, dependency hygiene, secrets handling, git discipline,
> stop conditions) plus a 200-line zero-dep CLI that mirrors it to
> `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and `copilot-instructions.md`.
>
> The CI workflow ([`.github/workflows/agentrails-check.yml`](https://github.com/rke6693/Build-space-/blob/claude/viral-github-repo-NSir7/.github/workflows/agentrails-check.yml))
> fails the build when the wrappers drift or when someone deletes a
> principle. `agentrails check` scores your `AGENTS.md` 0–100 and tells you
> what's missing.
>
> Things I'd flag honestly:
>
> - It's MIT-licensed markdown plus 230 lines of glue. The product is the
>   *curated principles*, not the format. If you don't agree with a rule,
>   `compose` from `rules/` and pick what you want.
> - I'm not the first to do an `AGENTS.md`. The Linux Foundation's
>   Agentic AI Foundation stewards the spec; `andrej-karpathy-skills`
>   proved the form factor. The differentiation is **cross-tool sync +
>   modular rules library + CI lint**.
> - "Senior-engineer behavior" is aspirational. The before/after
>   transcripts in `examples/` are illustrative composites — real-world
>   results vary by model. The rules I am most confident about: the
>   verification loop, "don't hide confusion," and the stop conditions.
>
> Happy to answer questions about any of the principles, the CLI, or why a
> particular rule made the canonical file.

**Why this comment works:**
- Opens with personal pain ("my team's CLAUDE.md had drifted")
- States exactly what's in the repo (specific line counts)
- Pre-empts the obvious skeptic ("MIT-licensed markdown plus 230 lines of
  glue") instead of letting a top comment frame it
- Credits upstream (Linux Foundation, Karpathy)
- Names what it's *not* sure about (signals honesty)
- Ends with an invitation to debate the rules

---

## Engagement playbook (first 6 hours = 80% of HN value)

**Reply to every top-level comment within 30 minutes.** Set a timer.

### How to reply

| Comment archetype | Reply pattern |
|---|---|
| "Just markdown, why is this a project?" | Agree. Then: the value is the curated principles + the CI + the sync. Link to the lint output. |
| "Why not just symlink?" | "You can — `npx agentrails sync --link` does that. The wrappers exist for tools that don't follow symlinks (Windows, some CI runners) and for tools whose file needs a slightly different header." |
| "I disagree with rule X" | "Fair — what'd you change? Open an issue or paste here, I'll add a rules-extras entry if it generalizes." |
| "Does this work with [tool]?" | If yes, link to the wrapper. If no, "not yet — would take ~10 lines, want to send a PR?" |
| "Karpathy's repo already does this" | "His is Claude-only. This is the same principles + extensions, mirrored to every agent's config file. Different scope." |
| "How do you measure that this works?" | Honest: behavioral change is hard to measure absolutely. Show the lint score, link the before/after transcripts, acknowledge the limit. |
| "This is just opinions" | "Yes — opinions you can fail CI on. That's the value." |
| Hostile / dismissive | One polite reply addressing the substance, then disengage. Don't feed it. |

### Hard rules for HN engagement

- **Never** call out a downvote. Never edit a comment to add "edit: stop
  downvoting me." Both kill the post.
- **Never** ping mods to flag a hostile comment. Let dang handle the
  obvious cases.
- **Never** tell a critic "you didn't read the README." Quote the relevant
  section instead.
- **Don't** post a flurry of new top-level comments to inflate engagement —
  HN's ranker counts comments per author and penalizes self-engagement.
- **Don't** ask people to upvote. Ever. Permanent ban risk.
- **Don't** tweet "we're on HN, please upvote!" — that's an explicit guideline
  violation.

---

## Post-launch HN follow-up

- **T+24h:** if the post made front page (top 30), write a "what I learned"
  comment with stats: views, stars gained, top criticism. Builds goodwill.
- **T+72h:** do *not* resubmit the same URL — HN deduplicates and penalizes.
  If the post failed, wait at least 30 days before submitting again, and
  change either the title or the URL meaningfully.
- **T+7 days:** if any commenter became a contributor, mention them in the
  thank-you tweet. HN people see those.
