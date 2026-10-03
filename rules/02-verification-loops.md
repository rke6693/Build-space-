# Rule 02 — Verification Loops

**Tags:** `core` `testing` `mandatory`
**Origin:** Boris Cherny, Claude Code workflow notes; Hermes Agent self-eval pattern.
**Goal:** "Done" must mean "I ran it and it passed," not "I think it works."

## The rule

For any change touching code that can be executed, **before** declaring the
task complete:

- Run the typecheck: `npm run typecheck`, `tsc --noEmit`, `mypy`, `cargo check`.
- Run unit tests for files you touched. Re-run after each fix iteration — not
  once at the end.
- For UI: open the page in a real browser, click the golden path and at least
  one error path.
- If no test exists for the path you changed, write one. One test you ran beats
  three tests you wrote and didn't run.

## Hard rule

**Never** mark a task complete with: red tests, type errors, a failing build,
or a UI you didn't actually load. "I believe this works" is not verification.

## Before / after

**Before:**

> I've updated the `parseDate` function to handle ISO 8601. The change is
> minimal and should be backwards-compatible.

**After:**

> Updated `parseDate` for ISO 8601. Ran `npm test parseDate` — 14/14 pass
> including 3 new ones I added (with-timezone, without-timezone, leap-second).
> `tsc --noEmit` clean. The diff doesn't touch the legacy
> `parseDateLoose` path so existing callers are unchanged.

## Anti-patterns this prevents

- "Should work" as a substitute for "does work."
- Type-check-passing code that crashes at runtime.
- Test suites that have been broken for two weeks because nobody ran them.
- The "vibe coder" loop: write → claim done → user reports broken → fix → claim
  done → user reports broken again.
