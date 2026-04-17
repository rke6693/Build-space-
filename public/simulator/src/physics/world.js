// Rapier3D world wrapper. Fixed 480 Hz timestep, deterministic solver config.
// Rapier is loaded globally by index.html via importmap; this module assumes
// `await RAPIER.init()` has already been awaited.

import RAPIER from '@dimforge/rapier3d-compat';

export const PHYS_HZ = 480;
export const PHYS_DT = 1 / PHYS_HZ;

export async function ensureRapierReady() {
  if (!RAPIER.__inited) {
    await RAPIER.init();
    RAPIER.__inited = true;
  }
  return RAPIER;
}

export function createWorld({ gravity_mps2 = 9.81 } = {}) {
  const world = new RAPIER.World({ x: 0, y: -gravity_mps2, z: 0 });
  world.timestep = PHYS_DT;
  // Solver tuning per plan §1. These fields are writable on Rapier 0.14.
  world.integrationParameters.numSolverIterations = 8;
  world.integrationParameters.numAdditionalFrictionIterations = 4;
  world.integrationParameters.numInternalPgsIterations = 1;
  world.integrationParameters.allowedLinearError = 0.001;
  world.integrationParameters.predictionDistance = 0.002;
  return world;
}

export class FixedStepLoop {
  // Decouples render frame rate from physics rate. Accumulates wall time
  // and advances the world in whole PHYS_DT steps. Caps to avoid spiral of death.
  constructor(world) {
    this.world = world;
    this.accumulator = 0;
    this.lastWall = null;
    this.totalSteps = 0;
    this.totalSimTime = 0;
    this.maxStepsPerFrame = 32; // cap: ~67 ms of real time per frame
  }

  reset() {
    this.accumulator = 0;
    this.lastWall = null;
    this.totalSteps = 0;
    this.totalSimTime = 0;
  }

  // Call from requestAnimationFrame. Invokes onStep(stepIndex) for each fixed tick.
  advance(nowMs, onStep) {
    if (this.lastWall === null) this.lastWall = nowMs;
    const dtWall = Math.min(0.25, (nowMs - this.lastWall) / 1000);
    this.lastWall = nowMs;
    this.accumulator += dtWall;
    let steps = 0;
    while (this.accumulator >= PHYS_DT && steps < this.maxStepsPerFrame) {
      if (onStep) onStep(this.totalSteps, this.totalSimTime);
      this.world.step();
      this.totalSteps += 1;
      this.totalSimTime += PHYS_DT;
      this.accumulator -= PHYS_DT;
      steps += 1;
    }
    return steps;
  }

  // Headless batch mode: run for a fixed number of seconds with no wall-clock pacing.
  // Used by Monte Carlo worker and any determinism test.
  runForSeconds(seconds, onStep) {
    const totalSteps = Math.round(seconds * PHYS_HZ);
    for (let i = 0; i < totalSteps; i++) {
      if (onStep) onStep(this.totalSteps, this.totalSimTime);
      this.world.step();
      this.totalSteps += 1;
      this.totalSimTime += PHYS_DT;
    }
  }
}

export function disposeWorld(world) {
  // Rapier 0.14 exposes world.free() to release the WASM arena. Critical between MC trials.
  if (world && typeof world.free === 'function') world.free();
}
