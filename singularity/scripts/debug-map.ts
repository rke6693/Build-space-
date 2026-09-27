/* Renders the generated city (zones, roads, buildings, assets) to a PNG for inspection. */
import { generateCity } from '../src/sim/city/generate';
import { GRID, HALF, CELL } from '../src/sim/config';
import { writePng } from './png';

const seed = Number(process.argv[2] ?? 20260927);
const out = process.argv[3] ?? 'city-map.png';
const t0 = performance.now();
const city = generateCity(seed);
console.log(`generated in ${(performance.now() - t0).toFixed(0)} ms`);
const S = 6; // px per cell
const W = GRID * S;
const img = new Uint8Array(W * W * 3);
const zoneCol: [number, number, number][] = [
  [20, 40, 80], [40, 90, 160], [200, 190, 150], [70, 140, 70], [30, 90, 40],
  [150, 140, 120], [170, 150, 170], [120, 120, 150], [140, 110, 80], [110, 100, 90],
];
const set = (x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const k = (y * W + x) * 3;
  img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
};
for (let c = 0; c < GRID * GRID; c++) {
  const i = c % GRID, j = (c / GRID) | 0;
  let col = zoneCol[city.zone[c]];
  const h = city.terrain[c];
  const shade = Math.max(0.55, Math.min(1.25, 0.8 + h / 120));
  col = [col[0] * shade, col[1] * shade, col[2] * shade].map((v) => Math.min(255, v)) as [number, number, number];
  if (city.zone[c] !== 0 && city.zone[c] !== 1 && h < 0) col = [col[0] * 0.6, col[1] * 0.6, col[2] + 40] as [number, number, number];
  if (city.leveeHeight[c] > 0) col = [230, 230, 60];
  if (city.road[c] === 1) col = [60, 60, 60];
  if (city.road[c] === 2) col = [30, 30, 30];
  if (city.road[c] === 3) col = [255, 80, 200];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(i * S + x, j * S + y, col);
}
const toPx = (v: number) => Math.round(((v + HALF) / CELL) * S);
const b = city.buildings;
for (let k = 0; k < b.count; k++) {
  const x0 = toPx(b.x[k] - b.w[k] / 2), x1 = toPx(b.x[k] + b.w[k] / 2);
  const y0 = toPx(b.z[k] - b.d[k] / 2), y1 = toPx(b.z[k] + b.d[k] / 2);
  const t = Math.min(1, b.h[k] / 200);
  const col: [number, number, number] = [220 - t * 100, 220 - t * 60, 230];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, col);
}
const kindCol: Record<string, [number, number, number]> = {
  plant: [255, 0, 0], import: [255, 0, 0], tx: [255, 140, 0], sub: [255, 220, 0], pump: [0, 200, 255], water: [0, 120, 255],
  hospital: [255, 255, 255], fire: [255, 60, 60], shelter: [60, 255, 120], hub: [200, 0, 255], tower: [255, 0, 255], eoc: [255, 255, 255],
};
for (const a of city.assets) {
  const cx = toPx(a.x), cy = toPx(a.z);
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (Math.abs(x) + Math.abs(y) <= 5) set(cx + x, cy + y, kindCol[a.kind]);
}
for (const l of city.lines) {
  const a = city.assets[l.a], bb = city.assets[l.b];
  for (let t = 0; t <= 1; t += 0.002) set(toPx(a.x + (bb.x - a.x) * t), toPx(a.z + (bb.z - a.z) * t), [255, 200, 0]);
}
writePng(out, W, W, img);
const rg = city.roads;
console.log(JSON.stringify({
  buildings: b.count, nodes: rg.nodeCount, edges: rg.edgeCount, zones: rg.zoneCount, bridges: city.bridges.map((x) => x.name + '@' + x.year),
  levees: city.levees.map((l) => `${l.name}:${l.cells.length}`), assets: city.assets.length, lines: city.lines.length, stats: city.stats,
  districts: city.districts.map((d) => `${d.name}:${d.cells}`), riverInflow: city.riverInflow.length,
  maxH: Math.max(...b.h), pumps: city.assets.filter((a) => a.kind === 'pump').map((a) => a.name),
}, null, 1));
