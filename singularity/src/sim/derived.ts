import { CELL, CELL_AREA, GRID, HALF, N_CELLS, WX_GRID, cellX, cellZ } from './config';
import { BType, type AssetKind, type City, Zone } from './types';

/** Static, deterministic data derived once from the city (never snapshotted). */
export interface Derived {
  cellBuildStart: Int32Array;
  cellBuild: Int32Array;
  cellRoof: Float32Array; // tallest roof elevation per cell (m)
  fuelLoad: Float32Array; // initial fire load per cell
  manning: Float32Array;
  infiltration: Float32Array; // m/s at dry soil
  wxOfCell: Uint16Array;
  edgeDistrict: Uint8Array;
  edgeMid: Float32Array; // x,z per edge
  assetsByKind: Record<AssetKind, number[]>;
  gridNodes: number[]; // sources, transmission and distribution substations (in dependency order)
  consumers: number[];
  homes: Int32Array;
  homeCum: Float64Array;
  works: Int32Array;
  workCum: Float64Array;
  leisure: Int32Array;
  lightningTargets: { x: number; z: number; asset: number; h: number }[];
  hospitalEdges: number[][]; // road edges within 700 m of each hospital (for isolation causes)
  coreNode: number;
  districtCount: number;
  landMask: Uint8Array;
  pumpCells: number[][]; // per pump asset id (sparse array)
  cellNode: Int32Array; // nearest road node for every cell (through land where possible)
  edgeOutflow: number[]; // land cells on the domain border (free outflow)
  leveeCells: number[];
}

export function deriveStatic(city: City): Derived {
  const b = city.buildings;
  const count = new Int32Array(N_CELLS);
  for (let k = 0; k < b.count; k++) count[b.cell[k]]++;
  const cellBuildStart = new Int32Array(N_CELLS + 1);
  for (let c = 0; c < N_CELLS; c++) cellBuildStart[c + 1] = cellBuildStart[c] + count[c];
  const fill = new Int32Array(N_CELLS);
  const cellBuild = new Int32Array(b.count);
  const cellRoof = new Float32Array(N_CELLS);
  for (let k = 0; k < b.count; k++) {
    const c = b.cell[k];
    cellBuild[cellBuildStart[c] + fill[c]++] = k;
    cellRoof[c] = Math.max(cellRoof[c], b.baseY[k] + b.h[k]);
  }
  for (let c = 0; c < N_CELLS; c++) if (cellRoof[c] === 0) cellRoof[c] = Math.max(0, city.terrain[c]);

  const fuelLoad = new Float32Array(N_CELLS);
  const manning = new Float32Array(N_CELLS);
  const infiltration = new Float32Array(N_CELLS);
  const landMask = new Uint8Array(N_CELLS);
  const mmh = 1 / 1000 / 3600;
  for (let c = 0; c < N_CELLS; c++) {
    let f = city.vegetation[c];
    for (let k = cellBuildStart[c]; k < cellBuildStart[c + 1]; k++) {
      const i = cellBuild[k];
      const cover = (b.w[i] * b.d[i]) / CELL_AREA;
      f += b.fuel[i] * cover * Math.min(1.4, 0.55 + b.floors[i] / 10);
    }
    fuelLoad[c] = Math.min(1.3, f);
    const z = city.zone[c];
    landMask[c] = z !== Zone.Ocean && z !== Zone.River ? 1 : 0;
    if (city.road[c]) {
      manning[c] = 0.025;
      infiltration[c] = 1 * mmh;
    } else if (z === Zone.Ocean || z === Zone.River) {
      manning[c] = 0.03;
      infiltration[c] = 0;
    } else if (z === Zone.Park || z === Zone.Forest || z === Zone.Shore) {
      manning[c] = 0.05;
      infiltration[c] = (z === Zone.Shore ? 25 : 14) * mmh;
    } else {
      manning[c] = 0.06; // buildings obstruct flow
      infiltration[c] = (z === Zone.Residential ? 5 : 2) * mmh;
    }
  }

  const wxOfCell = new Uint16Array(N_CELLS);
  const r = GRID / WX_GRID;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) wxOfCell[j * GRID + i] = Math.floor(j / r) * WX_GRID + Math.floor(i / r);

  const g = city.roads;
  const edgeDistrict = new Uint8Array(g.edgeCount);
  const edgeMid = new Float32Array(g.edgeCount * 2);
  for (let e = 0; e < g.edgeCount; e++) {
    const s0 = g.edgeCellStart[e];
    const s1 = g.edgeCellStart[e + 1];
    const mid = g.edgeCells[(s0 + s1) >> 1];
    edgeDistrict[e] = Math.max(0, city.district[mid]);
    edgeMid[e * 2] = (g.nodeX[g.edgeA[e]] + g.nodeX[g.edgeB[e]]) / 2;
    edgeMid[e * 2 + 1] = (g.nodeZ[g.edgeA[e]] + g.nodeZ[g.edgeB[e]]) / 2;
  }

  const assetsByKind = {} as Record<AssetKind, number[]>;
  for (const k of ['plant', 'import', 'tx', 'sub', 'pump', 'water', 'hospital', 'fire', 'shelter', 'hub', 'tower', 'eoc'] as AssetKind[]) assetsByKind[k] = [];
  for (const a of city.assets) assetsByKind[a.kind].push(a.id);
  const gridNodes = [...assetsByKind.plant, ...assetsByKind.import, ...assetsByKind.tx, ...assetsByKind.sub];
  const consumers = city.assets.filter((a) => a.substation >= 0).map((a) => a.id);

  const homesL: number[] = [];
  const homeW: number[] = [];
  const worksL: number[] = [];
  const workW: number[] = [];
  const leisureL: number[] = [];
  for (let k = 0; k < b.count; k++) {
    const t = b.type[k];
    if (t === BType.House || t === BType.Apartment) {
      homesL.push(k);
      homeW.push(Math.max(1, b.residents[k]));
    }
    if (t === BType.Office || t === BType.Tower || t === BType.Retail || t === BType.Warehouse || t === BType.Factory || t === BType.Hospital || t === BType.Civic) {
      worksL.push(k);
      workW.push(b.w[k] * b.d[k] * b.floors[k]);
    }
    if (t === BType.Retail) leisureL.push(k);
  }
  const cum = (w: number[]) => {
    const out = new Float64Array(w.length);
    let s = 0;
    for (let k = 0; k < w.length; k++) {
      s += w[k];
      out[k] = s;
    }
    return out;
  };

  const lightningTargets: Derived['lightningTargets'] = [];
  for (const a of city.assets) if (a.kind === 'tower' || a.kind === 'sub' || a.kind === 'tx') lightningTargets.push({ x: a.x, z: a.z, asset: a.id, h: a.kind === 'tower' ? 90 : 25 });
  for (let k = 0; k < b.count; k++) if (b.h[k] > 160) lightningTargets.push({ x: b.x[k], z: b.z[k], asset: -1, h: b.h[k] });

  const hospitalEdges = city.assets.map((a) => {
    if (a.kind !== 'hospital') return [];
    const out: number[] = [];
    for (let e = 0; e < g.edgeCount; e++) {
      if ((edgeMid[e * 2] - a.x) ** 2 + (edgeMid[e * 2 + 1] - a.z) ** 2 < 900 * 900) out.push(e);
    }
    return out;
  });

  // Network "core": best-connected node near the geographic middle of the city.
  let coreNode = 0;
  let best = -Infinity;
  const midX = -100;
  const midZ = -500;
  for (let n = 0; n < g.nodeCount; n++) {
    const deg = g.adjStart[n + 1] - g.adjStart[n];
    const score = deg * 200 - Math.hypot(g.nodeX[n] - midX, g.nodeZ[n] - midZ);
    if (score > best) {
      best = score;
      coreNode = n;
    }
  }

  const pumpCells: number[][] = [];
  for (let c = 0; c < N_CELLS; c++) {
    const p = city.pumpCatchment[c];
    if (p >= 0) (pumpCells[p] ??= []).push(c);
  }
  const leveeCells: number[] = [];
  for (let c = 0; c < N_CELLS; c++) if (city.leveeHeight[c] > 0) leveeCells.push(c);

  // Nearest road node per cell: BFS from node cells over land, then over everything.
  const cellNode = new Int32Array(N_CELLS).fill(-1);
  const queue = new Int32Array(N_CELLS);
  for (let pass = 0; pass < 2; pass++) {
    let head = 0;
    let tail = 0;
    for (let c = 0; c < N_CELLS; c++) if (cellNode[c] >= 0) queue[tail++] = c;
    if (pass === 0) {
      for (let n = 0; n < g.nodeCount; n++) {
        const c = g.nodeCell[n];
        if (cellNode[c] < 0) {
          cellNode[c] = n;
          queue[tail++] = c;
        }
      }
    }
    while (head < tail) {
      const c = queue[head++];
      const i = c % GRID;
      const j = (c / GRID) | 0;
      for (let k = 0; k < 4; k++) {
        const ni = i + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const nj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
        const n = nj * GRID + ni;
        if (cellNode[n] >= 0) continue;
        if (pass === 0 && !landMask[n]) continue;
        cellNode[n] = cellNode[c];
        queue[tail++] = n;
      }
    }
  }

  return {
    cellBuildStart,
    cellBuild,
    cellRoof,
    fuelLoad,
    manning,
    infiltration,
    wxOfCell,
    edgeDistrict,
    edgeMid,
    assetsByKind,
    gridNodes,
    consumers,
    homes: Int32Array.from(homesL),
    homeCum: cum(homeW),
    works: Int32Array.from(worksL),
    workCum: cum(workW),
    leisure: Int32Array.from(leisureL.length ? leisureL : worksL),
    lightningTargets,
    hospitalEdges,
    coreNode,
    districtCount: city.districts.length,
    landMask,
    pumpCells,
    leveeCells,
    cellNode,
    edgeOutflow: (() => {
      const out: number[] = [];
      const inflow = new Set(city.riverInflow);
      for (let c = 0; c < N_CELLS; c++) {
        const i = c % GRID;
        const j = (c / GRID) | 0;
        if (!(i === 0 || j === 0 || i === GRID - 1 || j === GRID - 1)) continue;
        if (city.ocean[c] || inflow.has(c) || city.zone[c] === Zone.River || city.pumpCatchment[c] >= 0 || city.leveeHeight[c] > 0) continue;
        out.push(c);
      }
      return out;
    })(),
  };
}

/** Binary search a cumulative weight table. */
export function pickWeighted(cum: Float64Array, u: number): number {
  const target = u * cum[cum.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function cellOfXZ(x: number, z: number): number {
  const i = Math.min(GRID - 1, Math.max(0, Math.floor((x + HALF) / CELL)));
  const j = Math.min(GRID - 1, Math.max(0, Math.floor((z + HALF) / CELL)));
  return j * GRID + i;
}

export { cellX, cellZ };
