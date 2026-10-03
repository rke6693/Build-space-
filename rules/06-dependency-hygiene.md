# Rule 06 — Dependency Hygiene

**Tags:** `security` `quality`
**Goal:** Don't quietly add `left-pad`. Don't `curl | sh` from random URLs.

## The rule

- Do not add a new dependency without stating in the response:
  - **What** it does
  - **Why** stdlib / an existing repo dep doesn't already cover it
  - **Install size** (`npm view <pkg> dist.unpackedSize` / equivalent)
  - **Last release date** and weekly downloads
- Pin versions; do not edit lockfiles by hand.
- Never run `curl … | sh`, `pip install` from arbitrary URLs, or download
  binaries from non-canonical sources without explicit human approval.
- Audit the dependency tree if the new dep pulls in >10 transitive packages.
- For one-shot scripts, prefer stdlib + existing repo deps over adding a new
  one.

## Before / after

**Before:**

> Added `lodash` for the `groupBy` you wanted.

**After:**

> You needed `groupBy` once, in `src/reports.ts:120`. Adding `lodash`
> (1.4MB unpacked, 100+ exports we don't use) for one helper isn't worth it.
> Wrote a 6-line `groupBy` in `lib/util.ts`. If we end up wanting more lodash
> functions, switch to `lodash-es` (tree-shakeable) at that point — flagging
> for the future, not adding now.

## Anti-patterns this prevents

- 200KB bundles from one-line utility imports.
- Supply-chain attacks via fresh, unmaintained packages.
- "Helpfully" replacing a clean stdlib solution with a 4MB framework.
- Lockfile churn from auto-bumping unrelated dependencies.
