import { CELL, CITY_NAME, GRID, HALF, N_CELLS, cellX, cellZ, worldToCell } from '../config';
import { clamp, smoothstep } from '../math';
import { Rng } from '../rng';
import {
  type Asset,
  type AssetKind,
  BType,
  type Bridge,
  type Buildings,
  type City,
  type District,
  type LeveeSegment,
  type PowerLine,
  RoadKind,
  SClass,
  Zone,
} from '../types';
import { TerrainModel } from './terrainModel';
import { buildRoadGraph } from './roads';

export const DISTRICT_DEFS = [
  { name: 'Harbor District', kind: 'port', spacing: 6 },
  { name: 'Westside Industrial', kind: 'industrial', spacing: 6 },
  { name: 'Old Town', kind: 'historic', spacing: 3 },
  { name: 'Downtown', kind: 'cbd', spacing: 4 },
  { name: 'Midtown', kind: 'commercial', spacing: 4 },
  { name: 'Eastport Reclaim', kind: 'polder', spacing: 4 },
  { name: 'Westhill', kind: 'residential', spacing: 4 },
  { name: 'Northridge', kind: 'residential', spacing: 4 },
  { name: 'Hillcrest', kind: 'residential', spacing: 4 },
  { name: 'Greenbelt', kind: 'parkland', spacing: 12 },
] as const;

export const D = {
  Harbor: 0,
  Westside: 1,
  OldTown: 2,
  Downtown: 3,
  Midtown: 4,
  Eastport: 5,
  Westhill: 6,
  Northridge: 7,
  Hillcrest: 8,
  Greenbelt: 9,
} as const;

/** Lognormal fragility medians (PGA, g) per structural class for slight/moderate/extensive/complete. */
export const FRAGILITY: [number, number, number, number][] = [
  [0.24, 0.43, 0.9, 1.5], // wood frame
  [0.14, 0.22, 0.38, 0.6], // unreinforced masonry
  [0.15, 0.24, 0.42, 0.75], // RC pre-code
  [0.22, 0.38, 0.75, 1.3], // RC modern
  [0.25, 0.45, 0.9, 1.6], // steel frame
  [0.4, 0.75, 1.4, 2.2], // base isolated
  [0.2, 0.35, 0.65, 1.1], // light steel
];
export const FRAGILITY_BETA = 0.55;

const COST_PER_M2 = [1900, 2300, 2900, 4300, 1200, 1600, 5600, 2600, 2500, 3200, 2100];
const FUEL = [1.0, 0.6, 0.45, 0.35, 0.8, 0.9, 0.4, 0.4, 0.45, 0.4, 0.7];

export function generateCity(seed: number): City {
  const tm = new TerrainModel(seed);
  const rng = Rng.stream(seed, 'city');

  // ------------------------------------------------------------------ terrain grid
  const terrain = new Float32Array(N_CELLS);
  const inlandD = new Float32Array(N_CELLS);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = cellX(i);
      const z = cellZ(j);
      const q = CELL * 0.25;
      terrain[j * GRID + i] = (tm.height(x, z) * 2 + tm.height(x - q, z - q) + tm.height(x + q, z - q) + tm.height(x - q, z + q) + tm.height(x + q, z + q)) / 6;
      inlandD[j * GRID + i] = tm.inland(x, z);
    }
  }
  const slope = new Float32Array(N_CELLS);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const hx = terrain[j * GRID + Math.min(GRID - 1, i + 1)] - terrain[j * GRID + Math.max(0, i - 1)];
      const hz = terrain[Math.min(GRID - 1, j + 1) * GRID + i] - terrain[Math.max(0, j - 1) * GRID + i];
      slope[c] = Math.hypot(hx, hz) / (2 * CELL);
    }
  }

  // ------------------------------------------------------------------ zones & districts
  const zone = new Uint8Array(N_CELLS);
  const district = new Int8Array(N_CELLS).fill(-1);
  const polderMask = new Uint8Array(N_CELLS);
  const pierMask = new Uint8Array(N_CELLS);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const x = cellX(i);
      const z = cellZ(j);
      const d = inlandD[c];
      if (tm.inPier(x, z)) {
        pierMask[c] = 1;
        terrain[c] = 3.2;
        zone[c] = Zone.Port;
        district[c] = D.Harbor;
        continue;
      }
      if (d < 0 || (terrain[c] < 0.25 && tm.polder(x, z) <= 0.5 && !tm.inRiver(x, z))) {
        zone[c] = Zone.Ocean;
        continue;
      }
      if (tm.inRiver(x, z)) {
        zone[c] = Zone.River;
        continue;
      }
      const rx = tm.riverX(z);
      const rd = Math.abs(x - rx);
      let dist: number;
      if (tm.polder(x, z) > 0.5) {
        dist = D.Eastport;
        polderMask[c] = 1;
      } else if (x > TerrainModel.HARBOR_X0 - 120 && x < TerrainModel.HARBOR_X1 + 20 && d < 470) dist = D.Harbor;
      else if (x < -760 && d < 1150) dist = D.Westside;
      else if (rd < 470 && d < 1380 && !(x > -180 && d < 720)) dist = D.OldTown;
      else if (x >= -180 && x < 560 && d < 720) dist = D.Downtown;
      else if (x >= -180 && x < 980 && d < 1380) dist = D.Midtown;
      else if (x > 60 && x < 540 && d >= 1380 && d < 1720) dist = D.Greenbelt;
      else if (x < rx) dist = D.Westhill;
      else if (x < 950) dist = D.Northridge;
      else dist = D.Hillcrest;

      // Forest on the high ridge / far north and very steep ground.
      const h = terrain[c];
      if (dist !== D.Eastport && dist !== D.Harbor && (d > 2300 || (h > 62 && x < -700) || slope[c] > 0.2 || (h > 78))) {
        dist = D.Greenbelt;
      }
      district[c] = dist;
      switch (dist) {
        case D.Harbor:
          zone[c] = Zone.Port;
          break;
        case D.Westside:
          zone[c] = Zone.Industrial;
          break;
        case D.Downtown:
          zone[c] = Zone.Downtown;
          break;
        case D.Midtown:
          zone[c] = Zone.Commercial;
          break;
        case D.Greenbelt:
          zone[c] = d > 1720 || x < 60 || x > 540 ? Zone.Forest : Zone.Park;
          break;
        default:
          zone[c] = Zone.Residential;
      }
      if (d < 45 && dist !== D.Harbor && dist !== D.Eastport && dist !== D.Downtown) zone[c] = Zone.Shore;
    }
  }
  // Green river banks.
  for (let j = 1; j < GRID - 1; j++) {
    for (let i = 1; i < GRID - 1; i++) {
      const c = j * GRID + i;
      if (zone[c] === Zone.River || zone[c] === Zone.Ocean || zone[c] === Zone.Port) continue;
      if (zone[c - 1] === Zone.River || zone[c + 1] === Zone.River) {
        if (district[c] !== D.Downtown) zone[c] = Zone.Park;
      }
    }
  }
  // Scatter pocket parks through residential blocks (whole 3x3 blocks).
  for (let bj = 0; bj < GRID; bj += 4) {
    for (let bi = 0; bi < GRID; bi += 4) {
      if (rng.next() > 0.06) continue;
      const c0 = (bj + 3) * GRID + (bi + 3);
      if (c0 >= N_CELLS || zone[c0] !== Zone.Residential) continue;
      for (let dj = 3; dj < 6; dj++) for (let di = 3; di < 6; di++) {
        const c = (bj + dj) * GRID + (bi + di);
        if (bj + dj < GRID && bi + di < GRID && zone[c] === Zone.Residential) zone[c] = Zone.Park;
      }
    }
  }

  // Ocean boundary: sea cells flood-filled from the southern edge.
  const ocean = new Uint8Array(N_CELLS);
  {
    const stack: number[] = [];
    for (let i = 0; i < GRID; i++) {
      const c = (GRID - 1) * GRID + i;
      if (zone[c] === Zone.Ocean) {
        ocean[c] = 1;
        stack.push(c);
      }
    }
    while (stack.length) {
      const c = stack.pop()!;
      const i = c % GRID;
      const j = (c / GRID) | 0;
      const nb = [i > 0 ? c - 1 : -1, i < GRID - 1 ? c + 1 : -1, j > 0 ? c - GRID : -1, j < GRID - 1 ? c + GRID : -1];
      for (const n of nb) {
        if (n >= 0 && !ocean[n] && zone[n] === Zone.Ocean) {
          ocean[n] = 1;
          stack.push(n);
        }
      }
    }
    // Low pockets cut off from the sea are estuary backwaters of the river (or ponds).
    for (let c = 0; c < N_CELLS; c++) {
      if (zone[c] !== Zone.Ocean || ocean[c]) continue;
      zone[c] = Zone.River;
      district[c] = -1;
    }
  }

  // Levee: polder cells within one cell (Chebyshev) of open sea.
  const leveeHeight = new Float32Array(N_CELLS);
  const leveeSegment = new Int16Array(N_CELLS).fill(-1);
  const LEVEE_CREST = 3.9;
  const leveeCells: number[] = [];
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      if (ocean[c] || zone[c] === Zone.River) continue;
      if (cellX(i) < TerrainModel.POLDER_X0 - 40) continue;
      let nearSea = false;
      for (let dj = -1; dj <= 1 && !nearSea; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni >= 0 && nj >= 0 && ni < GRID && nj < GRID && ocean[nj * GRID + ni]) nearSea = true;
        }
      }
      if (!nearSea) continue;
      leveeCells.push(c);
      leveeHeight[c] = Math.max(0.5, LEVEE_CREST - terrain[c]);
      zone[c] = Zone.Shore;
      district[c] = D.Eastport;
    }
  }

  fillDepressions(terrain, (c) => ocean[c] === 1 || zone[c] === Zone.River || polderMask[c] === 1 || leveeHeight[c] > 0);

  // ------------------------------------------------------------------ roads
  const road = new Uint8Array(N_CELLS);
  const isArterialLine = (i: number, j: number) => (j - 2) % 12 === 0 || (i - 2) % 12 === 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const z = zone[c];
      if (z === Zone.Ocean || z === Zone.River || leveeHeight[c] > 0 || pierMask[c]) continue;
      const dd = district[c];
      if (dd < 0) continue;
      const s = DISTRICT_DEFS[dd].spacing;
      const onLine = (j - 2) % s === 0 || (i - 2) % s === 0;
      const art = isArterialLine(i, j);
      if (!onLine && !art) continue;
      if (z === Zone.Forest && (!art || slope[c] > 0.16)) continue;
      if (z === Zone.Park && !art) continue;
      if (slope[c] > (art ? 0.22 : 0.15)) continue;
      if (z === Zone.Shore && !art && dd !== D.Eastport) continue;
      road[c] = art ? RoadKind.Arterial : RoadKind.Street;
    }
  }
  // Bridges: selected east-west arterials crossing the river.
  const bridgeRows: number[] = [];
  {
    const candidates: number[] = [];
    for (let j = 2; j < GRID; j += 12) {
      // need land roads on both banks
      let first = -1;
      let last = -1;
      for (let i = 0; i < GRID; i++) {
        if (zone[j * GRID + i] === Zone.River) {
          if (first < 0) first = i;
          last = i;
        }
      }
      if (first <= 0 || last >= GRID - 1) continue;
      if (road[j * GRID + first - 1] && road[j * GRID + last + 1]) candidates.push(j);
    }
    // keep every other crossing, always including the southernmost (river mouth)
    const south = candidates[candidates.length - 1];
    for (let k = candidates.length - 1, n = 0; k >= 0; k--, n++) if (n % 2 === 0 || candidates[k] === south) bridgeRows.push(candidates[k]);
    bridgeRows.sort((a, b) => b - a); // south first
  }
  for (const j of bridgeRows) {
    const cells: number[] = [];
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      if (zone[c] === Zone.River) {
        road[c] = RoadKind.Bridge;
        cells.push(c);
      }
    }
  }

  const { graph, roadEdge, cellNode } = buildRoadGraph(road, isArterialLine, (x, z) => (x < tm.riverX(z) ? 0 : 1));

  // ------------------------------------------------------------------ districts summary
  const districts: District[] = DISTRICT_DEFS.map((d, id) => ({ id, name: d.name, kind: d.kind, cx: 0, cz: 0, cells: 0 }));
  for (let c = 0; c < N_CELLS; c++) {
    const d = district[c];
    if (d < 0) continue;
    districts[d].cx += cellX(c % GRID);
    districts[d].cz += cellZ((c / GRID) | 0);
    districts[d].cells++;
  }
  for (const d of districts) {
    if (d.cells) {
      d.cx /= d.cells;
      d.cz /= d.cells;
    }
  }

  // ------------------------------------------------------------------ soils, vegetation, drainage
  const soil = new Float32Array(N_CELLS);
  const vegetation = new Float32Array(N_CELLS);
  const drainCapacity = new Float32Array(N_CELLS);
  const mmh = 1 / 1000 / 3600;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const x = cellX(i);
      const z = cellZ(j);
      const d = inlandD[c];
      const rd = Math.abs(x - tm.riverX(z));
      let s = 0.08 + 0.45 * (1 - smoothstep(0, 900, d)) + 0.45 * (1 - smoothstep(80, 520, rd));
      if (polderMask[c] || leveeHeight[c] > 0) s = 0.95;
      if (zone[c] === Zone.Port) s = Math.max(s, 0.8);
      s -= smoothstep(20, 60, terrain[c]) * 0.4;
      soil[c] = clamp(s, 0.03, 1);
      switch (zone[c]) {
        case Zone.Forest:
          vegetation[c] = 0.85;
          break;
        case Zone.Park:
          vegetation[c] = 0.45;
          break;
        case Zone.Residential:
          vegetation[c] = 0.22;
          break;
        case Zone.Shore:
          vegetation[c] = 0.05;
          break;
        default:
          vegetation[c] = 0.02;
      }
      const urban = zone[c] >= Zone.Residential;
      if (urban || road[c]) drainCapacity[c] = (district[c] === D.Downtown ? 16 : 12) * mmh;
    }
  }

  // ------------------------------------------------------------------ infrastructure
  const reserved = new Uint8Array(N_CELLS);
  const assets: Asset[] = [];
  const urbanOK = (c: number) => zone[c] >= Zone.Residential && !road[c] && !reserved[c] && leveeHeight[c] === 0 && !pierMask[c];
  const findCell = (x: number, z: number, ok: (c: number) => boolean): number => {
    const c0 = worldToCell(x, z);
    const i0 = c0 % GRID;
    const j0 = (c0 / GRID) | 0;
    for (let r = 0; r < 40; r++) {
      let best = -1;
      let bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 1 || j < 1 || i >= GRID - 1 || j >= GRID - 1) continue;
          const c = j * GRID + i;
          if (!ok(c)) continue;
          const dd = di * di + dj * dj;
          if (dd < bd) {
            bd = dd;
            best = c;
          }
        }
      }
      if (best >= 0) return best;
    }
    return c0;
  };
  const addAsset = (kind: AssetKind, name: string, x: number, z: number, opts: Partial<Asset>, ok: (c: number) => boolean = urbanOK): Asset => {
    const cell = findCell(x, z, ok);
    reserved[cell] = 1;
    const a: Asset = {
      id: assets.length,
      kind,
      name,
      x: cellX(cell % GRID),
      z: cellZ((cell / GRID) | 0),
      cell,
      district: Math.max(0, district[cell]),
      node: -1,
      building: -1,
      fragility: [0.25, 0.45, 0.8, 1.4],
      beta: 0.6,
      year: 1990,
      floodLimit: 1.0,
      backupHours: 0,
      substation: -1,
      capacity: 0,
      repairCost: 5e6,
      description: '',
      ...opts,
    };
    assets.push(a);
    return a;
  };
  const coast = (x: number) => tm.coastZ(x);
  const riverAt = (z: number) => tm.riverX(z);

  // Power sources.
  const plant = addAsset('plant', 'Kestrel Point Power Station', -1880, coast(-1880) - 520, {
    fragility: [0.3, 0.55, 0.95, 1.5], year: 1998, capacity: 900, floodLimit: 1.5, repairCost: 420e6,
    description: '900 MW combined-cycle gas plant on the western industrial shoreline.',
  });
  const imp = addAsset('import', 'Northern 345 kV Interconnect', 950, -1960, {
    fragility: [0.4, 0.7, 1.2, 1.9], year: 2012, capacity: 700, repairCost: 60e6,
    description: 'Regional grid interconnection entering from the north.',
  }, (c) => zone[c] !== Zone.Ocean && zone[c] !== Zone.River && !road[c] && !reserved[c]);
  const txW = addAsset('tx', 'Westgate 230 kV Substation', -1250, coast(-1250) - 900, {
    fragility: [0.26, 0.46, 0.72, 1.25], year: 1984, repairCost: 48e6, description: 'Transmission substation feeding the western grid.',
  });
  const txN = addAsset('tx', 'North Hill 230 kV Substation', 420, -1180, {
    fragility: [0.3, 0.52, 0.85, 1.4], year: 2003, repairCost: 52e6, description: 'Transmission hub feeding downtown and the east.',
  });

  // Distribution substations, one per built-up district.
  const subSpecs: { d: number; name: string; frag: [number, number, number, number]; year: number; dx?: number; dz?: number }[] = [
    { d: D.Harbor, name: 'Harbor Substation', frag: [0.2, 0.36, 0.5, 0.9], year: 1971 },
    { d: D.Westside, name: 'Westside Substation', frag: [0.24, 0.42, 0.62, 1.1], year: 1979 },
    { d: D.OldTown, name: 'Old Town Substation', frag: [0.2, 0.36, 0.52, 0.95], year: 1962 },
    { d: D.Downtown, name: 'Downtown Substation', frag: [0.3, 0.52, 0.85, 1.4], year: 2008 },
    { d: D.Midtown, name: 'Midtown Substation', frag: [0.26, 0.46, 0.7, 1.2], year: 1993 },
    { d: D.Eastport, name: 'Eastport Substation', frag: [0.12, 0.2, 0.3, 0.55], year: 1978 },
    { d: D.Westhill, name: 'Westhill Substation', frag: [0.26, 0.45, 0.68, 1.15], year: 1988 },
    { d: D.Northridge, name: 'Northridge Substation', frag: [0.27, 0.47, 0.72, 1.2], year: 1996 },
    { d: D.Hillcrest, name: 'Hillcrest Substation', frag: [0.27, 0.47, 0.72, 1.2], year: 1999 },
  ];
  const subs: Asset[] = [];
  for (const s of subSpecs) {
    const dd = districts[s.d];
    const a = addAsset('sub', s.name, dd.cx + (s.dx ?? 0), dd.cz + (s.dz ?? 0), {
      fragility: s.frag, year: s.year, floodLimit: 0.6, repairCost: 14e6,
      description: s.d === D.Eastport ? 'Built on reclaimed fill with unanchored 1970s transformers; single radial feed from North Hill.' : `Distribution substation serving ${dd.name}.`,
    }, (c) => urbanOK(c) && district[c] === s.d);
    subs.push(a);
  }
  const subOf = (d: number) => subs[subSpecs.findIndex((s) => s.d === d)];

  // Transmission & sub-transmission lines.
  const lines: PowerLine[] = [];
  const addLine = (a: Asset, b: Asset, kind: PowerLine['kind'], windRating: number, quakeMedian: number) => {
    const pts: number[] = [];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(2, Math.round(len / 260));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      pts.push(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    }
    lines.push({ id: lines.length, a: a.id, b: b.id, kind, name: `${a.name.split(' ')[0]}–${b.name.split(' ')[0]} line`, windRating, quakeMedian, points: pts });
  };
  addLine(plant, txW, 'transmission', 52, 1.4);
  addLine(imp, txN, 'transmission', 55, 1.5);
  addLine(txW, txN, 'transmission', 50, 1.3);
  for (const d of [D.Harbor, D.Westside, D.OldTown, D.Westhill]) addLine(txW, subOf(d), 'subtransmission', 42, 1.1);
  for (const d of [D.Downtown, D.Midtown, D.Northridge, D.Hillcrest]) addLine(txN, subOf(d), 'subtransmission', 44, 1.15);
  addLine(txW, subOf(D.Downtown), 'subtransmission', 44, 1.15); // redundant downtown feed
  addLine(txN, subOf(D.Eastport), 'subtransmission', 36, 0.9); // long radial feed, older poles

  // Flood pumps along the polder levee.
  const polderCells: number[] = [];
  for (let c = 0; c < N_CELLS; c++) if (polderMask[c]) polderCells.push(c);
  let px0 = Infinity;
  let px1 = -Infinity;
  for (const c of polderCells) {
    const x = cellX(c % GRID);
    px0 = Math.min(px0, x);
    px1 = Math.max(px1, x);
  }
  const pumpNames = ['Eastport Pump Station West', 'Eastport Pump Station Central', 'Eastport Pump Station East'];
  const pumps: Asset[] = [];
  for (let k = 0; k < 3; k++) {
    const x = px0 + ((k + 0.5) / 3) * (px1 - px0);
    const z = coast(x) - 90;
    pumps.push(addAsset('pump', pumpNames[k], x, z, {
      fragility: [0.3, 0.5, 0.9, 1.4], year: 1981 + k * 6, capacity: 5.0, floodLimit: 1.3, backupHours: 1.5, repairCost: 9e6,
      description: 'Lifts polder drainage over the levee into the sea. Diesel backup for ~1.5 h.',
    }, (c) => urbanOK(c) && polderMask[c] === 1));
  }
  const pumpCatchment = new Int16Array(N_CELLS).fill(-1);
  for (const c of polderCells) {
    const x = cellX(c % GRID);
    const z = cellZ((c / GRID) | 0);
    let best = 0;
    let bd = Infinity;
    for (const p of pumps) {
      const dd = (p.x - x) ** 2 + ((p.z - z) * 0.5) ** 2;
      if (dd < bd) {
        bd = dd;
        best = p.id;
      }
    }
    pumpCatchment[c] = best;
  }

  addAsset('water', 'Riverside Water Works', riverAt(-1450) + 260, -1450, {
    fragility: [0.28, 0.5, 0.85, 1.4], year: 1987, floodLimit: 1.0, backupHours: 0, repairCost: 70e6,
    description: 'Treatment plant and high-lift pumps. Pressurises hydrants and hospitals; no on-site generation.',
  });

  // Hospitals, fire stations, shelters, comms, EOC (these occupy buildings).
  const specials: { a: Asset; btype: BType; w: number; d: number; h: number }[] = [];
  const addSpecial = (kind: AssetKind, name: string, x: number, z: number, btype: BType, size: [number, number, number], opts: Partial<Asset>, ok?: (c: number) => boolean) => {
    const a = addAsset(kind, name, x, z, opts, ok);
    specials.push({ a, btype, w: size[0], d: size[1], h: size[2] });
    return a;
  };
  const dc = (d: number) => districts[d];
  addSpecial('hospital', 'St. Aurelia General Hospital', dc(D.Midtown).cx - 150, dc(D.Midtown).cz + 60, BType.Hospital, [30, 30, 46], {
    fragility: [0.3, 0.55, 1.0, 1.6], year: 2004, floodLimit: 0.8, backupHours: 48, capacity: 70, repairCost: 180e6,
    description: 'Level I trauma centre. 48 h generator autonomy; requires municipal water for full operation.',
  });
  addSpecial('hospital', 'Eastport Medical Center', dc(D.Eastport).cx + 60, dc(D.Eastport).cz, BType.Hospital, [28, 28, 34], {
    fragility: [0.3, 0.55, 1.0, 1.6], year: 1989, floodLimit: 0.7, backupHours: 36, capacity: 45, repairCost: 120e6,
    description: 'Community hospital inside the polder. Access depends on low-lying arterial roads.',
  }, (c) => urbanOK(c) && polderMask[c] === 1);
  addSpecial('hospital', 'Northridge Hospital', dc(D.Northridge).cx - 100, dc(D.Northridge).cz + 120, BType.Hospital, [28, 28, 30], {
    fragility: [0.3, 0.55, 1.0, 1.6], year: 2011, floodLimit: 0.8, backupHours: 48, capacity: 55, repairCost: 150e6,
    description: 'Modern hillside hospital on firm ground.',
  });
  const fireSpecs: [string, number, number][] = [
    ['Fire Station 1 — Downtown', dc(D.Downtown).cx + 120, dc(D.Downtown).cz - 80],
    ['Fire Station 2 — Harbor', dc(D.Harbor).cx + 150, dc(D.Harbor).cz - 150],
    ['Fire Station 3 — Northridge', dc(D.Northridge).cx + 200, dc(D.Northridge).cz - 150],
    ['Fire Station 4 — Eastport', dc(D.Eastport).cx - 250, dc(D.Eastport).cz - 60],
    ['Fire Station 5 — Westhill', dc(D.Westhill).cx, dc(D.Westhill).cz],
    ['Fire Station 6 — Old Town', dc(D.OldTown).cx, dc(D.OldTown).cz + 150],
  ];
  for (const [name, x, z] of fireSpecs) {
    addSpecial('fire', name, x, z, BType.FireStation, [24, 22, 11], {
      fragility: [0.32, 0.6, 1.1, 1.7], year: 1995, floodLimit: 0.9, backupHours: 24, capacity: 2, repairCost: 8e6,
      description: 'Engine company. Dispatch depends on the telecom network; response depends on open roads.',
    });
  }
  const shelterSpecs: [string, number, number, number, [number, number, number]][] = [
    ['Hillcrest Stadium', dc(D.Hillcrest).cx, dc(D.Hillcrest).cz, 420, [60, 60, 24]],
    ['Northridge High School', dc(D.Northridge).cx + 250, dc(D.Northridge).cz - 200, 180, [44, 30, 14]],
    ['Midtown Convention Center', dc(D.Midtown).cx + 250, dc(D.Midtown).cz - 120, 260, [58, 40, 22]],
    ['Westhill Community Arena', dc(D.Westhill).cx + 120, dc(D.Westhill).cz - 150, 200, [48, 40, 18]],
    ['Riverside Civic Center', riverAt(-900) + 380, -900, 150, [40, 30, 14]],
  ];
  for (const [name, x, z, cap, size] of shelterSpecs) {
    addSpecial('shelter', name, x, z, BType.Shelter, size, {
      fragility: [0.3, 0.55, 1.0, 1.6], year: 2001, floodLimit: 0.5, backupHours: 12, capacity: cap, repairCost: 40e6,
      description: 'Designated emergency shelter on higher ground.',
    });
  }
  addSpecial('hub', 'Meridian Data Exchange', dc(D.Midtown).cx + 60, dc(D.Midtown).cz - 200, BType.Civic, [30, 26, 18], {
    fragility: [0.3, 0.55, 1.0, 1.6], year: 2015, floodLimit: 1.0, backupHours: 24, repairCost: 90e6,
    description: 'Core telecom exchange: every cell tower backhauls through here.',
  });
  addSpecial('eoc', 'City Hall & Emergency Operations Centre', dc(D.Downtown).cx - 120, dc(D.Downtown).cz + 40, BType.Civic, [44, 36, 38], {
    fragility: [0.35, 0.6, 1.1, 1.8], year: 2010, floodLimit: 1.0, backupHours: 72, repairCost: 110e6,
    description: 'Coordinates evacuation orders and emergency dispatch.',
  });
  const towerSpots: [number, number][] = [
    [-1500, -700], [-700, -300], [150, 150], [300, -700], [1300, 400], [1100, -900], [-600, -1500], [600, -1700],
  ];
  towerSpots.forEach(([x, z], k) => {
    addAsset('tower', `Cell Tower ${String.fromCharCode(65 + k)}`, x, z, {
      fragility: [0.3, 0.55, 0.95, 1.5], year: 2010 + (k % 8), floodLimit: 1.0, backupHours: 4, repairCost: 1.2e6,
      description: 'LTE/5G macro site, 4 h battery backup, fibre backhaul to the exchange.',
    }, (c) => zone[c] !== Zone.Ocean && zone[c] !== Zone.River && !road[c] && !reserved[c] && leveeHeight[c] === 0);
  });

  // ------------------------------------------------------------------ buildings
  const B = new BuildingsBuilder();
  const reservedSpecial = new Map<number, (typeof specials)[number]>();
  for (const s of specials) reservedSpecial.set(s.a.cell, s);

  const groundMin = (x: number, z: number, w: number, d: number) =>
    Math.min(tm.height(x - w / 2, z - d / 2), tm.height(x + w / 2, z - d / 2), tm.height(x - w / 2, z + d / 2), tm.height(x + w / 2, z + d / 2), tm.height(x, z)) - 0.4;

  const dtCenter = { x: dc(D.Downtown).cx + 60, z: dc(D.Downtown).cz + 40 };
  let tallestIdx = -1;
  let tallestD = Infinity;

  for (let j = 1; j < GRID - 1; j++) {
    for (let i = 1; i < GRID - 1; i++) {
      const c = j * GRID + i;
      const x = cellX(i);
      const z = cellZ(j);
      const sp = reservedSpecial.get(c);
      if (sp) {
        const b = B.add({ x, z, w: sp.w, d: sp.d, h: sp.h, baseY: groundMin(x, z, sp.w, sp.d), type: sp.btype, sclass: sp.a.fragility[2] >= 1 ? SClass.BaseIsolated : SClass.RCModern, district: Math.max(0, district[c]), year: sp.a.year, cell: c, asset: sp.a.id, style: 5 });
        sp.a.building = b;
        continue;
      }
      if (reserved[c] || road[c] || leveeHeight[c] > 0) continue;
      const zn = zone[c];
      const dd = district[c];
      if (zn < Zone.Residential && !pierMask[c]) continue;
      if (pierMask[c]) continue; // piers carry containers and cranes (props)
      const r = rng.next();
      if (dd === D.Downtown) {
        if (r < 0.08) continue; // plaza
        const dist = Math.hypot(x - dtCenter.x, z - dtCenter.z);
        const core = Math.exp(-(dist * dist) / (2 * 380 * 380));
        const h = 34 + 230 * core * (0.45 + 0.75 * rng.next()) + rng.next() * 30;
        const year = h > 150 ? 1995 + rng.int(30) : 1965 + rng.int(58);
        const sc = year > 2008 && rng.next() < 0.5 ? SClass.BaseIsolated : year > 1982 ? (rng.next() < 0.6 ? SClass.SteelFrame : SClass.RCModern) : SClass.RCPreCode;
        const fw = 21 + rng.next() * 6;
        const fd = 21 + rng.next() * 6;
        const b = B.add({ x, z, w: fw, d: fd, h, baseY: groundMin(x, z, fw, fd), type: h > 70 ? BType.Tower : BType.Office, sclass: sc, district: dd, year, cell: c, asset: -1, style: h > 110 ? 0 : rng.next() < 0.5 ? 0 : 1 });
        if (dist < tallestD) {
          tallestD = dist;
          tallestIdx = b;
        }
      } else if (dd === D.Midtown) {
        if (r < 0.05) continue;
        const h = 14 + rng.next() * 46 + (rng.next() < 0.1 ? 40 : 0);
        const year = 1958 + rng.int(64);
        const sc = year < 1976 ? SClass.RCPreCode : rng.next() < 0.3 ? SClass.SteelFrame : SClass.RCModern;
        const fw = 22 + rng.next() * 6;
        const fd = 22 + rng.next() * 6;
        B.add({ x, z, w: fw, d: fd, h, baseY: groundMin(x, z, fw, fd), type: rng.next() < 0.3 ? BType.Retail : BType.Office, sclass: sc, district: dd, year, cell: c, asset: -1, style: rng.next() < 0.4 ? 0 : 1 });
      } else if (dd === D.OldTown) {
        // two narrow historic buildings per cell
        for (let k = 0; k < 2; k++) {
          const bx = x + (k === 0 ? -8 : 8);
          const h = 8 + rng.next() * 12;
          const year = 1885 + rng.int(70);
          const sc = rng.next() < 0.62 ? SClass.URM : SClass.WoodFrame;
          const fw = 13 + rng.next() * 2;
          const fd = 22 + rng.next() * 6;
          B.add({ x: bx, z, w: fw, d: fd, h, baseY: groundMin(bx, z, fw, fd), type: rng.next() < 0.3 ? BType.Retail : BType.Apartment, sclass: sc, district: dd, year, cell: c, asset: -1, style: 2 });
        }
      } else if (dd === D.Eastport) {
        if (r < 0.62) {
          const h = 12 + rng.next() * 28;
          const year = 1984 + rng.int(28);
          const fw = 22 + rng.next() * 5;
          const fd = 18 + rng.next() * 8;
          B.add({ x, z, w: fw, d: fd, h, baseY: groundMin(x, z, fw, fd), type: BType.Apartment, sclass: rng.next() < 0.75 ? SClass.RCModern : SClass.RCPreCode, district: dd, year, cell: c, asset: -1, style: 1 });
        } else {
          addHouses(B, rng, x, z, c, dd, groundMin, 1982);
        }
      } else if (dd === D.Harbor || dd === D.Westside) {
        if (r < 0.1) continue;
        const factory = dd === D.Westside && rng.next() < 0.45;
        const h = factory ? 12 + rng.next() * 14 : 9 + rng.next() * 7;
        const fw = 26 + rng.next() * 3;
        const fd = 24 + rng.next() * 5;
        B.add({ x, z, w: fw, d: fd, h, baseY: groundMin(x, z, fw, fd), type: factory ? BType.Factory : BType.Warehouse, sclass: factory && rng.next() < 0.4 ? SClass.RCPreCode : SClass.SteelLight, district: dd, year: 1955 + rng.int(60), cell: c, asset: -1, style: 3 });
      } else if (zn === Zone.Residential) {
        if (rng.next() < 0.2) {
          const h = 12 + rng.next() * 18;
          const fw = 22 + rng.next() * 5;
          const fd = 16 + rng.next() * 8;
          const year = 1962 + rng.int(58);
          B.add({ x, z, w: fw, d: fd, h, baseY: groundMin(x, z, fw, fd), type: BType.Apartment, sclass: year < 1976 ? SClass.RCPreCode : SClass.RCModern, district: dd, year, cell: c, asset: -1, style: 1 });
        } else {
          addHouses(B, rng, x, z, c, dd, groundMin, 1948);
        }
      } else if (zn === Zone.Commercial) {
        const h = 10 + rng.next() * 20;
        B.add({ x, z, w: 24, d: 24, h, baseY: groundMin(x, z, 24, 24), type: BType.Retail, sclass: SClass.RCModern, district: Math.max(0, dd), year: 1980 + rng.int(40), cell: c, asset: -1, style: 1 });
      }
    }
  }
  // Signature supertall at the heart of downtown.
  if (tallestIdx >= 0) {
    B.h[tallestIdx] = 382;
    B.w[tallestIdx] = 32;
    B.d[tallestIdx] = 32;
    B.sclass[tallestIdx] = SClass.BaseIsolated;
    B.year[tallestIdx] = 2021;
    B.type[tallestIdx] = BType.Tower;
    B.style[tallestIdx] = 4;
  }
  const buildings = B.finish();

  // Derived building attributes.
  for (let b = 0; b < buildings.count; b++) {
    const floors = Math.max(1, Math.round(buildings.h[b] / (buildings.type[b] === BType.House ? 3.0 : 3.6)));
    buildings.floors[b] = Math.min(255, floors);
    const area = buildings.w[b] * buildings.d[b] * floors;
    buildings.value[b] = area * COST_PER_M2[buildings.type[b]];
    buildings.fuel[b] = FUEL[buildings.type[b]] * (buildings.sclass[b] === SClass.WoodFrame ? 1.15 : 1);
    const t = buildings.type[b];
    buildings.residents[b] = t === BType.House ? 3 : t === BType.Apartment ? area / 45 : 0;
  }

  // ------------------------------------------------------------------ node & service mapping
  const nearestRoad = nearestRoadCells(road, zone);
  const nodeForCell = (c: number): number => {
    const rc = nearestRoad[c];
    if (rc < 0) return 0;
    if (cellNode[rc] >= 0) return cellNode[rc];
    const e = roadEdge[rc];
    if (e < 0) return 0;
    const a = graph.edgeA[e];
    const bn = graph.edgeB[e];
    const x = cellX(rc % GRID);
    const z = cellZ((rc / GRID) | 0);
    const da = (graph.nodeX[a] - x) ** 2 + (graph.nodeZ[a] - z) ** 2;
    const db = (graph.nodeX[bn] - x) ** 2 + (graph.nodeZ[bn] - z) ** 2;
    return da <= db ? a : bn;
  };
  for (let b = 0; b < buildings.count; b++) buildings.node[b] = nodeForCell(buildings.cell[b]);
  for (const a of assets) a.node = nodeForCell(a.cell);

  const nearestSub = (x: number, z: number, d: number) => {
    if (d === D.Eastport) return subOf(D.Eastport).id;
    let best = subs[0].id;
    let bd = Infinity;
    for (const s of subs) {
      if (s.district === D.Eastport) continue;
      const dd = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (dd < bd) {
        bd = dd;
        best = s.id;
      }
    }
    return best;
  };
  for (let b = 0; b < buildings.count; b++) buildings.substation[b] = nearestSub(buildings.x[b], buildings.z[b], buildings.district[b]);
  for (const a of assets) {
    if (a.kind === 'plant' || a.kind === 'import' || a.kind === 'tx' || a.kind === 'sub') continue;
    a.substation = nearestSub(a.x, a.z, a.district);
  }

  // ------------------------------------------------------------------ bridges & levee segments
  const bridgeNames: [string, number, Bridge['style'], [number, number, number, number]][] = [
    ['Meridian Bridge', 2009, 'cable', [0.35, 0.6, 1.0, 1.6]],
    ['Old Mill Bridge', 1958, 'girder', [0.16, 0.25, 0.36, 0.5]],
    ['Founders Bridge', 1931, 'arch', [0.22, 0.35, 0.52, 0.75]],
    ['Northgate Bridge', 1976, 'girder', [0.28, 0.45, 0.75, 1.1]],
    ['Riverside Bridge', 1994, 'girder', [0.25, 0.42, 0.7, 1.1]],
    ['Quarry Road Bridge', 1968, 'girder', [0.18, 0.28, 0.42, 0.65]],
  ];
  const bridges: Bridge[] = [];
  const bridgeEdges: number[] = [];
  for (let e = 0; e < graph.edgeCount; e++) if (graph.edgeKind[e] === RoadKind.Bridge) bridgeEdges.push(e);
  // southernmost (river mouth) first
  bridgeEdges.sort((a, b) => graph.nodeZ[graph.edgeA[b]] - graph.nodeZ[graph.edgeA[a]]);
  for (const e of bridgeEdges) {
    const idx = bridges.length;
    const spec = bridgeNames[Math.min(idx, bridgeNames.length - 1)];
    const cells: number[] = [];
    for (let k = graph.edgeCellStart[e]; k < graph.edgeCellStart[e + 1]; k++) {
      const cc = graph.edgeCells[k];
      if (road[cc] === RoadKind.Bridge) cells.push(cc);
    }
    let bx = 0;
    let bz = 0;
    let bank = -Infinity;
    for (const cc of cells) {
      bx += cellX(cc % GRID);
      bz += cellZ((cc / GRID) | 0);
    }
    bx /= Math.max(1, cells.length);
    bz /= Math.max(1, cells.length);
    for (let k = graph.edgeCellStart[e]; k < graph.edgeCellStart[e + 1]; k++) {
      const cc = graph.edgeCells[k];
      if (road[cc] !== RoadKind.Bridge) bank = Math.max(bank, terrain[cc]);
    }
    bridges.push({
      id: idx, name: spec[0], year: spec[1], style: spec[2], fragility: spec[3], edge: e, x: bx, z: bz, cells,
      deckY: Math.max(bank, 3) + (spec[2] === 'cable' ? 9 : 5), repairCost: spec[2] === 'cable' ? 260e6 : 70e6,
    });
    graph.edgeBridge[e] = idx;
  }

  const levees: LeveeSegment[] = [];
  if (leveeCells.length) {
    const sorted = [...leveeCells].sort((a, b) => cellX(a % GRID) - cellX(b % GRID) || a - b);
    const nseg = 4;
    const names = ['West Flank Levee', 'Eastport Seawall A', 'Eastport Seawall B', 'Eastport Seawall C'];
    for (let s = 0; s < nseg; s++) {
      const cells = sorted.slice(Math.floor((s * sorted.length) / nseg), Math.floor(((s + 1) * sorted.length) / nseg));
      let x = 0;
      let z = 0;
      for (const c of cells) {
        leveeSegment[c] = s;
        x += cellX(c % GRID);
        z += cellZ((c / GRID) | 0);
      }
      levees.push({ id: s, name: names[s], cells, crest: LEVEE_CREST, x: x / cells.length, z: z / cells.length });
    }
  }

  // River inflow cells on the northern boundary.
  const riverInflow: number[] = [];
  for (let i = 0; i < GRID; i++) if (zone[i] === Zone.River) riverInflow.push(i);

  let landCells = 0;
  let urbanCells = 0;
  for (let c = 0; c < N_CELLS; c++) {
    if (zone[c] !== Zone.Ocean && zone[c] !== Zone.River) landCells++;
    if (zone[c] >= Zone.Residential) urbanCells++;
  }
  let roadLen = 0;
  for (let e = 0; e < graph.edgeCount; e++) roadLen += graph.edgeLen[e];

  return {
    seed,
    name: CITY_NAME,
    terrain,
    zone,
    district,
    soil,
    ocean,
    road,
    roadEdge,
    vegetation,
    drainCapacity,
    pumpCatchment,
    riverInflow,
    leveeHeight,
    leveeSegment,
    districts,
    roads: graph,
    buildings,
    assets,
    lines,
    bridges,
    levees,
    population: 0,
    stats: { landCells, urbanCells, roadLengthKm: roadLen / 1000 },
  };
}

function addHouses(
  B: BuildingsBuilder,
  rng: Rng,
  x: number,
  z: number,
  c: number,
  dd: number,
  groundMin: (x: number, z: number, w: number, d: number) => number,
  yearFrom: number,
) {
  const n = rng.next() < 0.5 ? 2 : rng.next() < 0.6 ? 3 : 4;
  const offs = n === 2 ? [[-7.5, 0], [7.5, 0]] : n === 3 ? [[-7.5, -7], [7.5, -7], [0, 8]] : [[-7.5, -7.5], [7.5, -7.5], [-7.5, 7.5], [7.5, 7.5]];
  for (const [ox, oz] of offs) {
    const w = 9 + rng.next() * 3;
    const d = (n === 2 ? 15 : 9) + rng.next() * 3;
    const bx = x + ox + (rng.next() - 0.5) * 1.5;
    const bz = z + oz + (rng.next() - 0.5) * 1.5;
    const h = 5.5 + rng.next() * 3.5;
    B.add({ x: bx, z: bz, w, d, h, baseY: groundMin(bx, bz, w, d), type: BType.House, sclass: SClass.WoodFrame, district: Math.max(0, dd), year: yearFrom + rng.int(2022 - yearFrom), cell: c, asset: -1, style: 6 });
  }
}

/**
 * Priority-flood depression filling (Barnes et al. 2014) on the simulation grid, so rain
 * on the hills drains to the sea, the river or the domain edge instead of pooling in
 * noise-generated pits. Sea, river, polder and levee cells (and the domain border) are
 * outlets; the polder bowl is intentionally left below sea level (drained by pumps).
 */
function fillDepressions(terrain: Float32Array, isOutlet: (c: number) => boolean) {
  const closed = new Uint8Array(N_CELLS);
  const keys: number[] = [];
  const vals: number[] = [];
  const push = (k: number, v: number) => {
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  };
  const pop = (): number => {
    const top = vals[0];
    const k = keys.pop()!;
    const v = vals.pop()!;
    if (keys.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= keys.length) break;
        if (c + 1 < keys.length && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  };
  for (let c = 0; c < N_CELLS; c++) {
    const i = c % GRID;
    const j = (c / GRID) | 0;
    if (isOutlet(c) || i === 0 || j === 0 || i === GRID - 1 || j === GRID - 1) {
      closed[c] = 1;
      push(terrain[c], c);
    }
  }
  while (keys.length) {
    const c = pop();
    const i = c % GRID;
    const j = (c / GRID) | 0;
    const nbs = [i > 0 ? c - 1 : -1, i < GRID - 1 ? c + 1 : -1, j > 0 ? c - GRID : -1, j < GRID - 1 ? c + GRID : -1];
    for (const n of nbs) {
      if (n < 0 || closed[n]) continue;
      closed[n] = 1;
      if (terrain[n] <= terrain[c]) terrain[n] = terrain[c] + 0.004;
      push(terrain[n], n);
    }
  }
}

/** Multi-source BFS over land cells: nearest road cell for every cell. */
function nearestRoadCells(road: Uint8Array, zone: Uint8Array): Int32Array {
  const near = new Int32Array(N_CELLS).fill(-1);
  const queue = new Int32Array(N_CELLS);
  let head = 0;
  let tail = 0;
  for (let c = 0; c < N_CELLS; c++) {
    if (road[c]) {
      near[c] = c;
      queue[tail++] = c;
    }
  }
  while (head < tail) {
    const c = queue[head++];
    const i = c % GRID;
    const j = (c / GRID) | 0;
    const nbs = [i > 0 ? c - 1 : -1, i < GRID - 1 ? c + 1 : -1, j > 0 ? c - GRID : -1, j < GRID - 1 ? c + GRID : -1];
    for (const n of nbs) {
      if (n < 0 || near[n] >= 0) continue;
      if (zone[n] === Zone.River || zone[n] === Zone.Ocean) continue; // don't cross water
      near[n] = near[c];
      queue[tail++] = n;
    }
  }
  // Water cells / unreachable: fall back to any nearest (Euclidean) road cell.
  for (let c = 0; c < N_CELLS; c++) {
    if (near[c] >= 0) continue;
    let best = -1;
    let bd = Infinity;
    const ci = c % GRID;
    const cj = (c / GRID) | 0;
    for (let r = 1; r < GRID && best < 0; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
          const n = j * GRID + i;
          if (road[n] && di * di + dj * dj < bd) {
            bd = di * di + dj * dj;
            best = n;
          }
        }
      }
    }
    near[c] = best;
  }
  return near;
}

interface BuildingInput {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  baseY: number;
  type: BType;
  sclass: SClass;
  district: number;
  year: number;
  cell: number;
  asset: number;
  style: number;
}

class BuildingsBuilder {
  items: BuildingInput[] = [];
  // mutable views used for the landmark tweak before finish()
  h: number[] = [];
  w: number[] = [];
  d: number[] = [];
  sclass: number[] = [];
  year: number[] = [];
  type: number[] = [];
  style: number[] = [];

  add(b: BuildingInput): number {
    this.items.push(b);
    this.h.push(b.h);
    this.w.push(b.w);
    this.d.push(b.d);
    this.sclass.push(b.sclass);
    this.year.push(b.year);
    this.type.push(b.type);
    this.style.push(b.style);
    return this.items.length - 1;
  }

  finish(): Buildings {
    const n = this.items.length;
    const out: Buildings = {
      count: n,
      x: new Float32Array(n),
      z: new Float32Array(n),
      w: new Float32Array(n),
      d: new Float32Array(n),
      h: new Float32Array(n),
      baseY: new Float32Array(n),
      type: new Uint8Array(n),
      sclass: new Uint8Array(n),
      district: new Uint8Array(n),
      floors: new Uint8Array(n),
      year: new Uint16Array(n),
      cell: new Int32Array(n),
      node: new Int32Array(n),
      residents: new Float32Array(n),
      value: new Float32Array(n),
      fuel: new Float32Array(n),
      substation: new Int16Array(n),
      asset: new Int16Array(n),
      style: new Uint8Array(n),
    };
    for (let k = 0; k < n; k++) {
      const b = this.items[k];
      out.x[k] = b.x;
      out.z[k] = b.z;
      out.w[k] = this.w[k];
      out.d[k] = this.d[k];
      out.h[k] = this.h[k];
      out.baseY[k] = b.baseY;
      out.type[k] = this.type[k];
      out.sclass[k] = this.sclass[k];
      out.district[k] = b.district;
      out.year[k] = this.year[k];
      out.cell[k] = b.cell;
      out.asset[k] = b.asset;
      out.style[k] = this.style[k];
    }
    return out;
  }
}

export function terrainModelFor(city: City): TerrainModel {
  return new TerrainModel(city.seed);
}

export { HALF };
