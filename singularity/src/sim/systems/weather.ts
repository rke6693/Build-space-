import { HALF, STEP_SECONDS, WORLD, WX_GRID } from '../config';
import { cellOfXZ } from '../derived';
import { clamp, fragility, hashUnit, smoothstep } from '../math';
import { damageState } from './earthquake';
import { SClass } from '../types';
import type { Simulation } from '../engine';
import type { EnvBase } from '../types';

const TIDE_PERIOD = 44712; // s (M2 semidiurnal constituent)
export const TIDE_AMPLITUDE = 0.45;

/** Unit wind vector pointing where the wind blows TO (meteorological "from" direction in degrees). */
export function windVector(dirFromDeg: number): [number, number] {
  const th = (dirFromDeg * Math.PI) / 180;
  return [-Math.sin(th), Math.cos(th)];
}

export function tideAt(t: number): number {
  return TIDE_AMPLITUDE * Math.sin((2 * Math.PI * t) / TIDE_PERIOD + 0.9);
}

/** Trapezoidal intensity profile: 25 % ramp up, 50 % plateau, 25 % ramp down. */
export function stormProfile(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed > duration || duration <= 0) return 0;
  const u = elapsed / duration;
  if (u < 0.25) return smoothstep(0, 0.25, u);
  if (u > 0.75) return 1 - smoothstep(0.75, 1, u);
  return 1;
}

/** Short-ramp profile for rain bursts, surges and river flood waves. */
export function pulseProfile(elapsed: number, duration: number): number {
  if (elapsed < 0 || elapsed > duration || duration <= 0) return 0;
  const ramp = Math.min(600, duration * 0.2);
  return Math.min(smoothstep(0, ramp, elapsed), 1 - smoothstep(duration - ramp, duration, elapsed));
}

export function stormParams(category: number) {
  const c = clamp(category, 0, 5);
  return {
    rainPeak: 20 + 15 * c, // mm/h
    windPeak: 12 + 7 * c, // m/s sustained over land (1-min mean, reduced by urban roughness)
    surgePeak: 0.4 + 0.85 * c, // m
  };
}

export function updateWeather(sim: Simulation) {
  const s = sim.s;
  const dt = STEP_SECONDS;
  const t = s.tick * dt;
  const env: EnvBase = s.env;

  let rain = env.rainfall;
  let [wx, wz] = windVector(env.windDir);
  wx *= env.windSpeed;
  wz *= env.windSpeed;
  let surge = 0;
  let stormI = 0;
  let lightningRate = 0;
  let riverExtra = 0;

  for (let k = s.storms.length - 1; k >= 0; k--) {
    const st = s.storms[k];
    const el = t - st.startTick * dt;
    if (el > st.duration) {
      s.storms.splice(k, 1);
      continue;
    }
    const p = stormProfile(el, st.duration);
    if (p <= 0) continue;
    rain += st.rainPeak * p;
    // The storm's circulation replaces the ambient wind as it arrives.
    const [ux, uz] = windVector(st.dirDeg);
    wx = wx * (1 - p) + ux * st.windPeak * p;
    wz = wz * (1 - p) + uz * st.windPeak * p;
    surge += st.surgePeak * p;
    stormI = Math.max(stormI, p * (0.35 + 0.13 * st.category));
    lightningRate += st.lightning * p * (0.12 + 0.18 * st.category); // CG strikes/min over ~17 km²
  }
  for (let k = s.pulses.length - 1; k >= 0; k--) {
    const pu = s.pulses[k];
    const el = t - pu.startTick * dt;
    if (el > pu.duration) {
      s.pulses.splice(k, 1);
      continue;
    }
    const p = pulseProfile(el, pu.duration);
    if (pu.kind === 'rain') rain += pu.peak * p;
    else if (pu.kind === 'surge') surge += pu.peak * p;
    else riverExtra += pu.peak * p;
  }
  if (rain > 30) lightningRate += (rain - 30) * 0.004;

  const windSpeed = Math.hypot(wx, wz);
  const windDir = windSpeed > 1e-3 ? ((Math.atan2(-wx, wz) * 180) / Math.PI + 360) % 360 : env.windDir;
  const gustNoise = sim.noise.noise2(t / 90, 17.3);
  const gust = windSpeed * (1.25 + 0.12 * stormI + 0.1 * gustNoise);
  const tide = tideAt(t);
  const seaSurface = env.seaLevel + tide + surge;

  // River discharge responds to basin rainfall with a lag (linear reservoir, tau = 45 min).
  const target = 70 + rain * 3.2 + riverExtra;
  s.riverQ += (target - s.riverQ) * Math.min(1, dt / 2700);
  if (riverExtra > 0) s.riverQ = Math.max(s.riverQ, 70 + riverExtra * 0.9);

  // Clouds: seeded fbm advected by the wind (deterministic function of state).
  s.cloudOX += wx * dt * 0.6;
  s.cloudOZ += wz * dt * 0.6;
  const cover = clamp(0.18 + rain / 45 + stormI * 0.55, 0, 0.97);
  let cloudSum = 0;
  if (s.tick % 5 === 0 || s.tick === 0) {
    const cellW = WORLD / WX_GRID;
    for (let j = 0; j < WX_GRID; j++) {
      for (let i = 0; i < WX_GRID; i++) {
        const x = -HALF + (i + 0.5) * cellW - s.cloudOX;
        const z = -HALF + (j + 0.5) * cellW - s.cloudOZ;
        const n = 0.5 + 0.5 * sim.noise.fbm3(x / 2200, z / 2200, t / 5400, 4);
        const v = smoothstep(1 - cover - 0.18, 1 - cover + 0.25, n);
        s.clouds[j * WX_GRID + i] = v;
      }
    }
  }
  for (let k = 0; k < s.clouds.length; k++) cloudSum += s.clouds[k];
  const cloudCover = cloudSum / s.clouds.length;

  // Fuel moisture: wetted by rain, dried by warmth and wind.
  const dryRate = (0.00002 + Math.max(0, env.temperature) * 0.0000025) * (1 + windSpeed * 0.03);
  for (let k = 0; k < s.wetness.length; k++) {
    const localRain = rain * (0.35 + 1.3 * s.clouds[k]);
    let w = s.wetness[k] + localRain * 0.000025 * dt - dryRate * dt;
    w = clamp(w, env.soilSaturation * 0.3, 1);
    s.wetness[k] = w;
  }

  const smokeMean = sim.smokeMean;
  const visibilityKm = clamp(24 / (1 + rain / 9 + stormI * 2.5 + smokeMean * 3), 0.15, 24);

  const eff = s.eff;
  eff.rainfall = rain;
  eff.windSpeed = windSpeed;
  eff.windDir = windDir;
  eff.temperature = env.temperature - 3.5 * stormI;
  eff.seaLevel = env.seaLevel;
  eff.soilSaturation = env.soilSaturation;
  eff.surge = surge;
  eff.tide = tide;
  eff.seaSurface = seaSurface;
  eff.riverQ = s.riverQ;
  eff.visibilityKm = visibilityKm;
  eff.stormIntensity = stormI;
  eff.lightningRate = lightningRate;
  eff.cloudCover = cloudCover;
  eff.windX = wx;
  eff.windZ = wz;
  eff.gust = gust;
  eff.timeOfDay = (sim.scenario.startHour + t / 3600) % 24;

  // Lightning.
  if (lightningRate > 0) {
    const n = sim.rng.weather.poisson((lightningRate * dt) / 60);
    for (let k = 0; k < n && k < 6; k++) strike(sim);
  }
  // Keep only recent strikes for rendering.
  if (s.strikes.length > 24) s.strikes.splice(0, s.strikes.length - 24);

  updateWindDamage(sim);
}

/** Lognormal wind fragility medians (3-s gust, m/s) for slight/moderate/extensive/complete damage. */
const WIND_FRAGILITY: Record<number, [number, number, number, number]> = {
  [SClass.WoodFrame]: [36, 46, 58, 72],
  [SClass.SteelLight]: [38, 48, 60, 76],
  [SClass.URM]: [42, 55, 68, 86],
  [SClass.RCPreCode]: [50, 65, 80, 100],
  [SClass.RCModern]: [55, 72, 90, 110],
  [SClass.SteelFrame]: [55, 72, 90, 112],
  [SClass.BaseIsolated]: [60, 78, 96, 120],
};

function updateWindDamage(sim: Simulation) {
  const s = sim.s;
  const gust = s.eff.gust;
  const stormEvent = s.storms.length ? s.storms[0].eventId : -1;
  if (gust > 30 && gust > s.windPeak + 0.5) {
    s.windPeak = gust;
    const seed = sim.scenario.seed;
    const b = sim.city.buildings;
    for (let k = 0; k < b.count; k++) {
      if (s.bDS[k] >= 4 || b.asset[k] >= 0) continue;
      const exposure = (0.82 + 0.3 * hashUnit(seed, k, 77)) * (1 + Math.min(0.25, b.h[k] / 400));
      const ds = damageState(gust * exposure, WIND_FRAGILITY[b.sclass[k]], 0.18, hashUnit(seed, k, 78));
      if (ds > s.bDS[k]) {
        if (ds >= 2 && s.bDS[k] < 2) s.windDamagePending++;
        sim.setBuildingDS(k, ds, stormEvent, true);
      }
    }
    for (const l of sim.city.lines) {
      if (s.lDamaged[l.id]) continue;
      if (hashUnit(seed, 400000 + l.id, 1) < fragility(gust, l.windRating, 0.12)) {
        s.lDamaged[l.id] = 1;
        s.lEvent[l.id] = sim.emit({
          type: 'line_failure',
          category: 'power',
          severity: 2,
          title: `${l.name} blown down`,
          detail: `Gust ${gust.toFixed(0)} m/s vs design rating ${l.windRating} m/s.`,
          x: (l.points[0] + l.points[l.points.length - 2]) / 2,
          z: (l.points[1] + l.points[l.points.length - 1]) / 2,
          causes: stormEvent >= 0 ? [stormEvent] : [],
          subject: { kind: 'line', id: l.id },
          radius: 900,
        });
      }
    }
    for (const id of sim.d.assetsByKind.tower) {
      if (s.aDS[id] >= 3) continue;
      if (hashUnit(seed, 500000 + id, 1) < fragility(gust, 60, 0.12)) sim.setAssetDS(id, 3, stormEvent);
    }
  }
  if (s.windDamagePending >= 10 && s.tick % 150 === 0) {
    sim.emit({
      type: 'building_damage',
      category: 'weather',
      severity: s.windDamagePending > 80 ? 3 : 2,
      title: `Wind damage: ${s.windDamagePending} more buildings`,
      detail: `Gusts to ${gust.toFixed(0)} m/s tore off roofs and cladding; light wood-frame houses and warehouses fail first.`,
      x: 0,
      z: -300,
      causes: stormEvent >= 0 ? [stormEvent] : [],
      radius: 2600,
    });
    s.windDamagePending = 0;
  }
}

function strike(sim: Simulation) {
  const s = sim.s;
  const rng = sim.rng.weather;
  // Rejection-sample a location under dense cloud.
  let x = 0;
  let z = 0;
  for (let tries = 0; tries < 10; tries++) {
    x = rng.range(-HALF, HALF);
    z = rng.range(-HALF, HALF);
    const i = Math.min(WX_GRID - 1, Math.floor(((x + HALF) / WORLD) * WX_GRID));
    const j = Math.min(WX_GRID - 1, Math.floor(((z + HALF) / WORLD) * WX_GRID));
    if (rng.next() < s.clouds[j * WX_GRID + i]) break;
  }
  // Tall structures attract strikes within ~2.5x their height.
  let asset = -1;
  let bestD = Infinity;
  for (const tg of sim.d.lightningTargets) {
    const d = Math.hypot(tg.x - x, tg.z - z);
    if (d < tg.h * 2.5 && d < bestD) {
      bestD = d;
      x = tg.x;
      z = tg.z;
      asset = tg.asset;
    }
  }
  const stormEvent = s.storms.length ? s.storms[0].eventId : -1;
  const ev = sim.emit({
    type: 'lightning',
    category: 'weather',
    severity: 0,
    title: asset >= 0 ? `Lightning strike on ${sim.city.assets[asset].name}` : 'Lightning strike',
    detail: 'Cloud-to-ground strike sampled from the storm cell density field.',
    x,
    z,
    causes: stormEvent >= 0 ? [stormEvent] : [],
    radius: 400,
  });
  s.strikes.push({ x, z, tick: s.tick, eventId: ev });

  if (asset >= 0) {
    const a = sim.city.assets[asset];
    if (rng.next() < 0.18) {
      // permanent equipment damage
      if (s.aDS[asset] < 3) {
        s.aDS[asset] = 3;
        s.aDamageEvent[asset] = sim.emit({
          type: a.kind === 'tower' ? 'critical_damage' : 'substation_damage',
          category: a.kind === 'tower' ? 'comms' : 'power',
          severity: 2,
          title: `${a.name} destroyed by lightning`,
          detail: 'Direct strike exceeded surge-arrester capacity; equipment out of service.',
          x: a.x,
          z: a.z,
          causes: [ev],
          subject: { kind: 'asset', id: asset },
          radius: 500,
        });
      }
    } else if (a.kind === 'sub' || a.kind === 'tx') {
      s.aTrip[asset] = Math.max(s.aTrip[asset], 240 + rng.next() * 240);
      s.aTripEvent[asset] = ev;
    }
    return;
  }
  // Ignition of dry fuel.
  const c = cellOfXZ(x, z);
  const wet = s.wetness[sim.d.wxOfCell[c]];
  const fuel = s.fuel[c];
  if (fuel > 0.15 && rng.next() < 0.35 * (1 - wet) * Math.min(1, fuel)) {
    sim.ignite(c, ev, 'Lightning ignited dry fuel', 1);
  }
}
