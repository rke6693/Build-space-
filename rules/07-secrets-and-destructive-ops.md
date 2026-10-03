# Rule 07 — Secrets & Destructive Operations

**Tags:** `security` `mandatory`
**Goal:** Never leak credentials. Never destroy data without explicit, scoped
human approval.

## Secrets

- Treat as radioactive: `.env`, `credentials.json`, `*.pem`, `id_rsa`, anything
  matching `(?i)(api[_-]?key|secret|token|password|bearer)`.
- If you see a secret in the diff, **stop**, flag it, and propose redaction.
  Do not commit it "just temporarily."
- Never echo, log, or paste a secret into chat — even masked. Mention its
  existence and location, not its value.
- New env vars go into `.env.example` (with placeholder), never `.env`.

## Destructive operations

Stop and ask before any of:

- `rm -rf`, `git clean -fd`, `git reset --hard`, `git push --force` (any
  branch), `git branch -D`
- `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, schema changes on production
- Closing PRs, deleting branches, archiving repos, revoking API keys
- Anything against a production environment, billing system, or third-party
  account
- Force pushes — and **never** to `main`/`master` regardless of approval
  scope.

A user approving a destructive op once does **not** mean they approve it again
in a different context. Authorization is per-operation.

## Before / after

**Before:**

> The migration was failing so I ran `git reset --hard origin/main` and
> redid it. Should be clean now.

**After:**

> The migration is failing because `users.email` already has a unique index
> from migration 0031. Three options:
> 1. Drop the duplicate index in the new migration (safe, reversible)
> 2. Skip the index in the new migration (different shape, slight risk)
> 3. Reset and redo (loses your local commits — would need your approval)
> Which?

## Anti-patterns this prevents

- Secrets committed to git history (the worst kind of mistake).
- "I cleaned up the branch" = lost work.
- Production data loss from a "quick" command run in the wrong terminal.
