# Follow-up blog series & demo video

Sustaining content for weeks 2–8. Each piece can stand alone, but together
they build a body of work that makes agentrails the *default reference* for
the AGENTS.md category.

---

## Blog series — 5 posts (one per week, weeks 2–6)

Each post follows the same template:

1. **Hook:** specific problem, ideally with a real anecdote.
2. **Data:** at least one real number from running the lint or surveying
   repos.
3. **Mechanism:** the principle from `AGENTS.md` that addresses it.
4. **Practice:** show the rule applied — before/after, with a runnable
   example.
5. **Counter-position:** name one situation where the rule is wrong.

Cross-post: dev.to, Hashnode, Medium, personal blog (canonical), LinkedIn.

---

### Post 1 — "The five forbidden phrases" (week 2)

Standalone deep-dive on the rule that already went viral on Twitter.

Outline:
- Why each phrase is a tell (with a real example transcript per phrase)
- Where the phrases come from (RLHF tendency to be agreeable, fear of
  saying "I don't know")
- The lint regex and how it triggers
- When you'd want the phrase anyway (e.g., "I've simplified the logic"
  is fine *if* followed by a diff)
- The deeper rule: the agent's voice should be *forensic*, not
  *reassuring*

Length: ~1500 words. Generates the most shares of the series.

---

### Post 2 — "We CI-checked our AI rules. The first run scored 47/100." (week 3)

The case-study post. Real lint output from a real codebase.

Outline:
- Setup: the team grew its CLAUDE.md by accretion, nobody owned it
- The first lint run: 47/100, missing verification, missing stop
  conditions, three forbidden phrases shipped *to engineers as guidance*
- What we changed (each missing principle, with the markdown diff)
- The second run: 92/100. The remaining 8 points are the project-specific
  section, which is correctly scored low for a generic example
- What changed in PR review behavior over the next two weeks
- What didn't change (some agents still hallucinate imports; rules can't
  fix model quality)

Length: ~2000 words. Will land with the engineering-leadership audience
specifically.

---

### Post 3 — "I lint-checked the AGENTS.md of 20 popular open-source repos" (week 4)

Data-driven post. Run the lint across 20 real repos with public AGENTS.md
files. Publish the distribution.

Outline:
- Methodology: how I picked the repos (top by stars in 5 categories),
  how I ran the lint
- The distribution chart (median, P10, P90)
- Common patterns: most missed principle, most common forbidden phrase,
  longest file
- Outliers: best score and what they did right; worst score and what was
  missing
- One repo's owner gave permission to be named — interview snippet
- The takeaway: the AGENTS.md ecosystem is young; most files are
  under-cooked; the lint is a quick-win for any team

Length: ~1500 words. **This is the post that makes the data moat real.**
Don't fake the data. Run the lint.

---

### Post 4 — "AGENTS.md is the new package.json" (week 5)

The category-defining argument piece. Higher up the abstraction stack
than the rest.

Outline:
- The case: every package ecosystem grew a single canonical config
  (package.json, pyproject.toml, Cargo.toml). The AI coding ecosystem
  needs the same.
- Why a canonical file matters: tooling, lint, sharing, compositionality
- The history: from .cursorrules to CLAUDE.md to AGENTS.md (LF spec)
- What standardization unlocks next: shared rule registries, "extends"
  syntax, package-managed rule libraries
- agentrails' role in the standard: opinionated default + sync tool +
  lint
- What I'd be wrong about: a single standard might *over*-converge the
  ecosystem; competing files (CLAUDE.md, GEMINI.md) might stay
  intentionally different

Length: ~1800 words. Lands with the architect / staff-engineer audience.

---

### Post 5 — "What I'd cut from agentrails if I started over today" (week 6)

The honest retrospective. Always overperforms because authenticity is
rare.

Outline:
- Two months in. Stars: [N]. Adopters (estimated by GitHub search): [N].
- The principles I'd keep (the verification loop, stop conditions, the
  five forbidden phrases)
- The principles I'd cut or weaken (something that didn't generalize)
- The CLI features I overshipped (the `compose` command nobody used)
- What I'd add (probably: a `rules-extras/` registry, an `extends:` syntax)
- What the project taught me about shipping markdown as a product

Length: ~1200 words. Closes out the series and seeds the next phase.

---

## Demo video — 3 minutes

**Format:** screencast, no face-cam, voice-over. Hosted on YouTube and
embedded in the README.

**Script:**

> [0:00–0:10]
> *Black screen, white text fades in:*
> "Every team using AI coding agents now maintains four config files."
> *Cut to: a quad-split screen showing CLAUDE.md, GEMINI.md, .cursorrules,
> .github/copilot-instructions.md side by side.*

> [0:10–0:25]
> *Voice-over while the screens scroll, showing the files diverging
> over time:*
> "They drift. The agents disagree. Bugs slip through. Most teams gave up
> and just have one rule per agent."

> [0:25–0:45]
> *Title card: agentrails. One AGENTS.md. Every coding agent.*
> *Voice-over:*
> "agentrails is one canonical AGENTS.md, mirrored to every coding agent
> your team uses, plus a CI lint that fails when the rules drift."
> *Cut to terminal:*
> ```
> $ npx agentrails sync
> wrote CLAUDE.md
> wrote GEMINI.md
> wrote .cursorrules
> wrote .github/copilot-instructions.md
> ```

> [0:45–1:15]
> *Show AGENTS.md scrolling at reading-speed.*
> *Voice-over:*
> "The canonical file is 200 lines: Karpathy's four principles, plus
> verification loops, scope discipline, the five forbidden phrases, dep
> hygiene, secrets handling, git discipline, stop conditions. Drop it in,
> or pick rules from the modular library."

> [1:15–1:45]
> *Split-screen comparison: same prompt to Cursor with vs without
> .cursorrules synced from agentrails. Speed up to 2× during typing.
> The "without" version produces a sprawling refactor; the "with"
> version produces a one-line fix.*
> *Voice-over (over the comparison):*
> "Same prompt. Same model. Same codebase. Different rules. The
> 'without' version refactors the function, extracts a helper, adds
> pagination to two unrelated endpoints. The 'with' version fixes the
> one off-by-one and stops."

> [1:45–2:15]
> *Cut to terminal:*
> ```
> $ npx agentrails check
> + present: verification loop
> + present: scope discipline
> + present: ambiguity / assumption
> + present: stop conditions
> + present: tradeoffs
> agentrails score: 100/100
> ```
> *Voice-over:*
> "The lint scores your AGENTS.md 0–100. The first repo we ran it on
> scored 47. We rewrote it. We now score 100. CI fails the build when
> the score drops or when the wrappers drift."

> [2:15–2:45]
> *Show the README pinning the topics, the GitHub Action checkmarks
> green, the sync working in real time.*
> *Voice-over:*
> "Drop AGENTS.md into your repo. Run npx agentrails sync. Add the
> GitHub Action. That's the whole adoption."

> [2:45–3:00]
> *Hold on: github.com/rke6693/Build-space-*
> *Voice-over:*
> "MIT-licensed. Zero dependencies. The link's in the description.
> Fork it, ignore the rules you disagree with, send PRs for the ones
> you'd add."
> *Fade to black.*

**Production notes:**
- Record at 1080p, 60fps, ScreenFlow / OBS.
- Voice-over: monotone-but-warm. Don't try to sound enthusiastic.
- Music: none, or extremely subtle Lo-fi at -28 LUFS. Most viewers will
  watch on mute.
- Captions: hard-burn captions in. ~85% of dev-content video views are
  muted.
- Total length: max 3 minutes. Cut every word that doesn't serve the
  comparison shot.

**Don't:**
- ❌ Don't open with "Hey everyone!"
- ❌ Don't include emoji animations or zooming text
- ❌ Don't show your face — adds nothing, distracts from the artifact
- ❌ Don't ask viewers to like and subscribe

---

## Distribution for the video

- Embed in repo README under "Quick start"
- Cross-post to YouTube, Vimeo, Bluesky video, Twitter video
- Submit to /r/SideProject and /r/IndieHackers in week 4
- Use as the "show, don't tell" link in newsletter pitches

If the video goes nowhere in 7 days, that's fine — it lives in the README
forever and converts repo visitors who came from a link.
