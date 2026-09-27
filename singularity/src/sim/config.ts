/**
 * Global simulation constants. All distances are metres, all times are simulated seconds
 * unless stated otherwise. The world is a square centred on the origin: x grows east,
 * z grows south (towards the sea), y is up.
 */
export const GRID = 128; // simulation cells per side
export const CELL = 32; // metres per cell
export const WORLD = GRID * CELL; // 4096 m
export const HALF = WORLD / 2;
export const CELL_AREA = CELL * CELL;
export const N_CELLS = GRID * GRID;

/** Fixed timestep: simulated seconds advanced per tick. */
export const STEP_SECONDS = 2;
/** Ticks per real second at 1x playback (1x = 30 simulated seconds per real second). */
export const TICKS_PER_SECOND_1X = 15;
export const SPEEDS = [0.25, 1, 2, 5, 10] as const;

/** A full-state keyframe is stored every N ticks for deterministic seek/replay. */
export const KEYFRAME_INTERVAL = 60;
export const MAX_KEYFRAMES = 140;
/** Analytics history sample cadence (ticks). */
export const METRIC_INTERVAL = 15;
/** Routing tables / accessibility refresh cadence (ticks). Must divide KEYFRAME_INTERVAL. */
export const ROUTING_INTERVAL = 15;

/** Each citizen agent stands for this many residents. */
export const PEOPLE_PER_AGENT = 100;
export const MAX_AGENTS = 5000;
export const MAX_EVENTS = 20000;
export const MAX_SIM_TICKS = 6 * 3600 / STEP_SECONDS; // hard cap: 6 simulated hours

/** Coarse weather grid (clouds / rain field). */
export const WX_GRID = 32;

export const CITY_NAME = 'Meridian Bay';

export function cellIndex(i: number, j: number): number {
  return j * GRID + i;
}
export function cellX(i: number): number {
  return -HALF + (i + 0.5) * CELL;
}
export function cellZ(j: number): number {
  return -HALF + (j + 0.5) * CELL;
}
export function worldToCell(x: number, z: number): number {
  const i = Math.min(GRID - 1, Math.max(0, Math.floor((x + HALF) / CELL)));
  const j = Math.min(GRID - 1, Math.max(0, Math.floor((z + HALF) / CELL)));
  return j * GRID + i;
}
export function cellCenter(c: number): { x: number; z: number } {
  return { x: cellX(c % GRID), z: cellZ(Math.floor(c / GRID)) };
}
