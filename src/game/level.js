import { ASSIST, HEARTS, TUNING, WORLD } from "../core/constants.js";
import { levelDef } from "../data/levels.js";

const TAU = Math.PI * 2;

/**
 * Movers ride a sine so their position is a pure function of the level clock.
 * That makes them deterministic across pauses, restarts, and replays, and it
 * lets the carry logic derive velocity from two sampled positions instead of
 * integrating a second time.
 */
export function moverAt(mover, time) {
  const half = mover.range / 2;
  const rate = half === 0 ? 0 : mover.speed / half;
  const offset = Math.sin(time * rate + mover.phase * TAU) * half;
  return mover.axis === "y"
    ? { x: mover.originX, y: mover.originY + offset }
    : { x: mover.originX + offset, y: mover.originY };
}

export function syncMover(mover, time) {
  const next = moverAt(mover, time);
  mover.previousX = mover.x;
  mover.previousY = mover.y;
  mover.x = next.x;
  mover.y = next.y;
  return mover;
}

export function createBoss({ assist = false } = {}) {
  return {
    x: 950,
    y: WORLD.ground,
    w: 268,
    h: 274,
    hp: 6,
    maxHp: 6,
    phase: 1,
    state: "idle",
    timer: assist ? 2.3 : 1.8,
    exposed: false,
    hitThisOpening: false,
    defeated: false,
    defeatTimer: 0,
    slamCount: 0,
    bob: 0
  };
}

export function createPlayer(x = 150, { assist = false } = {}) {
  return {
    x,
    y: WORLD.ground,
    previousBottom: WORLD.ground,
    vx: 0,
    vy: 0,
    baseW: 76,
    baseH: 92,
    grounded: true,
    groundMoverId: null,
    coyote: 0,
    chargeBuffer: 0,
    charging: false,
    charge: 0,
    lastLaunchCharge: 0,
    facing: 1,
    hearts: assist ? ASSIST.hearts : HEARTS,
    maxHearts: assist ? ASSIST.hearts : HEARTS,
    invulnerable: 0,
    checkpointX: x,
    checkpointY: WORLD.ground,
    landPulse: 0,
    stepPhase: 0
  };
}

export function createLevel(index, { assist = false } = {}) {
  const def = levelDef(index);
  const level = {
    ...def,
    index,
    clock: 0,
    platforms: def.platforms.map(([x, y, w, h]) => ({ x, y, w, h })),
    movers: (def.movers ?? []).map(([x, y, w, h, axis, range, speed, phase], id) => ({
      id,
      originX: x,
      originY: y,
      x,
      y,
      previousX: x,
      previousY: y,
      w,
      h,
      axis: axis === "y" ? "y" : "x",
      range,
      speed,
      phase: phase ?? 0
    })),
    springs: (def.springs ?? []).map(([x, y], id) => ({ id, x, y, w: 92, compression: 0, cooldown: 0 })),
    seeds: def.seeds.map(([x, y], id) => ({ id, x, y, radius: 17, collected: false, phase: id * 0.73 })),
    enemies: def.enemies.map(([x, y, minX, maxX], id) => ({
      id,
      type: "needler",
      x,
      y,
      minX,
      maxX,
      w: 68,
      h: 62,
      speed: 52 + (id % 3) * 9,
      direction: id % 2 ? -1 : 1,
      defeated: false,
      seen: false,
      squash: 0
    })),
    drifters: (def.drifters ?? []).map(([x, y, minX, maxX, amplitude, bobSpeed], id) => ({
      id,
      type: "drifter",
      x,
      y,
      baseY: y,
      minX,
      maxX,
      amplitude,
      bobSpeed,
      w: 74,
      h: 66,
      speed: 44 + (id % 3) * 7,
      direction: id % 2 ? -1 : 1,
      phase: id * 1.31,
      defeated: false,
      seen: false,
      squash: 0
    })),
    hazards: def.hazards.map(([x, w]) => ({ x, w, y: WORLD.ground })),
    cages: (def.cages ?? []).map(([x, y], id) => ({ id, x, y, w: 92, h: 104, rescued: false, hit: 0 })),
    exit: { x: def.width - 145, y: WORLD.ground, lockedPulse: 0 },
    collected: 0,
    rescued: 0,
    bossEntity: def.boss ? createBoss({ assist }) : null,
    completed: false
  };

  for (const mover of level.movers) syncMover(mover, 0);
  return level;
}

/** Every surface the player can stand on, in one list, for the sweep test. */
export function solidSurfaces(level) {
  const surfaces = [{ y: WORLD.ground, left: -Infinity, right: Infinity, moverId: null }];
  for (const platform of level.platforms) {
    surfaces.push({ y: platform.y, left: platform.x, right: platform.x + platform.w, moverId: null });
  }
  for (const mover of level.movers) {
    surfaces.push({ y: mover.y, left: mover.x, right: mover.x + mover.w, moverId: mover.id });
  }
  return surfaces;
}

export function isGoalComplete(level) {
  return level.collected >= level.seedGoal && level.rescued >= level.rescueGoal;
}

export function chargeTime(assist) {
  return assist ? TUNING.chargeTime * ASSIST.chargeTimeScale : TUNING.chargeTime;
}
