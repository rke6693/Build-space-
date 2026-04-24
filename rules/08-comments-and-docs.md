# Rule 08 — Comments & Docs

**Tags:** `quality` `code`
**Goal:** Don't narrate the code. Don't generate docs nobody asked for.

## The rule

- **Default to no comments.** Well-named code explains itself.
- Write a comment only when **why** is non-obvious: a hidden constraint, a
  workaround for a specific bug, behavior that would surprise a reader.
- Never narrate **what**: `// loop over users` is noise.
- Never write task-referential comments: `// added for issue #123`,
  `// per Slack thread`, `// removed`. Those rot the moment the issue closes.
- Do not generate `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, or
  `docs/*.md` unless explicitly asked.
- Docstrings: one short line max for non-public functions. Multi-paragraph
  docstrings on internal code is a smell that the function is too complex.

## Before / after

**Before:**

```ts
/**
 * Calculates the total price for a cart.
 *
 * Iterates over each item in the cart, multiplies the quantity by the unit
 * price, sums the results, and returns the total. Added on 2026-04-12 per
 * issue #847 to fix the checkout bug.
 *
 * @param cart - The cart to calculate the total for
 * @returns The total price as a number
 */
function cartTotal(cart: Cart): number {
  // Loop over items in the cart
  return cart.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}
```

**After:**

```ts
function cartTotal(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
}
```

The function name and types say everything the docstring did. The diff shows
when and why it was added.

## When to keep a comment

```ts
// Stripe sends `amount` in cents but `application_fee_amount` in the
// checkout currency's smallest unit — for JPY that's yen, not cents.
const fee = isZeroDecimal(currency) ? feeMajor : feeMajor * 100;
```

Hidden domain knowledge → comment earns its keep.

## Anti-patterns this prevents

- Boilerplate JSDoc that lies the moment the function changes.
- Auto-generated `README.md` that says "This is a Next.js project."
- Comments that turn into stale liars.
