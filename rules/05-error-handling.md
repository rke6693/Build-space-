# Rule 05 — Honest Error Handling

**Tags:** `quality` `code`
**Goal:** No swallowing. No defensive paranoia. Validate at boundaries, trust
internals.

## The rule

- Validate at **boundaries**: user input, network, disk, env vars, third-party
  APIs. Internal callers are trusted — don't re-validate types the type system
  already enforces.
- Do not catch exceptions you cannot handle. If you can only log and re-raise,
  let it propagate; the framework's error handler will log it correctly.
- Never write `except: pass`, `catch (e) {}`, or `if (err) return null`
  without a one-line comment naming the invariant that makes it safe.
- Errors carry data. Log them with structured context (request id, user id,
  relevant inputs) — not `console.log("oops")`.

## Before / after

**Before:**

```ts
async function getUser(id: string) {
  try {
    const u = await db.user.findUnique({ where: { id } });
    if (u) {
      try {
        const profile = await fetchProfile(u.id);
        return { ...u, profile };
      } catch (e) {
        return u;
      }
    }
    return null;
  } catch (e) {
    console.log("error", e);
    return null;
  }
}
```

**After:**

```ts
async function getUser(id: string) {
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return null;
  const profile = await fetchProfile(u.id);
  return { ...u, profile };
}
```

If `fetchProfile` should be allowed to fail, that's a *product* decision —
make it explicit at the call site, not a hidden swallow.

## Anti-patterns this prevents

- "Robust" code that hides every failure mode and ships silent corruption.
- Exception handling as scope-creep ("for safety, I also wrapped these").
- Re-validation noise that doubles the LOC of every function.
