import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LEGACY_KEY,
  SAVE_KEY,
  defaultSave,
  loadSave,
  normalizeSave,
  persistSave,
  recordActTime,
  recordRunTime,
  unlockAct
} from "../../src/game/save.js";
import { ACT_COUNT } from "../../src/data/levels.js";

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
    map
  };
}

describe("save normalization", () => {
  it("returns a usable default for junk input", () => {
    for (const junk of [null, undefined, 4, "nope", []]) {
      const save = normalizeSave(junk);
      assert.deepEqual(save.unlocked, ["gloob", "mote"]);
      assert.equal(save.wins, 0);
      assert.equal(save.settings.sound, true);
      assert.equal(save.actBests.length, ACT_COUNT);
    }
  });

  it("always keeps the starting field notes unlocked", () => {
    const save = normalizeSave({ unlocked: ["press"] });
    assert.ok(save.unlocked.includes("gloob"));
    assert.ok(save.unlocked.includes("mote"));
    assert.ok(save.unlocked.includes("press"));
  });

  it("drops unlock ids the game does not know about", () => {
    const save = normalizeSave({ unlocked: ["needler", "definitely-not-real"] });
    assert.ok(save.unlocked.includes("needler"));
    assert.ok(!save.unlocked.includes("definitely-not-real"));
  });

  it("migrates a v1 blob, including its top-level sound flag", () => {
    const legacy = { unlocked: ["gloob", "mote", "needler"], wins: 2, bestTime: 184_000, sound: false };
    const save = normalizeSave(legacy);
    assert.equal(save.version, 2);
    assert.equal(save.wins, 2);
    assert.equal(save.bestTime, 184_000);
    assert.equal(save.settings.sound, false);
    assert.equal(save.settings.assist, false);
    // A previous win means the whole campaign is replayable.
    assert.equal(save.furthestAct, ACT_COUNT - 1);
  });

  it("rejects impossible numbers rather than storing them", () => {
    const save = normalizeSave({
      wins: -4,
      bestTime: -1,
      bestChain: Number.NaN,
      furthestAct: -2,
      actBests: [0, "fast", 12_000],
      totals: { seeds: -3, rescues: 2.7, squishes: "many" }
    });
    assert.equal(save.wins, 0);
    assert.equal(save.bestTime, null);
    assert.equal(save.bestChain, 0);
    assert.equal(save.furthestAct, 0);
    assert.deepEqual(save.actBests, [null, null, 12_000]);
    assert.deepEqual(save.totals, { seeds: 0, rescues: 2, squishes: 0 });
  });

  it("clamps an out-of-range act index to the campaign length", () => {
    assert.equal(normalizeSave({ furthestAct: 99 }).furthestAct, ACT_COUNT - 1);
    assert.equal(normalizeSave({ furthestAct: 1 }).furthestAct, 1);
  });

  it("only accepts known motion preferences", () => {
    assert.equal(normalizeSave({ settings: { motion: "reduced" } }).settings.motion, "reduced");
    assert.equal(normalizeSave({ settings: { motion: "sideways" } }).settings.motion, "system");
  });
});

describe("save storage", () => {
  it("prefers the v2 key over the legacy one", () => {
    const storage = memoryStorage({
      [SAVE_KEY]: JSON.stringify({ wins: 5 }),
      [LEGACY_KEY]: JSON.stringify({ wins: 1 })
    });
    assert.equal(loadSave(storage).wins, 5);
  });

  it("falls back to the legacy key when there is no v2 entry", () => {
    const storage = memoryStorage({ [LEGACY_KEY]: JSON.stringify({ wins: 1 }) });
    assert.equal(loadSave(storage).wins, 1);
  });

  it("skips a corrupt entry instead of throwing", () => {
    const storage = memoryStorage({ [SAVE_KEY]: "{not json", [LEGACY_KEY]: JSON.stringify({ wins: 3 }) });
    assert.equal(loadSave(storage).wins, 3);
  });

  it("survives having no storage at all", () => {
    assert.deepEqual(loadSave(null), defaultSave());
    assert.equal(persistSave(null, defaultSave()), false);
  });

  it("reports a write failure instead of crashing the game", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      }
    };
    assert.equal(persistSave(throwing, defaultSave()), false);
  });

  it("round-trips through a working storage", () => {
    const storage = memoryStorage();
    const save = defaultSave();
    save.wins = 3;
    assert.equal(persistSave(storage, save), true);
    assert.equal(loadSave(storage).wins, 3);
  });
});

describe("record keeping", () => {
  it("keeps only faster act times", () => {
    const save = defaultSave();
    assert.equal(recordActTime(save, 0, 90_000), true);
    assert.equal(recordActTime(save, 0, 95_000), false);
    assert.equal(recordActTime(save, 0, 60_000), true);
    assert.equal(save.actBests[0], 60_000);
  });

  it("ignores act indices outside the campaign", () => {
    const save = defaultSave();
    assert.equal(recordActTime(save, 99, 1_000), false);
    assert.equal(recordActTime(save, -1, 1_000), false);
  });

  it("keeps only the fastest full run", () => {
    const save = defaultSave();
    assert.equal(recordRunTime(save, 300_000), true);
    assert.equal(recordRunTime(save, 400_000), false);
    assert.equal(save.bestTime, 300_000);
  });

  it("advances the furthest act monotonically and clamps to the campaign", () => {
    const save = defaultSave();
    assert.equal(unlockAct(save, 1), true);
    assert.equal(unlockAct(save, 0), false);
    assert.equal(unlockAct(save, 50), true);
    assert.equal(save.furthestAct, ACT_COUNT - 1);
  });
});
