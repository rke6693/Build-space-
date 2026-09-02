import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clamp, createRandom, damp, formatTime, lerp, positiveMod, seeded } from "../../src/core/math.js";

describe("math helpers", () => {
  it("clamps to the inclusive range", () => {
    assert.equal(clamp(5, 0, 3), 3);
    assert.equal(clamp(-5, 0, 3), 0);
    assert.equal(clamp(2, 0, 3), 2);
  });

  it("lerps and refuses to overshoot", () => {
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(lerp(0, 10, 2), 10);
    assert.equal(lerp(0, 10, -1), 0);
  });

  it("damps toward a target without ever passing it", () => {
    let value = 0;
    for (let i = 0; i < 500; i += 1) value = damp(value, 100, 6, 1 / 60);
    assert.ok(value > 99.9 && value <= 100);
  });

  it("keeps modulo positive for negative input", () => {
    assert.equal(positiveMod(-1, 10), 9);
    assert.equal(positiveMod(11, 10), 1);
  });

  it("produces stable seeded noise inside the unit interval", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = seeded(i * 7.3);
      assert.ok(value >= 0 && value < 1, `seeded(${i}) = ${value}`);
    }
    assert.equal(seeded(12.5), seeded(12.5));
  });

  it("gives a repeatable random sequence per seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const c = createRandom(43);
    const first = Array.from({ length: 8 }, () => a());
    const second = Array.from({ length: 8 }, () => b());
    const third = Array.from({ length: 8 }, () => c());
    assert.deepEqual(first, second);
    assert.notDeepEqual(first, third);
    assert.ok(first.every((value) => value >= 0 && value < 1));
  });

  it("formats run times as minutes and padded seconds", () => {
    assert.equal(formatTime(0), "0:00");
    assert.equal(formatTime(9_000), "0:09");
    assert.equal(formatTime(65_400), "1:05");
    assert.equal(formatTime(600_000), "10:00");
    assert.equal(formatTime(-50), "0:00");
  });
});
