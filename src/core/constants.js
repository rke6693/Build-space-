/**
 * World geometry and gameplay tuning.
 *
 * Every number the simulation reads lives here so that feel can be adjusted
 * without hunting through physics code. The simulation runs on a fixed
 * timestep, so these values are stable regardless of display refresh rate.
 */

export const WORLD = Object.freeze({
  width: 1280,
  height: 720,
  ground: 624
});

/** Fixed simulation step. The renderer runs free; the physics never does. */
export const STEP = 1 / 120;

/** Largest wall-clock slice a single frame may feed the accumulator. */
export const MAX_FRAME_DELTA = 0.25;

export const TUNING = Object.freeze({
  gravity: 1570,
  groundAcceleration: 1640,
  airAcceleration: 980,
  maxRunSpeed: 330,
  chargeMoveSpeed: 115,
  groundDrag: 10,
  airDrag: 1.4,

  /** Seconds of held squish needed to reach a full spring. */
  chargeTime: 0.9,
  /** Charge kept when the player releases instantly. */
  minCharge: 0.14,
  launchBase: 430,
  launchRange: 560,
  launchDrift: 90,
  /** A squish held in the air fires the moment the player touches down. */
  chargeBufferTime: 0.18,
  /** Grace after walking off a ledge during which a squish still counts. */
  coyoteTime: 0.11,

  stompBounce: 360,
  stompBounceCharge: 180,
  cageBreakImpact: 470,
  cageBreakCharge: 0.48,
  springBounce: 880,
  bossStompBounce: 650,

  landImpactThreshold: 260,
  invulnerableTime: 1.7,
  knockbackX: 360,
  knockbackY: -390,

  /** Seed pickups within this window keep an echo chain alive. */
  chainWindow: 3.2,
  cameraLead: 0.34,
  cameraEase: 5.2,
  fallLimit: WORLD.height + 180
});

/** Assist mode trades difficulty for reach without changing the level design. */
export const ASSIST = Object.freeze({
  hearts: 5,
  chargeTimeScale: 0.72,
  invulnerableScale: 1.45,
  bossCycleScale: 1.3,
  shockwaveSpeedScale: 0.82
});

export const HEARTS = 3;
