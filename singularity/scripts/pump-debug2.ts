import { Simulation } from '../src/sim/engine';
import { baseScenario } from '../src/sim/scenario';
import { generateCity } from '../src/sim/city/generate';
import { N_CELLS } from '../src/sim/config';
const city = generateCity(20260927);
const run = (fail: boolean, shared: boolean) => {
  const cmds: any[] = [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'rain', rate: 60, durationMin: 60 } }];
  if (fail) [13, 14, 15].forEach((id, k) => cmds.push({ id: 2 + k, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: id, action: 'damage' } }));
  const sim = new Simulation(baseScenario({ agents: 800, durationMin: 120, commands: cmds }), shared ? city : undefined);
  for (let k = 0; k < 1500; k++) sim.step();
  let v = 0;
  for (let c = 0; c < N_CELLS; c++) if (sim.city.pumpCatchment[c] >= 0) v += sim.s.water[c];
  return `${v.toFixed(3)} ${sim.checksum().toString(16)}`;
};
console.log('ok shared', run(false, true));
console.log('fail shared', run(true, true));
console.log('ok shared again', run(false, true));
console.log('ok fresh', run(false, false));
