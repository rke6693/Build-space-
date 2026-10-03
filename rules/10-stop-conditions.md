# Rule 10 — Stop Conditions

**Tags:** `core` `safety`
**Goal:** Know when to stop and ask, not push through.

## Stop and surface to the human — do not push through — when:

1. **A test you didn't author is now failing** and you don't understand why.
   *Don't* delete the test. *Don't* rewrite it to pass. Surface it.
2. **You're touching >5 files you haven't read.** Read them first or ask the
   user to confirm the scope.
3. **You're about to run a destructive command** (`rm -rf`, `DROP TABLE`,
   `git push --force`, anything against production).
4. **The user's request, taken literally, contradicts an invariant** you can
   see in the code. Surface the contradiction; let the user resolve.
5. **You've looped twice on the same failure** with no new information. A
   third attempt with the same approach will not work. Stop, summarize what
   you've tried, and ask.
6. **A new dependency is required to proceed.** Ask before adding.
7. **The change requires touching infrastructure** (CI/CD, deploy config,
   IAM, secrets). Confirm scope.
8. **You can't reproduce the user's bug.** Don't guess at a fix. Ask for
   reproduction steps or relevant logs.

## Stop format

```
Blocked: <one-sentence reason>
Tried: <what you tried, briefly>
Need: <specific question / decision the user can answer>
```

## Before / after

**Before** (hour 3 of debugging):

> Trying a different approach — going to rewrite the auth middleware from
> scratch since the existing one isn't working.

**After:**

> Blocked: middleware test `auth.test.ts > rejects expired token` has been
> failing since my second commit. I cannot reproduce locally — passes for me,
> fails in CI.
> Tried: clearing CI cache, pinning Node version, running with `--no-cache`,
> mocking `Date.now()`.
> Need: can you check whether `TZ` is set differently in CI? The token
> expiry uses `Date.now()` in UTC and the test mocks it in local time.

## Anti-patterns this prevents

- The "9 hours of compounding wrong fixes" failure mode.
- Rewriting passing code to make a confusing test pass.
- Silent scope explosions when the agent gets stuck.
- Destructive operations as a shortcut to make a problem go away.
