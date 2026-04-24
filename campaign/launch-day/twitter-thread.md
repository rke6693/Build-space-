# Twitter / X launch thread

Publish at **7:00 AM PT**, after the HN post is live and ranking.
Tag/mention nobody on the first tweet — earn it.

Each tweet ≤ 280 chars. The first tweet is the only one that gets seen by
non-followers, so the *hook* and the *image* must work alone.

---

## Tweet 1 — the hook

> Karpathy proved one CLAUDE.md can change a coding agent's behavior at
> scale.
>
> But his file only works in Claude Code.
>
> So I shipped agentrails: one AGENTS.md, mirrored to every agent your
> team uses — Claude, Codex, Cursor, Gemini, Copilot, Aider.
>
> 30 seconds to install. ↓

**Image:** the social preview card from `press-kit.md`. Make sure
the wordmark is legible at small sizes — Twitter compresses thumbnails
hard.

---

## Tweet 2 — the problem

> If your team uses more than one coding agent, you maintain
> CLAUDE.md AND .cursorrules AND copilot-instructions.md AND GEMINI.md.
>
> They drift. The agents disagree. Bugs slip through.
>
> Most teams gave up and just have one rule per agent.

---

## Tweet 3 — the fix

> agentrails ships ONE canonical AGENTS.md.
>
> A 200-line CLI mirrors it to every wrapper file.
>
> A GitHub Action fails CI when they drift or when someone deletes a
> principle.
>
> Source of truth: solved.

**Image (optional):** screenshot of `npx agentrails sync` output:
```
$ npx agentrails sync
wrote CLAUDE.md
wrote GEMINI.md
wrote .cursorrules
wrote .github/copilot-instructions.md
synced 4 wrapper file(s) from AGENTS.md
```

---

## Tweet 4 — what's actually in AGENTS.md

> What's in the canonical 200 lines:
>
> 1. Karpathy's four principles (don't assume, surface confusion, surface
>    tradeoffs, goal-driven)
> 2. Verification loops (typecheck + run the tests, every time)
> 3. Scope discipline (no "while I was there" refactors)
> 4. The five forbidden phrases
> 5. Stop conditions

---

## Tweet 5 — the forbidden phrases (most viral single tweet)

> The five phrases your coding agent should NEVER say (each one means
> something got skipped):
>
> "This should work." → I didn't run it
> "I've simplified the logic." → I deleted code I didn't understand
> "For robustness, I added…" → I added a try/except that swallows errors
> "To be safe, I also…" → I expanded scope without asking
> "I noticed and fixed…" → I changed something unrelated

**Image:** clean dark-mode card showing this as a 5-row table.
*This tweet will outperform the rest of the thread. Make it standalone-good.*

---

## Tweet 6 — before/after receipts

> Same prompt: "fix the off-by-one in pagination."
>
> WITHOUT agentrails:
> 800-line PR. Renames the function. Extracts a helper. Adds pagination
> to two unrelated endpoints. Updates README. "This should work."
>
> WITH agentrails:
> 1-line fix. 1 regression test, run, green. Done.

---

## Tweet 7 — the CLI

> The CLI is one .mjs file, zero deps:
>
> agentrails sync     # mirror AGENTS.md to all wrappers
> agentrails check    # lint your AGENTS.md (0–100 score)
> agentrails compose  # build AGENTS.md from rules/*.md
> agentrails list     # list installed rules
>
> No service. No telemetry. MIT.

**Image:** a clean screenshot of `agentrails check` output showing the
0–100 score.

---

## Tweet 8 — modular

> Don't like a rule? Pick the ones you want.
>
> rules/01-karpathy-canon.md
> rules/02-verification-loops.md
> rules/03-scope-discipline.md
> rules/04-no-sycophancy.md
> rules/05-error-handling.md
> rules/06-dependency-hygiene.md
> rules/07-secrets
> rules/08-comments
> rules/09-git
> rules/10-stop-conditions

---

## Tweet 9 — credit upstream

> Standing on shoulders.
>
> @karpathy → the four principles.
> @forrestchang → andrej-karpathy-skills, which proved the format.
> Linux Foundation Agentic AI Foundation → AGENTS.md spec.
> Boris Cherny → Claude Code workflow patterns.
>
> The repo's job is to make the lessons portable.

*(Use real Twitter handles only — verify each before posting.
 If you can't find a verified handle, drop the @ and use the name in
 plain text. Do not invent handles.)*

---

## Tweet 10 — install

> Drop it in:
>
> curl -O https://raw.githubusercontent.com/rke6693/build-space-/main/AGENTS.md
> npx agentrails sync
>
> That's the whole install. No account, no signup, no telemetry.

---

## Tweet 11 — what it's not

> What this is NOT:
>
> Not a SaaS. Not a model. Not a framework. Not a Cursor/Copilot
> replacement.
>
> It works INSIDE the agent you already use. Each one reads its own config;
> agentrails just keeps them all on the same rules.

---

## Tweet 12 — call to action

> agentrails: one AGENTS.md, every coding agent.
>
> 🔗 github.com/rke6693/Build-space-
>
> If you've already got a CLAUDE.md you love, run `npx agentrails check`
> against it — you'll get a 0–100 score and a diff of what's missing.
> Adopt incrementally. PRs welcome.

*(One link only at the end — Twitter penalizes link-heavy threads.)*

---

## Reply rotation (first 4 hours)

Set a 30-minute timer. Reply to every comment with substance. Patterns:

- **"How does it differ from agents-md?"**
  > "agents-md is one file. agentrails is the file PLUS modular rules
  > you can compose, the CI lint, and the sync to every wrapper. Same spirit,
  > broader scope. Both MIT, both work."

- **"Does it work with Windsurf / Replit / Trae?"**
  > "Native AGENTS.md support yes; tool-specific wrapper not yet — would
  > be a 10-line PR if you want it shipped. Tag me on the issue."

- **"Show your benchmarks"**
  > "Honest answer: behavioral change is hard to A/B benchmark in a
  > principled way. The before/after in examples/ is illustrative not
  > causal. The thing I AM measuring: lint scores across 20 popular repos,
  > posting that next week."

---

## Post-thread checklist

- [ ] Pin the thread to your profile for 14 days
- [ ] Quote-tweet your own thread once at 6h with a single highlight
  (probably tweet 5, the forbidden phrases — most shareable)
- [ ] Don't re-thread the same content. Don't @-spam Karpathy or anyone
  to RT. The repo earns the link.

---

## What to *not* do

- ❌ No "🧵👇" — implied
- ❌ No "RT if helpful"
- ❌ No fake giveaways ("first 100 to RT get…")
- ❌ No buying engagement
- ❌ Don't reply-guy on Karpathy's threads with "look at my repo"
