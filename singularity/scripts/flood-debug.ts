import { Simulation } from '../src/sim/engine';
import { builtinScenarios } from '../src/sim/scenario';
import { GRID, cellX, cellZ } from '../src/sim/config';
import { ZONE_NAMES } from '../src/sim/types';
const sc = builtinScenarios()[0];
const sim = new Simulation(sc);
const s = sim.s;
const rows: string[] = [];
for (let c = 0; c < GRID * GRID; c++) {
  if (!sim.d.landMask[c] || sim.city.ocean[c]) continue;
  if (s.water[c] > 0.15) rows.push(`${c} (${cellX(c % GRID)},${cellZ((c / GRID) | 0)}) zone ${ZONE_NAMES[sim.city.zone[c]]} d${sim.city.district[c]} terr ${sim.city.terrain[c].toFixed(2)} h ${s.water[c].toFixed(2)}`);
}
console.log(rows.length, 'wet land cells at t=0');
console.log(rows.slice(0, 25).join('\n'));
