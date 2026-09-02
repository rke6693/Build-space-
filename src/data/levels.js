import { WORLD } from "../core/constants.js";

/**
 * Level geometry, authored as flat tuples so the data stays readable and
 * diffable. `createLevel` in `src/game/level.js` inflates these into the
 * mutable objects the simulation walks.
 *
 * Tuple shapes
 *   platforms  [x, y, width, height]
 *   movers     [x, y, width, height, axis, range, speed, phase]
 *   springs    [x, y]
 *   seeds      [x, y]
 *   enemies    [x, y, minX, maxX]            — ground-walking Needlers
 *   drifters   [x, y, minX, maxX, amplitude, bobSpeed]
 *   hazards    [x, width]
 *   cages      [x, y]
 */
export const LEVEL_DEFS = Object.freeze([
  {
    id: "lantern-run",
    act: "ACT I",
    name: "LANTERN RUN",
    subtitle: "The flooded approach",
    width: 4720,
    seedGoal: 8,
    rescueGoal: 0,
    objective: "Gather 8 Echo Seeds, then reach the coral beacon",
    intro: "Rain has stopped. The lanterns still remember the tune.",
    spawnX: 150,
    platforms: [
      [420, 520, 280, 26], [870, 458, 230, 26], [1230, 530, 310, 26],
      [1710, 432, 250, 26], [2110, 505, 300, 26], [2590, 418, 260, 26],
      [3030, 520, 340, 26], [3540, 445, 250, 26], [3960, 508, 300, 26]
    ],
    movers: [
      [1580, 476, 150, 24, "x", 250, 64, 0],
      [2880, 430, 140, 24, "y", 138, 52, 0.4]
    ],
    springs: [[1006, WORLD.ground], [3286, WORLD.ground]],
    seeds: [
      [330, 556], [545, 468], [945, 405], [1320, 477], [1620, 330], [1805, 378],
      [2200, 452], [2695, 365], [2950, 300], [3140, 468], [3650, 392],
      [4070, 455], [4350, 548]
    ],
    enemies: [
      [760, WORLD.ground, 610, 910], [1510, WORLD.ground, 1350, 1690],
      [2360, WORLD.ground, 2240, 2510], [2910, WORLD.ground, 2800, 3140],
      [3810, WORLD.ground, 3690, 4050]
    ],
    drifters: [
      [2450, 410, 2330, 2650, 46, 1],
      [3700, 388, 3580, 3900, 38, 1.15]
    ],
    hazards: [[1080, 130], [1965, 120], [3360, 140], [4200, 110]],
    checkpoints: [120, 1450, 2780, 3930]
  },
  {
    id: "root-vault",
    act: "ACT II",
    name: "ROOT VAULT",
    subtitle: "Under the shelves",
    width: 5260,
    seedGoal: 10,
    rescueGoal: 3,
    objective: "Break 3 amber locks and gather 10 Echo Seeds",
    intro: "Three Plinks are tapping under the roots. They have not stopped.",
    spawnX: 140,
    platforms: [
      [390, 492, 320, 28], [850, 420, 260, 28], [1260, 510, 300, 28],
      [1640, 394, 270, 28], [2090, 492, 360, 28], [2640, 430, 250, 28],
      [3020, 528, 300, 28], [3440, 405, 300, 28], [3910, 485, 250, 28],
      [4310, 390, 260, 28], [4690, 500, 310, 28]
    ],
    movers: [
      [1490, 470, 150, 26, "x", 240, 72, 0],
      [3690, 420, 150, 26, "y", 168, 60, 0.25],
      [4900, 452, 140, 26, "x", 200, 58, 0.6]
    ],
    springs: [[1980, WORLD.ground], [4060, WORLD.ground]],
    seeds: [
      [280, 548], [500, 440], [940, 368], [1350, 458], [1560, 320], [1740, 342],
      [2240, 440], [2750, 378], [3130, 475], [3550, 350], [3760, 296],
      [4015, 432], [4410, 338], [4820, 448], [5070, 548]
    ],
    enemies: [
      [720, WORLD.ground, 610, 820], [1220, WORLD.ground, 1200, 1400],
      [1840, WORLD.ground, 1780, 1890], [2490, WORLD.ground, 2400, 2700],
      [3330, WORLD.ground, 3200, 3470], [3790, WORLD.ground, 3660, 3960],
      [4640, WORLD.ground, 4560, 4800]
    ],
    drifters: [
      [1800, 418, 1690, 2010, 40, 1.1],
      [3300, 386, 3180, 3520, 55, 0.9],
      [4600, 428, 4480, 4830, 45, 1.2]
    ],
    hazards: [[720, 110], [1460, 120], [2380, 120], [3210, 110], [4130, 120], [4920, 110]],
    cages: [[1100, WORLD.ground], [2860, WORLD.ground], [4470, WORLD.ground]],
    checkpoints: [120, 1370, 2680, 4060]
  },
  {
    id: "pressure-chamber",
    act: "ACT III",
    name: "PRESSURE CHAMBER",
    subtitle: "One permanent shape",
    width: 1280,
    seedGoal: 0,
    rescueGoal: 0,
    objective: "Jump the shockwaves. Strike the coral eye when it opens.",
    intro: "It has been holding this room still for a very long time.",
    spawnX: 160,
    boss: true,
    platforms: [[430, 500, 180, 24], [760, 452, 170, 24]],
    movers: [],
    springs: [[248, WORLD.ground], [640, WORLD.ground]],
    seeds: [],
    enemies: [],
    drifters: [],
    hazards: [],
    checkpoints: [140]
  }
]);

export const ACT_COUNT = LEVEL_DEFS.length;

export function levelDef(index) {
  return LEVEL_DEFS[Math.min(Math.max(0, index | 0), LEVEL_DEFS.length - 1)];
}
