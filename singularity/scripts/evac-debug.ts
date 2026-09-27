import { Simulation } from '../src/sim/engine';
import { builtinScenarios } from '../src/sim/scenario';
const sc = builtinScenarios().find((s) => s.id === (process.argv[2] ?? 'showcase'))!;
const sim = new Simulation(sc);
for (let k = 0; k < 2700; k++) sim.step();
const A = sim.s.agents;
let ev = 0, strandedInf = 0, moving = 0, stuck = 0, atShelterFull = 0;
for (let a = 0; a < A.count; a++) {
  if (A.state[a] !== 2) continue;
  ev++;
  const n = A.node[a];
  if (A.edge[a] >= 0) moving++;
  else if (sim.s.shelterDist[n] === Infinity) strandedInf++;
  else if (sim.s.shelterDist[n] === 0) atShelterFull++;
  else stuck++;
}
console.log({ ev, moving, strandedInf, stuck, atShelterFull, shelters: sim.d.assetsByKind.shelter.map((id) => [sim.city.assets[id].name, sim.s.aLoad[id], sim.city.assets[id].capacity, sim.s.aOperational[id]]) });
const byD: Record<string, number> = {};
const why: Record<string, number> = {};
for (let a = 0; a < A.count; a++) {
  if (A.state[a] !== 2 || A.edge[a] >= 0) continue;
  const n = A.node[a];
  if (sim.s.shelterDist[n] !== Infinity) continue;
  const c = sim.city.roads.nodeCell[n];
  const dn = sim.city.districts[sim.city.district[c]]?.name ?? 'none';
  byD[dn] = (byD[dn] ?? 0) + 1;
  const g = sim.city.roads;
  let bits = 0;
  for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) bits |= sim.s.eClosed[g.adjEdge[k]];
  why[bits] = (why[bits] ?? 0) + 1;
}
console.log(byD, why, 'water at node sample', sim.s.water[sim.city.roads.nodeCell[A.node[A.state.findIndex((v, i) => v === 2 && sim.s.shelterDist[A.node[i]] === Infinity)]]]);
import { dijkstra, MASK_FOOT } from '../src/sim/systems/routing';
{
  const g = sim.city.roads;
  const hop = new Int16Array(g.nodeCount), dist = new Float32Array(g.nodeCount), org = new Int16Array(g.nodeCount);
  const shel = sim.d.assetsByKind.shelter.map((id) => sim.city.assets[id].node);
  dijkstra(g, shel, sim.s.eClosed, hop, dist, org, sim.heap, sim.s.brDS, 0, MASK_FOOT);
  let inf = 0; for (let n = 0; n < g.nodeCount; n++) if (dist[n] === Infinity) inf++;
  let inf2 = 0; for (let n = 0; n < g.nodeCount; n++) if (sim.s.shelterDist[n] === Infinity) inf2++;
  console.log('fresh foot-dijkstra unreachable nodes', inf, 'state table unreachable', inf2, 'routingDirty', sim.s.routingDirty, 'tick', sim.s.tick);
  console.log('shelter nodes', shel, 'closed around shelters', shel.map((n) => { let b = 0; for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) b |= sim.s.eClosed[g.adjEdge[k]]; return b; }));
}
{
  const g = sim.city.roads;
  const hop = new Int16Array(g.nodeCount), dist = new Float32Array(g.nodeCount), org = new Int16Array(g.nodeCount);
  const shel = sim.d.assetsByKind.shelter.map((id) => sim.city.assets[id].node);
  dijkstra(g, shel, sim.s.eClosed, hop, dist, org, sim.heap, sim.s.brDS, 0, MASK_FOOT);
  const byD: Record<string, number> = {};
  const cut: Record<string, number> = {};
  for (let n = 0; n < g.nodeCount; n++) {
    if (dist[n] !== Infinity) continue;
    const dn = sim.city.districts[sim.city.district[g.nodeCell[n]]]?.name ?? 'none';
    byD[dn] = (byD[dn] ?? 0) + 1;
    for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) {
      const m = g.adjNode[k];
      if (dist[m] !== Infinity) { const b = sim.s.eClosed[g.adjEdge[k]]; cut[b] = (cut[b] ?? 0) + 1; }
    }
  }
  console.log('unreachable by district', byD, 'boundary edge flags', cut);
  // same with no closures at all
  const none = new Uint8Array(g.edgeCount);
  dijkstra(g, shel, none, hop, dist, org, sim.heap, undefined, 0, MASK_FOOT);
  let inf = 0; for (let n = 0; n < g.nodeCount; n++) if (dist[n] === Infinity) inf++;
  console.log('unreachable with no closures', inf);
}
