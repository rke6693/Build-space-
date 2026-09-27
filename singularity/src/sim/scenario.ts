import { MAX_AGENTS, MAX_SIM_TICKS, STEP_SECONDS } from './config';
import { clamp } from './math';
import type { Bookmark, Command, CommandSpec, EconomicSettings, EnvBase, ResilienceSettings, Scenario } from './types';

export const DEFAULT_SEED = 20260927;
export const SCENARIO_VERSION = 1;

export const minutesToTicks = (min: number): number => Math.round((min * 60) / STEP_SECONDS);
export const ticksToMinutes = (ticks: number): number => (ticks * STEP_SECONDS) / 60;

export const DEFAULT_ENV: EnvBase = {
  rainfall: 1.5,
  windSpeed: 6,
  windDir: 225,
  temperature: 17,
  seaLevel: 0,
  soilSaturation: 0.45,
};

export const DEFAULT_RESILIENCE: ResilienceSettings = {
  leveeRaise: 0,
  substationRetrofit: false,
  backupHoursScale: 1,
  pumpCapacityScale: 1,
  buildingRetrofit: false,
  crewsPerStation: 2,
  autoEvacuation: true,
  aftershocks: true,
};

export const DEFAULT_ECONOMICS: EconomicSettings = {
  costScale: 1,
  contentsRatio: 0.5,
  businessInterruptionPerHour: 0.0005,
  infraCostScale: 1,
};

/** Parameter ranges shared by the validator and the UI controls. */
export const ENV_RANGES: Record<keyof EnvBase, [number, number]> = {
  rainfall: [0, 200],
  windSpeed: [0, 80],
  windDir: [0, 360],
  temperature: [-20, 50],
  seaLevel: [-1, 4],
  soilSaturation: [0, 1],
};

let uid = 0;
export function newScenarioId(prefix = 'scn'): string {
  uid = (uid + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${uid.toString(36)}`;
}

export function baseScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    version: 1,
    id: 'baseline',
    name: 'Evening in Meridian Bay',
    description: 'A calm autumn evening with light drizzle. Nothing is scheduled: use the disaster toolbox to intervene.',
    seed: DEFAULT_SEED,
    agents: 2400,
    startHour: 17.7,
    durationMin: 150,
    env: { ...DEFAULT_ENV },
    resilience: { ...DEFAULT_RESILIENCE },
    economics: { ...DEFAULT_ECONOMICS },
    commands: [],
    bookmarks: [],
    ...overrides,
  };
}

const cmd = (id: number, minute: number, spec: CommandSpec): Command => ({ id, tick: minutesToTicks(minute), source: 'scenario', spec });

/** Asset ids are assigned in a fixed order by the generator (see tests/city.test.ts). */
export const PUMP_CENTRAL_ID = 14;

export const SHOWCASE_QUAKE: CommandSpec = { kind: 'earthquake', x: 900, z: 5600, magnitude: 6.9, depthKm: 13, aftershocks: true };

export function builtinScenarios(): Scenario[] {
  return [
    baseScenario({ builtin: true }),
    baseScenario({
      id: 'showcase',
      builtin: true,
      name: 'Showcase — Harbor Quake Cascade',
      description:
        'An autumn storm is rolling in when an M6.9 offshore earthquake strikes. Watch substation damage cut power to the Eastport polder, pumps run down their diesel reserves, flood water rise, and fires spread through Old Town.',
      env: { ...DEFAULT_ENV, rainfall: 6, windSpeed: 9, windDir: 215, soilSaturation: 0.7 },
      durationMin: 180,
      commands: [
        cmd(1, 0, { kind: 'storm', category: 1, dirDeg: 215, durationMin: 180, lightning: true }),
        cmd(2, 3, SHOWCASE_QUAKE),
      ],
      bookmarks: [{ tick: minutesToTicks(3), label: 'Mainshock' }],
    }),
    baseScenario({
      id: 'hurricane',
      builtin: true,
      name: 'Hurricane Landfall (Cat 4)',
      description: 'A major hurricane makes landfall near high tide. Storm surge tests the Eastport seawall while winds bring down power lines.',
      env: { ...DEFAULT_ENV, rainfall: 8, windSpeed: 14, windDir: 170, soilSaturation: 0.8, temperature: 24 },
      startHour: 15.5,
      durationMin: 180,
      commands: [cmd(1, 0, { kind: 'storm', category: 4, dirDeg: 170, durationMin: 170, lightning: true })],
    }),
    baseScenario({
      id: 'firestorm',
      builtin: true,
      name: 'Urban Firestorm',
      description: 'A hot, dry offshore wind event. Several ignitions in Old Town and the Westhill forest edge test the fire service.',
      env: { rainfall: 0, windSpeed: 17, windDir: 40, temperature: 36, seaLevel: 0, soilSaturation: 0.08 },
      startHour: 14,
      durationMin: 150,
      commands: [
        cmd(1, 1, { kind: 'fire', x: -300, z: 120, radius: 1 }),
        cmd(2, 6, { kind: 'fire', x: -1350, z: -1500, radius: 2 }),
        cmd(3, 14, { kind: 'fire', x: 250, z: -600, radius: 1 }),
      ],
    }),
    baseScenario({
      id: 'monsoon',
      builtin: true,
      name: 'Monsoon River Flood',
      description: 'Two hours of extreme rainfall, a river flood wave, and a pump station failure inside the polder.',
      env: { ...DEFAULT_ENV, rainfall: 12, windSpeed: 10, windDir: 200, soilSaturation: 0.9, temperature: 22 },
      startHour: 11,
      durationMin: 180,
      commands: [
        cmd(1, 0, { kind: 'rain', rate: 65, durationMin: 120 }),
        cmd(2, 10, { kind: 'river_flood', peak: 950, durationMin: 150 }),
        cmd(3, 35, { kind: 'asset', assetId: PUMP_CENTRAL_ID, action: 'damage' }),
      ],
    }),
    baseScenario({
      id: 'mitigated',
      builtin: true,
      name: 'Showcase (mitigated city)',
      description: 'Identical hazards to the showcase, but with retrofitted substations and masonry, 6 h pump fuel and a 1 m higher seawall. Use it in Compare.',
      env: { ...DEFAULT_ENV, rainfall: 6, windSpeed: 9, windDir: 215, soilSaturation: 0.7 },
      resilience: { ...DEFAULT_RESILIENCE, substationRetrofit: true, buildingRetrofit: true, backupHoursScale: 4, leveeRaise: 1 },
      durationMin: 180,
      commands: [
        cmd(1, 0, { kind: 'storm', category: 1, dirDeg: 215, durationMin: 180, lightning: true }),
        cmd(2, 3, SHOWCASE_QUAKE),
      ],
    }),
  ];
}

// ------------------------------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number, dflt: number, errors: string[], path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    if (v !== undefined) errors.push(`${path}: expected a finite number`);
    return dflt;
  }
  if (v < lo || v > hi) errors.push(`${path}: ${v} clamped to [${lo}, ${hi}]`);
  return clamp(v, lo, hi);
};
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
const str = (v: unknown, dflt: string, max = 400): string => (typeof v === 'string' ? v.slice(0, max) : dflt);

export function validateCommandSpec(v: unknown, errors: string[], path: string): CommandSpec | null {
  if (!isObj(v) || typeof v.kind !== 'string') {
    errors.push(`${path}: missing command kind`);
    return null;
  }
  const n = (k: string, lo: number, hi: number, d: number) => num(v[k], lo, hi, d, errors, `${path}.${k}`);
  switch (v.kind) {
    case 'earthquake':
      return {
        kind: 'earthquake',
        x: n('x', -12000, 12000, 0),
        z: n('z', -12000, 12000, 0),
        magnitude: n('magnitude', 3, 9, 6.5),
        depthKm: n('depthKm', 1, 60, 10),
        ...(typeof v.durationS === 'number' ? { durationS: n('durationS', 3, 180, 20) } : {}),
        aftershocks: bool(v.aftershocks, true),
      };
    case 'rain':
      return { kind: 'rain', rate: n('rate', 0, 300, 40), durationMin: n('durationMin', 1, 360, 60) };
    case 'surge':
      return { kind: 'surge', height: n('height', 0, 8, 2), durationMin: n('durationMin', 5, 360, 90) };
    case 'levee_breach':
      return { kind: 'levee_breach', segment: Math.round(n('segment', 0, 16, 0)), width: Math.round(n('width', 1, 8, 2)) };
    case 'river_flood':
      return { kind: 'river_flood', peak: n('peak', 0, 5000, 800), durationMin: n('durationMin', 10, 360, 120) };
    case 'fire':
      return { kind: 'fire', x: n('x', -2100, 2100, 0), z: n('z', -2100, 2100, 0), radius: Math.round(n('radius', 0, 4, 1)) };
    case 'storm':
      return {
        kind: 'storm',
        category: Math.round(n('category', 0, 5, 1)),
        dirDeg: n('dirDeg', 0, 360, 200),
        durationMin: n('durationMin', 10, 360, 120),
        lightning: bool(v.lightning, true),
      };
    case 'asset': {
      const action = v.action === 'trip' || v.action === 'restore' ? v.action : 'damage';
      return { kind: 'asset', assetId: Math.round(n('assetId', -1, 10000, 0)), action };
    }
    case 'line': {
      const action = v.action === 'restore' ? 'restore' : 'damage';
      return { kind: 'line', lineId: Math.round(n('lineId', 0, 10000, 0)), action };
    }
    case 'evacuate':
      return { kind: 'evacuate', x: n('x', -2100, 2100, 0), z: n('z', -2100, 2100, 0), radius: n('radius', 50, 3000, 600) };
    case 'env': {
      const e = isObj(v.env) ? v.env : {};
      const env: Partial<EnvBase> = {};
      for (const key of Object.keys(ENV_RANGES) as (keyof EnvBase)[]) {
        if (e[key] !== undefined) env[key] = num(e[key], ENV_RANGES[key][0], ENV_RANGES[key][1], 0, errors, `${path}.env.${key}`);
      }
      return { kind: 'env', env };
    }
    default:
      errors.push(`${path}: unknown command kind "${String(v.kind)}"`);
      return null;
  }
}

export interface ValidationResult {
  scenario: Scenario | null;
  errors: string[];
}

export function validateScenario(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { scenario: null, errors: ['Scenario must be a JSON object'] };
  if (input.version !== undefined && input.version !== SCENARIO_VERSION) {
    errors.push(`Unsupported scenario version ${String(input.version)}; attempting to read as v${SCENARIO_VERSION}`);
  }
  const base = baseScenario();
  const envIn = isObj(input.env) ? input.env : {};
  const env = { ...base.env };
  for (const key of Object.keys(ENV_RANGES) as (keyof EnvBase)[]) {
    env[key] = num(envIn[key], ENV_RANGES[key][0], ENV_RANGES[key][1], base.env[key], errors, `env.${key}`);
  }
  const rIn = isObj(input.resilience) ? input.resilience : {};
  const resilience: ResilienceSettings = {
    leveeRaise: num(rIn.leveeRaise, -2, 4, 0, errors, 'resilience.leveeRaise'),
    substationRetrofit: bool(rIn.substationRetrofit, false),
    backupHoursScale: num(rIn.backupHoursScale, 0, 20, 1, errors, 'resilience.backupHoursScale'),
    pumpCapacityScale: num(rIn.pumpCapacityScale, 0, 5, 1, errors, 'resilience.pumpCapacityScale'),
    buildingRetrofit: bool(rIn.buildingRetrofit, false),
    crewsPerStation: Math.round(num(rIn.crewsPerStation, 0, 4, 2, errors, 'resilience.crewsPerStation')),
    autoEvacuation: bool(rIn.autoEvacuation, true),
    aftershocks: bool(rIn.aftershocks, true),
  };
  const eIn = isObj(input.economics) ? input.economics : {};
  const economics: EconomicSettings = {
    costScale: num(eIn.costScale, 0, 10, 1, errors, 'economics.costScale'),
    contentsRatio: num(eIn.contentsRatio, 0, 2, 0.5, errors, 'economics.contentsRatio'),
    businessInterruptionPerHour: num(eIn.businessInterruptionPerHour, 0, 0.05, 0.0005, errors, 'economics.businessInterruptionPerHour'),
    infraCostScale: num(eIn.infraCostScale, 0, 10, 1, errors, 'economics.infraCostScale'),
  };
  const durationMin = num(input.durationMin, 5, (MAX_SIM_TICKS * STEP_SECONDS) / 60, base.durationMin, errors, 'durationMin');
  const maxTick = minutesToTicks(durationMin);
  const commands: Command[] = [];
  if (Array.isArray(input.commands)) {
    input.commands.slice(0, 500).forEach((c, k) => {
      if (!isObj(c)) {
        errors.push(`commands[${k}]: not an object`);
        return;
      }
      const spec = validateCommandSpec(c.spec, errors, `commands[${k}].spec`);
      if (!spec) return;
      const tick = Math.round(num(c.tick, 0, maxTick, 0, errors, `commands[${k}].tick`));
      commands.push({ id: commands.length + 1, tick, source: 'scenario', spec });
    });
  } else if (input.commands !== undefined) errors.push('commands: expected an array');
  commands.sort((a, b) => a.tick - b.tick || a.id - b.id);
  commands.forEach((c, k) => (c.id = k + 1));
  const bookmarks: Bookmark[] = [];
  if (Array.isArray(input.bookmarks)) {
    for (const b of input.bookmarks.slice(0, 100)) {
      if (isObj(b) && typeof b.tick === 'number' && Number.isFinite(b.tick)) bookmarks.push({ tick: clamp(Math.round(b.tick), 0, maxTick), label: str(b.label, 'Bookmark', 60) });
    }
  }
  const seedRaw = typeof input.seed === 'number' && Number.isFinite(input.seed) ? input.seed : base.seed;
  const scenario: Scenario = {
    version: 1,
    id: str(input.id, newScenarioId(), 80) || newScenarioId(),
    name: str(input.name, 'Untitled scenario', 80) || 'Untitled scenario',
    description: str(input.description, '', 600),
    seed: Math.abs(Math.floor(seedRaw)) % 2147483647,
    agents: Math.round(num(input.agents, 100, MAX_AGENTS, base.agents, errors, 'agents')),
    startHour: num(input.startHour, 0, 23.99, base.startHour, errors, 'startHour'),
    durationMin,
    env,
    resilience,
    economics,
    commands,
    bookmarks,
  };
  return { scenario, errors };
}

export function serializeScenario(s: Scenario): string {
  const { builtin: _builtin, ...rest } = s;
  void _builtin;
  return JSON.stringify(rest, null, 2);
}

export function parseScenario(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { scenario: null, errors: [`Invalid JSON: ${(e as Error).message}`] };
  }
  return validateScenario(data);
}

export function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}

export function describeCommand(spec: CommandSpec, assetName?: (id: number) => string): string {
  switch (spec.kind) {
    case 'earthquake':
      return `M${spec.magnitude.toFixed(1)} earthquake, ${spec.depthKm.toFixed(0)} km deep${spec.aftershocks ? ' + aftershocks' : ''}`;
    case 'rain':
      return `Rain burst ${spec.rate.toFixed(0)} mm/h for ${spec.durationMin.toFixed(0)} min`;
    case 'surge':
      return `Storm surge +${spec.height.toFixed(1)} m for ${spec.durationMin.toFixed(0)} min`;
    case 'levee_breach':
      return `Levee breach (segment ${spec.segment + 1}, ${spec.width * 32} m)`;
    case 'river_flood':
      return `River flood wave ${spec.peak.toFixed(0)} m³/s`;
    case 'fire':
      return `Ignition (${spec.radius * 2 + 1}×${spec.radius * 2 + 1} cells)`;
    case 'storm':
      return `${spec.category === 0 ? 'Tropical storm' : `Category ${spec.category} storm`}, ${spec.durationMin.toFixed(0)} min${spec.lightning ? ', lightning' : ''}`;
    case 'asset':
      return `${spec.action === 'damage' ? 'Fail' : spec.action === 'trip' ? 'Trip' : 'Restore'} ${assetName ? assetName(spec.assetId) : `asset #${spec.assetId}`}`;
    case 'line':
      return `${spec.action === 'damage' ? 'Fail' : 'Restore'} power line #${spec.lineId}`;
    case 'evacuate':
      return `Evacuation order, ${spec.radius.toFixed(0)} m radius`;
    case 'env':
      return `Conditions: ${Object.entries(spec.env)
        .map(([k, v]) => `${k} ${typeof v === 'number' ? v.toFixed(1) : v}`)
        .join(', ')}`;
  }
}
