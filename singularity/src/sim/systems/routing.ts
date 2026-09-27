import { ROUTING_INTERVAL } from '../config';
import type { Simulation } from '../engine';
import { RoadKind, type RoadGraph } from '../types';

export const CLOSED_FLOOD = 1; // > 30 cm: impassable for vehicles
export const CLOSED_DEBRIS = 2; // collapse debris: vehicles blocked, pedestrians can pass
export const CLOSED_FIRE = 4; // impassable
export const CLOSED_STRUCT = 8; // bridge out of service: impassable
export const CLOSED_DEEP = 16; // > 60 cm of water: impassable on foot too
export const CLOSED_PAVEMENT = 32; // settlement cracks: vehicles blocked
export const MASK_VEHICLE = 0xff;
export const MASK_FOOT = CLOSED_FIRE | CLOSED_STRUCT | CLOSED_DEEP;
const REASONS = ['flooding', 'debris', 'fire', 'structural damage'];

/** Binary min-heap over (key, node) pairs with lazy deletion; preallocated typed arrays. */
export class Heap {
  keys: Float64Array;
  vals: Int32Array;
  size = 0;
  constructor(cap: number) {
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }
  clear() {
    this.size = 0;
  }
  push(k: number, v: number) {
    if (this.size >= this.keys.length) {
      const nk = new Float64Array(this.keys.length * 2);
      nk.set(this.keys);
      const nv = new Int32Array(this.vals.length * 2);
      nv.set(this.vals);
      this.keys = nk;
      this.vals = nv;
    }
    let i = this.size++;
    const keys = this.keys;
    const vals = this.vals;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= k) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  /** Pops the minimum; returns node id and writes its key to `this.lastKey`. */
  lastKey = 0;
  pop(): number {
    const keys = this.keys;
    const vals = this.vals;
    const top = vals[0];
    this.lastKey = keys[0];
    const n = --this.size;
    if (n > 0) {
      const k = keys[n];
      const v = vals[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= k) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}

export function edgeCost(g: RoadGraph, e: number, closed: Uint8Array, bridgeDS?: Uint8Array, mask = MASK_VEHICLE): number {
  if (closed[e] & mask) return Infinity;
  const kind = g.edgeKind[e];
  const speed = kind === RoadKind.Street ? 9 : 14;
  let c = g.edgeLen[e] / speed;
  if (kind === RoadKind.Bridge && bridgeDS && g.edgeBridge[e] >= 0 && bridgeDS[g.edgeBridge[e]] === 2) c *= 2.5;
  return c;
}

/**
 * Multi-source Dijkstra. Writes, for every node, the edge to take towards the nearest
 * source (`hop`, -1 at sources/unreachable), the travel time (`dist`) and the source
 * index (`origin`).
 */
export function dijkstra(
  g: RoadGraph,
  sources: number[],
  closed: Uint8Array,
  hop: Int16Array,
  dist: Float32Array,
  origin: Int16Array | null,
  heap: Heap,
  bridgeDS?: Uint8Array,
  hopOffset = 0,
  mask = MASK_VEHICLE,
) {
  const N = g.nodeCount;
  for (let n = 0; n < N; n++) {
    dist[n] = Infinity;
    hop[hopOffset + n] = -1;
    if (origin) origin[n] = -1;
  }
  heap.clear();
  for (let k = 0; k < sources.length; k++) {
    const sN = sources[k];
    if (sN < 0 || sN >= N) continue;
    if (dist[sN] === 0) continue;
    dist[sN] = 0;
    if (origin) origin[sN] = k;
    heap.push(0, sN);
  }
  while (heap.size > 0) {
    const n = heap.pop();
    const dn = heap.lastKey;
    if (dn > dist[n]) continue;
    for (let a = g.adjStart[n]; a < g.adjStart[n + 1]; a++) {
      const e = g.adjEdge[a];
      const c = edgeCost(g, e, closed, bridgeDS, mask);
      if (c === Infinity) continue;
      const m = g.adjNode[a];
      const nd = dn + c;
      if (nd < dist[m]) {
        dist[m] = nd;
        hop[hopOffset + m] = e;
        if (origin) origin[m] = origin[n];
        // push the stored (possibly float32-rounded) value so the staleness check stays exact
        heap.push(dist[m], m);
      }
    }
  }
}

/** Evaluates road closures each tick and aggregates new closures into causal events. */
export function updateRoads(sim: Simulation) {
  const s = sim.s;
  const g = sim.city.roads;
  const d = sim.d;
  const nd = d.districtCount;
  const newCount = sim.closureCount;
  newCount.fill(0);
  const newCauses = sim.closureCauses;
  for (let k = 0; k < newCauses.length; k++) newCauses[k].length = 0;
  let changed = false;
  const brDS = s.brDS;
  for (let e = 0; e < g.edgeCount; e++) {
    const prev = s.eClosed[e];
    let flags = 0;
    let maxDepth = 0;
    let deepCell = -1;
    let maxBurn = 0;
    let burnCell = -1;
    let maxSettle = 0;
    for (let k = g.edgeCellStart[e]; k < g.edgeCellStart[e + 1]; k++) {
      const c = g.edgeCells[k];
      const w = s.water[c];
      if (w > maxDepth) {
        maxDepth = w;
        deepCell = c;
      }
      const b = s.burn[c];
      if (b > maxBurn) {
        maxBurn = b;
        burnCell = c;
      }
      const st = s.settlement[c];
      if (st > maxSettle) maxSettle = st;
    }
    // Bridge decks sit above the river: only the approach cells can flood.
    const isBridge = g.edgeKind[e] === RoadKind.Bridge;
    if (!isBridge && (maxDepth > 0.3 || ((prev & CLOSED_FLOOD) && maxDepth > 0.15))) flags |= CLOSED_FLOOD;
    if (!isBridge && (maxDepth > 0.6 || ((prev & CLOSED_DEEP) && maxDepth > 0.45))) flags |= CLOSED_DEEP;
    if (s.eDebris[e]) flags |= CLOSED_DEBRIS;
    if (maxBurn > 0.35 || ((prev & CLOSED_FIRE) && maxBurn > 0.1)) flags |= CLOSED_FIRE;
    const br = g.edgeBridge[e];
    if (br >= 0 && brDS[br] >= 3) flags |= CLOSED_STRUCT;
    if (maxSettle > 0.42) flags |= CLOSED_PAVEMENT;
    if (flags === prev) continue;
    changed = true;
    const added = flags & ~prev;
    s.eClosed[e] = flags;
    if (!added) continue;
    const dist = d.edgeDistrict[e];
    for (let r = 0; r < 4; r++) {
      const bits = r === 0 ? CLOSED_FLOOD | CLOSED_DEEP : r === 1 ? CLOSED_DEBRIS : r === 2 ? CLOSED_FIRE : CLOSED_STRUCT | CLOSED_PAVEMENT;
      if (!(added & bits)) continue;
      const slot = dist * 4 + r;
      newCount[slot]++;
      let cause = -1;
      if (r === 0) cause = sim.floodCauses(deepCell)[0] ?? -1;
      else if (r === 1) cause = s.eClosedEvent[e] >= 0 ? s.eClosedEvent[e] : s.episodeEvent;
      else if (r === 2) cause = sim.incidentEventAt(burnCell);
      else cause = br >= 0 && s.brEvent[br] >= 0 ? s.brEvent[br] : s.dLiqEvent[dist] >= 0 ? s.dLiqEvent[dist] : s.episodeEvent;
      if (cause >= 0 && newCauses[slot].length < 6 && !newCauses[slot].includes(cause)) newCauses[slot].push(cause);
      sim.pendingEdgeSlot[e] = slot;
    }
  }
  if (!changed) return;
  sim.routingDirty();
  // Emit at most one aggregated closure event per district and reason every 5 minutes.
  for (let slot = 0; slot < nd * 4; slot++) {
    if (!newCount[slot]) continue;
    const dist = (slot / 4) | 0;
    const r = slot % 4;
    if (s.tick - s.dClosureTick[slot] < 150 && s.dClosureEvent[slot] >= 0) continue;
    const dd = sim.city.districts[dist];
    s.dClosureTick[slot] = s.tick;
    s.dClosureEvent[slot] = sim.emit({
      type: 'road_closure',
      category: 'transport',
      severity: r === 3 ? 2 : 1,
      title: `${newCount[slot]} road segment${newCount[slot] > 1 ? 's' : ''} closed by ${REASONS[r]} in ${dd.name}`,
      detail: r === 0 ? 'Water deeper than 30 cm makes roads impassable for traffic.' : r === 1 ? 'Collapsed buildings block the carriageway.' : r === 2 ? 'Active fire across the roadway.' : 'Bridge or pavement damage (settlement > 42 cm).',
      x: dd.cx,
      z: dd.cz,
      causes: newCauses[slot],
      subject: { kind: 'district', id: dist },
      radius: Math.sqrt(dd.cells) * 32 * 0.8,
    });
  }
  // Attribute each newly closed edge to its aggregated closure event (for downstream causality).
  for (let e = 0; e < g.edgeCount; e++) {
    const slot = sim.pendingEdgeSlot[e];
    if (slot < 0) continue;
    if (s.dClosureEvent[slot] >= 0) s.eClosedEvent[e] = s.dClosureEvent[slot];
    sim.pendingEdgeSlot[e] = -1;
  }
}

/** Recomputes routing tables and accessibility at a fixed cadence when closures changed. */
export function updateRouting(sim: Simulation, force = false) {
  const s = sim.s;
  if (!force && (!s.routingDirty || s.tick % ROUTING_INTERVAL !== 0)) return;
  s.routingDirty = 0;
  s.routingVersion++;
  const g = sim.city.roads;
  const N = g.nodeCount;
  const heap = sim.heap;
  const dist = sim.tmpDist;
  const closed = s.eClosed;

  for (let z = 0; z < g.zoneCount; z++) dijkstra(g, [g.zoneTarget[z]], closed, s.zoneHop, dist, null, heap, s.brDS, z * N);

  const assets = sim.city.assets;
  const shelters = sim.d.assetsByKind.shelter.filter((id) => s.aOperational[id] > 0 && s.aLoad[id] < assets[id].capacity);
  // Evacuees and the injured move on foot or by any means: only fire, deep water and lost bridges stop them.
  dijkstra(g, shelters.map((id) => assets[id].node), closed, s.shelterHop, s.shelterDist, s.shelterOf, heap, s.brDS, 0, MASK_FOOT);
  for (let n = 0; n < N; n++) if (s.shelterOf[n] >= 0) s.shelterOf[n] = shelters[s.shelterOf[n]];

  const hospitals = sim.d.assetsByKind.hospital.filter((id) => s.aOperational[id] > 0);
  dijkstra(g, hospitals.map((id) => assets[id].node), closed, s.hospitalHop, s.hospitalDist, s.hospitalOf, heap, s.brDS, 0, MASK_FOOT);
  for (let n = 0; n < N; n++) if (s.hospitalOf[n] >= 0) s.hospitalOf[n] = hospitals[s.hospitalOf[n]];

  // Reachability: membership of the largest connected component of open roads
  // (robust even if the nominal city-centre node itself is cut off).
  const reach = s.mainReach;
  const comp = sim.tmpComp;
  comp.fill(-1);
  const q = sim.tmpQueue;
  let best = -1;
  let bestSize = 0;
  let ncomp = 0;
  for (let start = 0; start < N; start++) {
    if (comp[start] >= 0) continue;
    const id = ncomp++;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    comp[start] = id;
    while (head < tail) {
      const n = q[head++];
      for (let a = g.adjStart[n]; a < g.adjStart[n + 1]; a++) {
        if (closed[g.adjEdge[a]]) continue;
        const m = g.adjNode[a];
        if (comp[m] < 0) {
          comp[m] = id;
          q[tail++] = m;
        }
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      best = id;
    }
  }
  for (let n = 0; n < N; n++) reach[n] = comp[n] === best ? 1 : 0;

  // Hospital accessibility.
  for (const id of sim.d.assetsByKind.hospital) {
    const a = assets[id];
    const acc = reach[a.node] ? 1 : 0;
    if (acc === s.aAccessible[id]) continue;
    s.aAccessible[id] = acc;
    if (!acc) {
      const causes: number[] = [];
      for (const e of sim.d.hospitalEdges[id]) {
        if (closed[e] && s.eClosedEvent[e] >= 0 && !causes.includes(s.eClosedEvent[e])) causes.push(s.eClosedEvent[e]);
        if (causes.length >= 5) break;
      }
      for (const br of sim.city.bridges) if (s.brDS[br.id] >= 3 && s.brEvent[br.id] >= 0 && causes.length < 6) causes.push(s.brEvent[br.id]);
      s.aEvent[id] = sim.emit({
        type: 'hospital_isolated',
        category: 'health',
        severity: 3,
        title: `${a.name} cut off from the road network`,
        detail: 'No open route connects the hospital to the city core; ambulances and patients cannot reach it.',
        x: a.x,
        z: a.z,
        causes,
        subject: { kind: 'asset', id },
        radius: 800,
      });
    } else {
      sim.emit({
        type: 'hospital_restored',
        category: 'health',
        severity: 1,
        title: `${a.name} reachable again`,
        detail: 'At least one access route has reopened.',
        x: a.x,
        z: a.z,
        causes: [],
        subject: { kind: 'asset', id },
        radius: 800,
      });
    }
  }
  for (const id of sim.d.assetsByKind.shelter) s.aAccessible[id] = reach[assets[id].node];
  for (const id of sim.d.assetsByKind.fire) s.aAccessible[id] = reach[assets[id].node];
}
