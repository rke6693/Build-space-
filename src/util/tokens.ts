/**
 * Cheap, tokenizer-free token estimator. Accuracy is roughly +/- 15% vs the
 * actual provider tokenizer, which is adequate for budget guardrails and
 * shadow-eval cost deltas. We do not ship a heavy tokenizer dependency; if a
 * caller needs exact token counts, use provider-reported usage from responses.
 *
 * Heuristic: ~4 characters per token for English; bias slightly up for
 * non-ASCII-heavy prompts. Derived from OpenAI's own guidance
 * (https://platform.openai.com/tokenizer) which matches ~4 chars/token average.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const len = text.length;
  // Non-ASCII heavy? Bump the density.
  let nonAscii = 0;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) > 127) nonAscii++;
  }
  const asciiRatio = 1 - nonAscii / Math.max(1, len);
  const density = asciiRatio * 0.25 + (1 - asciiRatio) * 0.5; // tokens per char
  return Math.max(1, Math.ceil(len * density));
}

export function estimateMessageTokens(
  messages: ReadonlyArray<{ role: string; content: string | unknown }>,
): number {
  let total = 0;
  for (const m of messages) {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    total += estimateTokens(c) + 4; // role + separators overhead
  }
  return total + 2; // priming
}
