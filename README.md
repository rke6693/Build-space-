# agentrails

> **One `AGENTS.md`. Every coding agent. Senior-engineer behavior.**

Drop one markdown file into your repo. Claude Code, Codex, Cursor, Gemini CLI,
GitHub Copilot, Aider, opencode, and Devin all read the same rules. No more
maintaining `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, and
`.github/copilot-instructions.md` by hand. No more "this should work."

```bash
# in your repo
curl -O https://raw.githubusercontent.com/rke6693/build-space-/claude/viral-github-repo-NSir7/AGENTS.md
npx agentrails sync
```

That's it. Every coding agent in your repo now behaves like a senior engineer
who reads the spec, surfaces tradeoffs, runs the tests, and stops when
confused.

---

## Why this exists

In April 2026, [`andrej-karpathy-skills`](https://github.com/forrestchang/andrej-karpathy-skills)
hit 70k+ stars in three weeks for a **single `CLAUDE.md`** file. The lesson:
the cheapest, highest-leverage change you can make to an LLM coding agent is
giving it good rules.

But `CLAUDE.md` only works in Claude Code. `AGENTS.md` (now stewarded by the
[Linux Foundation's Agentic AI Foundation](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation))
is the cross-tool standard, but every team writes their own from scratch and
re-discovers the same anti-patterns by trial and error.

`agentrails` is the canonical, opinionated, battle-tested `AGENTS.md` —
synthesizing Karpathy's four principles, Boris Cherny's Claude Code workflow,
and the lessons that have shaken out over a year of agent-driven development —
plus a 200-line CLI that keeps every coding agent's config file in sync from
that one source of truth.

---

## What's in the box

```
AGENTS.md                            ← the canonical 200-line operating manual
CLAUDE.md                            ← mirror of AGENTS.md (managed by `sync`)
GEMINI.md                            ← mirror of AGENTS.md
.cursorrules                         ← mirror of AGENTS.md
.github/copilot-instructions.md      ← mirror of AGENTS.md
rules/
  01-karpathy-canon.md               ← the four principles
  02-verification-loops.md           ← never ship red tests
  03-scope-discipline.md             ← stop the "while I was there" drift
  04-no-sycophancy.md                ← cut "Great question!"
  05-error-handling.md               ← honest failures, not swallowed ones
  06-dependency-hygiene.md           ← no surprise lodash imports
  07-secrets-and-destructive-ops.md  ← never commit a key, never `--force` to main
  08-comments-and-docs.md            ← stop narrating the code
  09-git-and-commits.md              ← no amends, no `git add .`
  10-stop-conditions.md              ← know when to stop and ask
bin/agentrails.mjs                   ← zero-dep CLI: sync, check, compose, list
examples/before-after.md             ← real transcripts: with vs without
.github/workflows/agentrails-check.yml   ← CI lint to keep wrappers in sync
```

---

## The four principles (Karpathy canon)

These override everything else.

1. **Don't assume.** If the spec is ambiguous, the file might not exist, the
   schema might have changed — read, run, or ask before writing a single line.
2. **Don't hide confusion.** Surface contradictions out loud and stop. A
   confused agent that ships is the most expensive failure mode.
3. **Surface tradeoffs.** State at least one rejected alternative and why for
   every nontrivial decision.
4. **Goal-driven, not task-driven.** The user's stated task is a hypothesis.
   If the literal task won't reach the goal, say so first.

The full file is [AGENTS.md](./AGENTS.md). It's 200 lines. Read it once.

---

## Install

### One file, zero install

The `AGENTS.md` is the entire product. Copy it into your repo and you're done.
Every modern coding agent will pick it up.

```bash
curl -O https://raw.githubusercontent.com/rke6693/build-space-/claude/viral-github-repo-NSir7/AGENTS.md
```

### Or sync the wrappers automatically

If you want every agent's tool-specific file (`CLAUDE.md`, `GEMINI.md`,
`.cursorrules`, `.github/copilot-instructions.md`) to stay mirrored to
`AGENTS.md`:

```bash
npx agentrails sync
# or use symlinks (Linux/macOS):
npx agentrails sync --link
```

Run it as a pre-commit hook so a stale `CLAUDE.md` can never get committed.

### Or build your own from rules/

Pick the rules you want, drop the rest:

```bash
# clone, delete rules you don't want from rules/, then:
npx agentrails compose rules/
# → writes a new AGENTS.md from whatever's left
```

---

## CLI

```bash
agentrails sync [--link]    # mirror AGENTS.md → all wrapper files
agentrails check            # lint AGENTS.md, score 0–100, exit 1 on red
agentrails compose [dir]    # build AGENTS.md from rules/*.md
agentrails list             # list rules in ./rules
```

`agentrails check` is what you run in CI. It looks for:

- ✅ Verification loops (mentions tests, typecheck)
- ✅ Scope discipline (mentions "exactly what was asked")
- ✅ Ambiguity handling ("don't assume")
- ✅ Stop conditions ("stop and ask")
- ✅ Tradeoffs ("alternative", "tradeoff")
- ❌ Forbidden phrases the agent shouldn't echo back at users
- ❌ Files over 250 lines (signal gets buried)
- ❌ Missing project-specific commands

The included GitHub Action ([`.github/workflows/agentrails-check.yml`](./.github/workflows/agentrails-check.yml))
also fails CI if `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, or
`.github/copilot-instructions.md` have drifted from `AGENTS.md`.

---

## Compatibility

| Tool | File it reads | Status |
|---|---|---|
| Claude Code | `CLAUDE.md` | ✅ mirrored from `AGENTS.md` |
| OpenAI Codex CLI | `AGENTS.md` | ✅ native |
| Cursor | `.cursorrules` | ✅ mirrored |
| Gemini CLI | `GEMINI.md` | ✅ mirrored |
| GitHub Copilot | `.github/copilot-instructions.md` | ✅ mirrored |
| Aider | `AGENTS.md` | ✅ native |
| opencode | `AGENTS.md` | ✅ native |
| Devin | `AGENTS.md` | ✅ native |
| Windsurf | `.windsurfrules` | partial — open a PR to add |
| Amp | `AGENTS.md` | ✅ native |

---

## Before & after

See [examples/before-after.md](./examples/before-after.md) for real transcript
comparisons — same prompt, same model, with and without `agentrails`.

Sample:

> **Prompt:** "Fix the off-by-one in the pagination."
>
> **Without agentrails:** an 800-line PR. Renames the function. Extracts a
> helper. Adds pagination to two unrelated endpoints. Updates the README. No
> tests run. "This should work."
>
> **With agentrails:** finds the *one* off-by-one. One-line fix. One
> regression test, run, green. Flags the second pagination call site without
> touching it. Done.

---

## FAQ

**Is this just `awesome-claude-code` again?**
No — that's a list of links. This is a single, opinionated `AGENTS.md` you
drop into your repo right now and ship.

**How is this different from `andrej-karpathy-skills`?**
That one's Claude-only. `agentrails` is cross-tool: same rules, every agent.
Plus extensions beyond Karpathy's four principles — verification loops, scope
discipline, dependency hygiene, secrets handling, git discipline, stop
conditions.

**How is this different from `agents-md`?**
`agents-md` ships one file. `agentrails` ships:
- A canonical `AGENTS.md` you can drop in as-is, **and**
- A modular `rules/` library you can compose your own from, **and**
- A CLI that keeps `CLAUDE.md`, `GEMINI.md`, `.cursorrules`,
  `copilot-instructions.md` mirrored, **and**
- A CI lint that fails when the rules drift, **and**
- Before/after transcripts so you can show your team what changes.

**Does it work with my team's existing `AGENTS.md`?**
Yes. Run `agentrails check` against it — you'll get a 0–100 score and a
diff of what's missing. Adopt incrementally.

**What if I disagree with a principle?**
Open a PR. Or fork `rules/` and `compose` your own. The whole point is
opinionated-but-modular.

**License?**
MIT. Take it, fork it, sell it, brand it. The principles are the world's
now.

---

## Contributing

PRs welcome. Especially:

- **New rules** in `rules/` (must include before/after)
- **New wrapper integrations** (Windsurf, Replit, Trae, etc.)
- **CI checks** in `bin/agentrails.mjs` for new anti-patterns
- **Translations** of `AGENTS.md`

Run `node bin/agentrails.mjs check` before opening a PR.

---

## Credits

- **Andrej Karpathy** — the four principles
- **Forrest Chang** ([andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills))
  — for proving a single markdown file can change agent behavior at scale
- **Boris Cherny** — Claude Code workflow patterns
- **Linux Foundation Agentic AI Foundation** — stewards of `AGENTS.md`
- The hundreds of engineers who've posted "I had to add this to my CLAUDE.md
  because…" threads. This file is yours.

---

## License

MIT — see [LICENSE](./LICENSE).
