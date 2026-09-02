/**
 * One input snapshot, three sources.
 *
 * Keyboard, on-screen touch controls, and a gamepad all write into separate
 * channels; `snapshot()` ORs them together. Nothing else in the game needs to
 * know which device the player is using.
 */
const GAMEPAD_SQUISH_BUTTONS = [0, 1, 2, 3, 7];
const GAMEPAD_LEFT_BUTTONS = [14];
const GAMEPAD_RIGHT_BUTTONS = [15];
const STICK_DEADZONE = 0.35;

export class InputState {
  constructor() {
    this.keyboard = { left: false, right: false, squish: false };
    this.touch = { left: false, right: false, squish: false };
    this.gamepad = { left: false, right: false, squish: false };
    this.enabled = true;
    this.lastDevice = "keyboard";
  }

  snapshot() {
    if (!this.enabled) return { left: false, right: false, squish: false };
    return {
      left: this.keyboard.left || this.touch.left || this.gamepad.left,
      right: this.keyboard.right || this.touch.right || this.gamepad.right,
      squish: this.keyboard.squish || this.touch.squish || this.gamepad.squish
    };
  }

  /** Called when focus is lost or a modal opens, so nothing sticks down. */
  releaseAll() {
    for (const channel of [this.keyboard, this.touch, this.gamepad]) {
      channel.left = false;
      channel.right = false;
      channel.squish = false;
    }
  }

  set(channel, control, value) {
    const target = this[channel];
    if (!target || !(control in target)) return;
    if (target[control] === value) return;
    target[control] = value;
    if (value) this.lastDevice = channel;
  }

  /**
   * Polls connected pads. Returns true when a pad is actually present, which
   * the shell uses to reveal the "gamepad ready" hint exactly once.
   */
  pollGamepad(getGamepads = () => navigator.getGamepads?.() ?? []) {
    const pads = getGamepads() ?? [];
    let found = false;
    let left = false;
    let right = false;
    let squish = false;

    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      found = true;
      const axis = pad.axes?.[0] ?? 0;
      if (axis < -STICK_DEADZONE) left = true;
      if (axis > STICK_DEADZONE) right = true;
      for (const index of GAMEPAD_LEFT_BUTTONS) if (pad.buttons?.[index]?.pressed) left = true;
      for (const index of GAMEPAD_RIGHT_BUTTONS) if (pad.buttons?.[index]?.pressed) right = true;
      for (const index of GAMEPAD_SQUISH_BUTTONS) if (pad.buttons?.[index]?.pressed) squish = true;
    }

    this.set("gamepad", "left", left);
    this.set("gamepad", "right", right);
    this.set("gamepad", "squish", squish);
    return found;
  }
}

/** Key codes the game claims. Everything else stays available to the browser. */
export const KEY_MAP = Object.freeze({
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  Space: "squish"
});
