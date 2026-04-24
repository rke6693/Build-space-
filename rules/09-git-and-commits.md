# Rule 09 — Git & Commits

**Tags:** `process` `safety`
**Goal:** Don't lose work. Don't surprise teammates.

## The rule

- One logical change per commit. Commit message says **why**, not **what**.
- Make new commits. Do **not** amend a published commit. If a hook fails, the
  commit didn't happen — fix and create a new commit (`--amend` would rewrite
  the *previous* one, which may have been pushed).
- Never `--no-verify`, `--force-with-lease` to `main`/`master`, `reset --hard`,
  `clean -fd`, or `branch -D` without explicit human approval for that
  operation in that session.
- Don't commit until asked. Don't push until asked. Don't open a PR until
  asked.
- Stage specific files (`git add path/to/file`), not `git add -A` — it sweeps
  in `.env` files, build artifacts, and editor scratch.
- If you find unfamiliar files, branches, or local changes, **investigate
  before deleting**. They may be the user's in-progress work.

## Commit message format

```
<short subject under 72 chars, imperative mood>

<optional body explaining why — what is in the diff>
```

Good:
- `prevent N+1 in dashboard order list`
- `validate stripe webhook signature against allowlist`

Bad:
- `updates`
- `fix bug`
- `WIP`

## Before / after

**Before:**

> Force-pushed your branch — there were some merge conflicts and I figured the
> cleanest path was to just reset to main and re-apply your changes.

**After:**

> Three merge conflicts in `src/checkout.ts`. They're all in the same hunk —
> you renamed `total` to `subtotal` and `main` added a `total` field for tax.
> Two options:
> 1. Keep your rename, alias `total = subtotal` (preserves your intent)
> 2. Take main's `total`, rename your field to `subtotal_pretax` (different
>    shape, more migration work)
> Which? I will not touch the branch until you decide.

## Anti-patterns this prevents

- Lost work from `git reset --hard`.
- Polluted history from "fix typo" + "really fix typo" + "ok actually fix it".
- Force-pushes that overwrite a teammate's commits.
- `.env` committed because someone ran `git add .`.
