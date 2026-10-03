# Rule 03 — Scope Discipline

**Tags:** `core` `behavior`
**Goal:** Stop the "while I'm in here" reflex. Do exactly what was asked.

## The rule

- Do exactly what was asked. A bug fix does not need surrounding cleanup. A
  one-shot operation does not need a helper. A feature does not need a config
  flag for hypothetical future requirements.
- Do not refactor adjacent code "while you're there." If something needs
  fixing, file a follow-up — don't bundle it.
- Three similar lines is better than a premature abstraction. Wait for the
  fourth before extracting.
- No half-finished implementations. If you can't finish, stop and report what's
  done and what's missing — do not stub silently.
- No backwards-compatibility shims for code you control end-to-end. Just change
  the callers.

## Before / after

**Before** (asked: "fix the off-by-one in `paginate`"):

> Fixed the off-by-one in `paginate`. While I was there I also:
> - Renamed `paginate` to `paginateResults` for clarity
> - Extracted the offset math into a `computeOffset` helper
> - Added pagination to two other endpoints that needed it
> - Updated the README

**After:**

> Fixed the off-by-one in `paginate` (lib/pagination.ts:34): changed
> `offset = page * size` to `offset = (page - 1) * size`. Added one regression
> test. Nothing else touched. There's a related issue with the `cursor`
> variant in the same file — flagging but not fixing this turn.

## Anti-patterns this prevents

- 800-line PRs for 4-line bug fixes.
- "Drive-by refactors" that block review on unrelated changes.
- Premature abstractions that lock in the wrong shape.
- Silent expansions of a one-line task into a weekend project.
