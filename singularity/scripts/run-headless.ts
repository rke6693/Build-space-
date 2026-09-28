/* Runs a scenario headless and prints timing, key events and final metrics. */
import { Simulation } from '../src/sim/engine';
import { builtinScenarios } from '../src/sim/scenario';
import { formatClock } from '../src/sim/math';

const id = process.argv[2] ?? 'showcase';
const minutes = Number(process.argv[3] ?? 150);
const minSev = Number(process.argv[4] ?? 2);
const sc = builtinScenarios().find((s) => s.id === id)!;
sc.durationMin = Math.max(sc.durationMin, minutes);
let t0 = performance.now();
const sim = new Simulation(sc);
console.log(`init ${(performance.now() - t0).toFixed(0)} ms, buildings ${sim.city.buildings.count}, agents ${sim.s.agents.count}, nodes ${sim.city.roads.nodeCount}`);
t0 = performance.now();
const ticks = (minutes * 60) / 2;
let worst = 0;
for (let k = 0; k < ticks; k++) {
  const a = performance.now();
  sim.step();
  worst = Math.max(worst, performance.now() - a);
  if (k % 900 === 0) {
    const m = sim.metrics();
    console.log(`T+${formatClock(sim.tick * 2)} grid ${(m.gridAvailability * 100).toFixed(0)}% roads ${(m.roadAccessibility * 100).toFixed(0)}% flood ${m.floodedAreaKm2.toFixed(3)}km2 max ${m.maxFloodDepth.toFixed(2)}m fires ${m.activeFires} inj ${m.injured} shel ${m.sheltered} (in place ${m.shelterInPlace}) evac ${m.evacuating} (stranded ${m.stranded}) collapsed ${m.bCollapsed} ext ${m.bExtensive} loss $${(m.lossTotal / 1e9).toFixed(2)}B pumps ${m.pumpsOnline}/${m.pumpsTotal} hosp ${m.hospitalsAccessible}/${m.hospitalsTotal}`);
  }
}
const el = performance.now() - t0;
console.log(`${ticks} ticks in ${el.toFixed(0)} ms => ${(el / ticks).toFixed(2)} ms/tick (worst ${worst.toFixed(1)} ms)`);
const byType: Record<string, number> = {};
for (const e of sim.events) byType[e.type] = (byType[e.type] ?? 0) + 1;
console.log('events', sim.events.length, JSON.stringify(byType));
for (const e of sim.events) if (e.severity >= minSev) console.log(`[${formatClock(e.tick * 2)}] s${e.severity} #${e.id} ${e.title} <- ${e.causes.join(',')} | ${e.detail}`);
console.log('checksum', sim.checksum().toString(16), 'NaN repairs', sim.s.repairedNaN);
