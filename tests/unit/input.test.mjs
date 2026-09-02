import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InputState, KEY_MAP } from "../../src/game/input.js";

function pad(overrides = {}) {
  return {
    connected: true,
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
    ...overrides
  };
}

describe("input state", () => {
  it("merges every source into one snapshot", () => {
    const input = new InputState();
    input.set("keyboard", "left", true);
    input.set("touch", "squish", true);
    assert.deepEqual(input.snapshot(), { left: true, right: false, squish: true });
  });

  it("reports nothing pressed while disabled", () => {
    const input = new InputState();
    input.set("keyboard", "right", true);
    input.enabled = false;
    assert.deepEqual(input.snapshot(), { left: false, right: false, squish: false });
  });

  it("clears every channel on release", () => {
    const input = new InputState();
    input.set("keyboard", "right", true);
    input.set("touch", "left", true);
    input.set("gamepad", "squish", true);
    input.releaseAll();
    assert.deepEqual(input.snapshot(), { left: false, right: false, squish: false });
  });

  it("ignores unknown channels and controls", () => {
    const input = new InputState();
    input.set("mind", "left", true);
    input.set("keyboard", "jump", true);
    assert.deepEqual(input.snapshot(), { left: false, right: false, squish: false });
  });

  it("remembers which device was used last", () => {
    const input = new InputState();
    input.set("touch", "left", true);
    assert.equal(input.lastDevice, "touch");
  });
});

describe("gamepad polling", () => {
  it("reads the stick past the deadzone but ignores drift", () => {
    const input = new InputState();
    input.pollGamepad(() => [pad({ axes: [-0.2, 0] })]);
    assert.equal(input.snapshot().left, false, "small drift must not steer");

    input.pollGamepad(() => [pad({ axes: [-0.9, 0] })]);
    assert.equal(input.snapshot().left, true);
  });

  it("accepts the d-pad and any face button", () => {
    const input = new InputState();
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[15] = { pressed: true };
    buttons[2] = { pressed: true };
    input.pollGamepad(() => [pad({ buttons })]);
    assert.deepEqual(input.snapshot(), { left: false, right: true, squish: true });
  });

  it("reports whether a pad is present and tolerates empty slots", () => {
    const input = new InputState();
    assert.equal(input.pollGamepad(() => [null, undefined]), false);
    assert.equal(input.pollGamepad(() => undefined), false);
    assert.equal(input.pollGamepad(() => [pad()]), true);
  });

  it("releases the gamepad channel when the pad goes idle", () => {
    const input = new InputState();
    input.pollGamepad(() => [pad({ axes: [1, 0] })]);
    assert.equal(input.snapshot().right, true);
    input.pollGamepad(() => []);
    assert.equal(input.snapshot().right, false);
  });
});

describe("key map", () => {
  it("claims only the movement and squish keys", () => {
    assert.deepEqual(new Set(Object.values(KEY_MAP)), new Set(["left", "right", "squish"]));
    assert.equal(KEY_MAP.KeyA, "left");
    assert.equal(KEY_MAP.Space, "squish");
    assert.equal(KEY_MAP.KeyM, undefined, "sound is handled outside the movement map");
  });
});
