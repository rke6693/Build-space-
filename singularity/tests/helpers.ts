import { generateCity } from '../src/sim/city/generate';
import { DEFAULT_SEED, baseScenario } from '../src/sim/scenario';
import type { City, Scenario } from '../src/sim/types';

let cached: City | null = null;
/** City generation is deterministic; share one instance across tests for speed. */
export function testCity(): City {
  if (!cached) cached = generateCity(DEFAULT_SEED);
  return cached;
}

export function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return baseScenario({ agents: 800, durationMin: 120, ...overrides });
}

export function allFinite(a: ArrayLike<number>): boolean {
  for (let k = 0; k < a.length; k++) if (!Number.isFinite(a[k])) return false;
  return true;
}
