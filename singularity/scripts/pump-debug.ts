import { Simulation } from '../src/sim/engine';
import { baseScenario } from '../src/sim/scenario';
import { N_CELLS } from '../src/sim/config';
for (const fail of [false, true]) {
  const cmds: any[] = [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'rain', rate: 60, durationMin: 60 } }];
  if (fail) [13, 14, 15].forEach((id, k) => cmds.push({ id: 2 + k, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: id, action: 'damage' } }));
  const sim = new Simulation(baseScenario({ agents: 800, commands: cmds }), undefined);
  for (let k = 0; k < 1500; k++) {
    sim.step();
    if (k % 300 === 0 || k === 1499) {
      let v = 0, levee = 0;
      for (let c = 0; c < N_CELLS; c++) { if (sim.city.pumpCatchment[c] >= 0) v += sim.s.water[c]; if (sim.city.leveeHeight[c] > 0) levee += sim.s.water[c]; }
      console.log(fail ? 'FAIL' : 'OK  ', k, 'polder sum', v.toFixed(1), 'levee', levee.toFixed(2), 'pumpsOp', [13, 14, 15].map((i) => sim.s.aOperational[i]).join(''), 'pumped', Array.from(sim.pumpedVolume.slice(13, 16)).map((x) => x.toFixed(1)).join('/'), 'rain', sim.s.eff.rainfall.toFixed(1));
    }
  }
}
