/**
 * The canvas reads its colours from the same CSS custom properties the
 * document uses, so the game field and the chrome around it can never drift
 * apart. `tone` names are what the simulation emits; they resolve here.
 */
const TOKEN_MAP = Object.freeze({
  paper: "--color-paper",
  paper2: "--color-paper-2",
  ink: "--color-ink",
  ink2: "--color-ink-2",
  accent: "--color-accent",
  accentDeep: "--color-accent-deep",
  cyan: "--color-accent-2",
  cyanDeep: "--color-accent-2-deep",
  coral: "--color-accent-3",
  coralDeep: "--color-accent-3-deep",
  mint: "--color-mint",
  night: "--color-game-night",
  deep: "--color-game-deep",
  sky: "--color-game-sky",
  water: "--color-game-water",
  stone: "--color-game-stone",
  stoneHi: "--color-game-stone-hi",
  moss: "--color-game-moss",
  mossHi: "--color-game-moss-hi",
  spore: "--color-game-spore",
  gameCyan: "--color-game-cyan",
  gameCoral: "--color-game-coral",
  brass: "--color-game-brass",
  thorn: "--color-game-thorn",
  shadow: "--color-game-shadow"
});

export function readPalette(element = document.documentElement) {
  const computed = getComputedStyle(element);
  const palette = {};
  for (const [key, token] of Object.entries(TOKEN_MAP)) {
    palette[key] = computed.getPropertyValue(token).trim();
  }
  return Object.freeze(palette);
}

/** Burst tones arrive from the simulation as names, never as colour values. */
export function toneColor(palette, tone) {
  return palette[tone] ?? palette.spore;
}
