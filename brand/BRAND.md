# Keel — Brand System

This directory holds the canonical brand assets. Everything on the landing
page, in the docs, and (later) in the dashboard is sourced from here so the
product presents as one thing, not a collage.

## Assets

| File              | Use |
|-------------------|-----|
| `logo.svg`        | Full horizontal lockup (mark + wordmark). 200 × 64. |
| `mark.svg`        | Square mark only. 64 × 64. Use on tight surfaces. |
| `favicon.svg`     | Browser tab icon. Simplified — no sheen overlay. |
| `tokens.ts`       | Design tokens for TS/JS consumers (dashboard, docs, SDKs). |
| `tokens.css`      | Same tokens as CSS custom properties. Load before styles. |

## Palette

| Token              | Hex      | Use |
|--------------------|----------|-----|
| `bg`               | `#0A0E1A`| Page background. |
| `bgElevated`       | `#0F1629`| Cards, nav. |
| `bgElevated2`      | `#141C33`| Hovers, nested containers. |
| `border`           | `rgba(255,255,255,0.08)` | Default card edge. |
| `textPrimary`      | `#F8FAFC`| Headings, body. |
| `textSecondary`    | `#94A3B8`| Captions, labels. |
| `textMuted`        | `#64748B`| Disabled, meta. |
| `brandCyan`        | `#22D3EE`| Logo gradient start, accent lines. |
| `brandIndigo`      | `#7C5CFF`| Middle stop of brand gradient. |
| `brandPurple`      | `#8B5CF6`| Logo gradient end, primary CTA fill. |
| `success`          | `#10B981`| Positive deltas, "saved" numbers. |
| `warn`             | `#F59E0B`| Budget warnings. |
| `danger`           | `#F43F5E`| Error states. |

The signature gradient is cyan → indigo → purple at 135°. Reserve it for the
logo, hero headline, and the Shadow-Evaluation card. Use semantic colors
everywhere else.

## Typography

Primary face is **Inter** (self-host as a variable font, weights 400/500/600/700).
Fallback stack is in `tokens.ts`. Mono is **JetBrains Mono** for code snippets.

Scale (rem): 0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 3.5. Tight
letter-spacing (-0.02em) for display sizes; normal elsewhere.

## Voice

- **Plain.** "Cuts LLM costs 30–70%," not "revolutionary AI optimization."
- **Specific.** Always attach a number. "p95 overhead under 2ms," not "low overhead."
- **Confident, not breathless.** The product does real work; let it speak.
- **Engineers first.** Every benefit is also measurable.

## Do / Don't

- **Do** keep the gradient tied to brand surfaces. Never apply it to plain body text.
- **Do** use emerald `success` for money-saved numbers specifically — it cues the core promise.
- **Don't** place the mark on pure white without adjusting — the sheen overlay expects a dark surface.
- **Don't** stretch or re-color the mark. If a context needs a different color, use a flat white variant.

## Logo clear space

Minimum padding around the lockup equals the height of the "K" in the mark
(~half the mark's height). Below 24px tall, use `mark.svg` instead of
`logo.svg`.

## Favicon

`favicon.svg` is the simplified variant — no sheen, flat gradient, trimmed
inner stroke. It stays legible at 16×16.
