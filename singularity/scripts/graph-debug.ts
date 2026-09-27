import { generateCity } from '../src/sim/city/generate';
import { dijkstra, Heap } from '../src/sim/systems/routing';
const city = generateCity(20260927);
const g = city.roads;
const seen = new Uint8Array(g.nodeCount);
const q = [0]; seen[0] = 1;
while (q.length) { const n = q.pop()!; for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) { const m = g.adjNode[k]; if (!seen[m]) { seen[m] = 1; q.push(m); } } }
console.log('BFS reachable', seen.reduce((a, b) => a + b, 0), 'of', g.nodeCount);
const hop = new Int16Array(g.nodeCount), dist = new Float32Array(g.nodeCount);
dijkstra(g, [0], new Uint8Array(g.edgeCount), hop, dist, null, new Heap(16));
let inf = 0; for (let n = 0; n < g.nodeCount; n++) if (dist[n] === Infinity) inf++;
console.log('dijkstra unreachable', inf);
let bad = 0; for (let e = 0; e < g.edgeCount; e++) if (!(g.edgeLen[e] > 0)) bad++;
console.log('edges with len<=0', bad);
