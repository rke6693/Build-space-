import { CELL, GRID, HALF, N_CELLS, cellX, cellZ } from '../config';
import { RoadKind, type RoadGraph } from '../types';

/**
 * Converts a road cell mask into a graph: nodes are junctions, corners and dead ends;
 * edges are straight chains of road cells between nodes (endpoints included).
 * Only the largest connected component is kept so every node is mutually reachable
 * on an undamaged network.
 */
export function buildRoadGraph(
  road: Uint8Array,
  isArterialLine: (i: number, j: number) => boolean,
  riverSide?: (x: number, z: number) => number,
): { graph: RoadGraph; roadEdge: Int32Array; cellNode: Int32Array } {
  pruneToLargestComponent(road);

  const nb = (c: number, dir: number): number => {
    const i = c % GRID;
    const j = (c / GRID) | 0;
    switch (dir) {
      case 0:
        return i < GRID - 1 && road[c + 1] ? c + 1 : -1; // east
      case 1:
        return j < GRID - 1 && road[c + GRID] ? c + GRID : -1; // south
      case 2:
        return i > 0 && road[c - 1] ? c - 1 : -1; // west
      default:
        return j > 0 && road[c - GRID] ? c - GRID : -1; // north
    }
  };

  const cellNode = new Int32Array(N_CELLS).fill(-1);
  const nodeCells: number[] = [];
  for (let c = 0; c < N_CELLS; c++) {
    if (!road[c]) continue;
    const e = nb(c, 0) >= 0;
    const s = nb(c, 1) >= 0;
    const w = nb(c, 2) >= 0;
    const n = nb(c, 3) >= 0;
    const count = +e + +s + +w + +n;
    const straight = count === 2 && ((e && w) || (n && s));
    if (count !== 2 || !straight) {
      cellNode[c] = nodeCells.length;
      nodeCells.push(c);
    }
  }
  // Pure loops without junctions cannot occur on a grid mask, but guard anyway.
  if (nodeCells.length === 0) {
    for (let c = 0; c < N_CELLS; c++) {
      if (road[c]) {
        cellNode[c] = 0;
        nodeCells.push(c);
        break;
      }
    }
  }

  const edgeA: number[] = [];
  const edgeB: number[] = [];
  const edgeKind: number[] = [];
  const edgeCellsList: number[][] = [];
  const roadEdge = new Int32Array(N_CELLS).fill(-1);

  for (const start of nodeCells) {
    for (let dir = 0; dir < 4; dir++) {
      let cur = nb(start, dir);
      if (cur < 0) continue;
      const cells = [start];
      while (cur >= 0 && cellNode[cur] < 0) {
        cells.push(cur);
        cur = nb(cur, dir);
      }
      if (cur < 0) continue; // should not happen: chains end at nodes
      cells.push(cur);
      const a = cellNode[start];
      const b = cellNode[cur];
      if (a > b || (a === b)) continue; // record each edge once (from the lower id)
      const horizontal = dir === 0 || dir === 2;
      let kind = RoadKind.Street;
      let bridge = false;
      for (const cc of cells) if (road[cc] === RoadKind.Bridge) bridge = true;
      if (bridge) kind = RoadKind.Bridge;
      else {
        const i = start % GRID;
        const j = (start / GRID) | 0;
        if (horizontal ? isArterialLine(3, j) : isArterialLine(i, 3)) kind = RoadKind.Arterial;
      }
      const id = edgeA.length;
      edgeA.push(a);
      edgeB.push(b);
      edgeKind.push(kind);
      edgeCellsList.push(cells);
      for (let k = 1; k < cells.length - 1; k++) roadEdge[cells[k]] = id;
      if (roadEdge[start] < 0) roadEdge[start] = id;
      if (roadEdge[cur] < 0) roadEdge[cur] = id;
    }
  }

  const nodeCount = nodeCells.length;
  const edgeCount = edgeA.length;
  const nodeX = new Float32Array(nodeCount);
  const nodeZ = new Float32Array(nodeCount);
  const nodeCell = new Int32Array(nodeCount);
  for (let k = 0; k < nodeCount; k++) {
    const c = nodeCells[k];
    nodeCell[k] = c;
    nodeX[k] = cellX(c % GRID);
    nodeZ[k] = cellZ((c / GRID) | 0);
  }
  const edgeLen = new Float32Array(edgeCount);
  const edgeCap = new Float32Array(edgeCount);
  const edgeCellStart = new Int32Array(edgeCount + 1);
  let total = 0;
  for (let e = 0; e < edgeCount; e++) {
    edgeCellStart[e] = total;
    total += edgeCellsList[e].length;
  }
  edgeCellStart[edgeCount] = total;
  const edgeCells = new Int32Array(total);
  for (let e = 0; e < edgeCount; e++) {
    edgeCells.set(edgeCellsList[e], edgeCellStart[e]);
    edgeLen[e] = (edgeCellsList[e].length - 1) * CELL;
    const lanes = edgeKind[e] === RoadKind.Street ? 1 : 2;
    edgeCap[e] = Math.max(2, (edgeLen[e] / 9) * lanes);
  }

  // CSR adjacency
  const deg = new Int32Array(nodeCount);
  for (let e = 0; e < edgeCount; e++) {
    deg[edgeA[e]]++;
    deg[edgeB[e]]++;
  }
  const adjStart = new Int32Array(nodeCount + 1);
  for (let n = 0; n < nodeCount; n++) adjStart[n + 1] = adjStart[n] + deg[n];
  const fill = new Int32Array(nodeCount);
  const adjEdge = new Int32Array(adjStart[nodeCount]);
  const adjNode = new Int32Array(adjStart[nodeCount]);
  for (let e = 0; e < edgeCount; e++) {
    const a = edgeA[e];
    const b = edgeB[e];
    adjEdge[adjStart[a] + fill[a]] = e;
    adjNode[adjStart[a] + fill[a]++] = b;
    adjEdge[adjStart[b] + fill[b]] = e;
    adjNode[adjStart[b] + fill[b]++] = a;
  }

  // Routing zones: 4x4 macro tiles split by river bank.
  const rawZone = new Int32Array(nodeCount);
  const zoneMap = new Map<number, number>();
  for (let n = 0; n < nodeCount; n++) {
    const qx = Math.min(3, Math.max(0, Math.floor((nodeX[n] + HALF) / 1024)));
    const qz = Math.min(3, Math.max(0, Math.floor((nodeZ[n] + HALF) / 1024)));
    const side = riverSide ? riverSide(nodeX[n], nodeZ[n]) : 0;
    const key = (qz * 4 + qx) * 2 + side;
    if (!zoneMap.has(key)) zoneMap.set(key, zoneMap.size);
    rawZone[n] = zoneMap.get(key)!;
  }
  const zoneCount = zoneMap.size;
  const nodeZone = new Uint8Array(nodeCount);
  const cx = new Float64Array(zoneCount);
  const cz = new Float64Array(zoneCount);
  const cn = new Float64Array(zoneCount);
  for (let n = 0; n < nodeCount; n++) {
    nodeZone[n] = rawZone[n];
    cx[rawZone[n]] += nodeX[n];
    cz[rawZone[n]] += nodeZ[n];
    cn[rawZone[n]]++;
  }
  const zoneTarget = new Int32Array(zoneCount).fill(-1);
  const zoneBest = new Float64Array(zoneCount).fill(Infinity);
  for (let n = 0; n < nodeCount; n++) {
    const z = rawZone[n];
    // prefer well-connected nodes near the centroid
    const d = (nodeX[n] - cx[z] / cn[z]) ** 2 + (nodeZ[n] - cz[z] / cn[z]) ** 2 - (adjStart[n + 1] - adjStart[n]) * 400;
    if (d < zoneBest[z]) {
      zoneBest[z] = d;
      zoneTarget[z] = n;
    }
  }

  const graph: RoadGraph = {
    nodeCount,
    nodeX,
    nodeZ,
    nodeCell,
    nodeZone,
    edgeCount,
    edgeA: Int32Array.from(edgeA),
    edgeB: Int32Array.from(edgeB),
    edgeLen,
    edgeKind: Uint8Array.from(edgeKind),
    edgeCap,
    edgeBridge: new Int16Array(edgeCount).fill(-1),
    edgeCellStart,
    edgeCells,
    adjStart,
    adjEdge,
    adjNode,
    zoneCount,
    zoneTarget,
  };
  return { graph, roadEdge, cellNode };
}

function pruneToLargestComponent(road: Uint8Array) {
  const comp = new Int32Array(N_CELLS).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let c = 0; c < N_CELLS; c++) {
    if (!road[c] || comp[c] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    comp[c] = id;
    stack.push(c);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const i = k % GRID;
      const j = (k / GRID) | 0;
      const nbs = [i > 0 ? k - 1 : -1, i < GRID - 1 ? k + 1 : -1, j > 0 ? k - GRID : -1, j < GRID - 1 ? k + GRID : -1];
      for (const n of nbs) {
        if (n >= 0 && road[n] && comp[n] < 0) {
          comp[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  let best = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[best]) best = k;
  for (let c = 0; c < N_CELLS; c++) if (road[c] && comp[c] !== best) road[c] = 0;
}
