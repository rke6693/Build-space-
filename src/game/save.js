import { ACT_COUNT } from "../data/levels.js";
import { CREATURE_IDS, STARTING_UNLOCKS } from "../data/creatures.js";

export const SAVE_KEY = "squishymon-lumenfen-v2";
/** Read once, on first load, so a v1 player keeps their field notes. */
export const LEGACY_KEY = "squishymon-lumenfen-v1";
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    unlocked: [...STARTING_UNLOCKS],
    wins: 0,
    runs: 0,
    bestTime: null,
    actBests: new Array(ACT_COUNT).fill(null),
    furthestAct: 0,
    bestChain: 0,
    totals: { seeds: 0, rescues: 0, squishes: 0 },
    settings: { sound: true, assist: false, motion: "system" }
  };
}

function positiveIntegerOr(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function timeOrNull(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/**
 * Accepts anything — a v1 blob, a truncated object, hand-edited JSON — and
 * returns a save that every other module can trust without guarding.
 */
export function normalizeSave(raw) {
  const base = defaultSave();
  if (!raw || typeof raw !== "object") return base;

  const unlocked = Array.isArray(raw.unlocked) ? raw.unlocked : [];
  base.unlocked = CREATURE_IDS.filter(
    (id) => STARTING_UNLOCKS.includes(id) || unlocked.includes(id)
  );

  base.wins = positiveIntegerOr(raw.wins, 0);
  base.runs = positiveIntegerOr(raw.runs, base.wins);
  base.bestTime = timeOrNull(raw.bestTime);
  base.bestChain = positiveIntegerOr(raw.bestChain, 0);

  const actBests = Array.isArray(raw.actBests) ? raw.actBests : [];
  base.actBests = base.actBests.map((_, index) => timeOrNull(actBests[index]));

  const furthest = positiveIntegerOr(raw.furthestAct, 0);
  // Finishing the game unlocks every act for replay, whatever the blob says.
  base.furthestAct = Math.min(ACT_COUNT - 1, base.wins > 0 ? ACT_COUNT - 1 : furthest);

  const totals = raw.totals && typeof raw.totals === "object" ? raw.totals : {};
  base.totals = {
    seeds: positiveIntegerOr(totals.seeds, 0),
    rescues: positiveIntegerOr(totals.rescues, 0),
    squishes: positiveIntegerOr(totals.squishes, 0)
  };

  // v1 stored `sound` at the top level; v2 groups player settings together.
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const sound = settings.sound ?? raw.sound;
  base.settings = {
    sound: sound !== false,
    assist: settings.assist === true,
    motion: ["system", "full", "reduced"].includes(settings.motion) ? settings.motion : "system"
  };

  base.version = SAVE_VERSION;
  return base;
}

/** `storage` is any localStorage-shaped object; missing or throwing is fine. */
export function loadSave(storage) {
  if (!storage) return defaultSave();
  for (const key of [SAVE_KEY, LEGACY_KEY]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      return normalizeSave(JSON.parse(raw));
    } catch {
      // Corrupt entry for this key — fall through and try the next one.
    }
  }
  return defaultSave();
}

/** Returns true when the write landed, so callers can warn the player once. */
export function persistSave(storage, save) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function recordActTime(save, actIndex, milliseconds) {
  const time = timeOrNull(milliseconds);
  if (time === null || actIndex < 0 || actIndex >= save.actBests.length) return false;
  const previous = save.actBests[actIndex];
  if (previous !== null && previous <= time) return false;
  save.actBests[actIndex] = time;
  return true;
}

export function recordRunTime(save, milliseconds) {
  const time = timeOrNull(milliseconds);
  if (time === null) return false;
  if (save.bestTime !== null && save.bestTime <= time) return false;
  save.bestTime = time;
  return true;
}

export function unlockAct(save, actIndex) {
  const next = Math.min(ACT_COUNT - 1, Math.max(0, actIndex));
  if (next <= save.furthestAct) return false;
  save.furthestAct = next;
  return true;
}
