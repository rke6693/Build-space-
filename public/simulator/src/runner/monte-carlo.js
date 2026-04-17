// Monte Carlo / DOE runner. Runs N headless trials sequentially on the main
// thread (Rapier WASM only — no Three.js render), yielding to the browser
// between trials so the UI stays responsive. Latin Hypercube sampling over the
// input distributions. Aggregates into Cpk + Spearman sensitivity tables.
//
// A Web-Worker pool is a Phase-5 optimization; sequential is sufficient for the
// typical 50–100 trial DOE that a packaging engineer runs during a study.

import { createWorld, disposeWorld, PHYS_DT } from '../physics/world.js';
import { spawnCHEPPallet } from '../physics/pallet.js';
import { spawnBox, spawnGround } from '../physics/box.js';
import { layoutLayer } from '../physics/stack-patterns.js';
import { StretchWrap } from '../physics/stretch-wrap.js';
import { MetricsCollector, THRESHOLDS } from '../analysis/metrics.js';
import { runISTA3ESequence } from '../tests/sequencer.js';
import { PCG32, deriveSeed } from '../analysis/rng.js';
import { latinHypercube, sensitivityMatrix } from '../analysis/sensitivity.js';
import { cpk } from '../analysis/cpk.js';

/**
 * @typedef {object} DOEParamSpec
 * @property {string} key           input key in trial inputs record
 * @property {'uniform'|'normal'|'triangular'} dist
 * @property {number} [low]
 * @property {number} [high]
 * @property {number} [mean]
 * @property {number} [sigma]
 * @property {number} [mode]
 */

/** Map a [0,1) LHS sample to the parameter's distribution. */
function sampleParam(u, spec) {
  switch (spec.dist) {
    case 'uniform': return spec.low + (spec.high - spec.low) * u;
    case 'triangular': {
      const a = spec.low, b = spec.high, c = spec.mode ?? (a + b) / 2;
      const F_c = (c - a) / (b - a);
      return u < F_c
        ? a + Math.sqrt(u * (b - a) * (c - a))
        : b - Math.sqrt((1 - u) * (b - a) * (b - c));
    }
    case 'normal': {
      // Inverse-CDF approximation (Beasley-Springer-Moro) for Gaussian.
      return normalInvCDF(u, spec.mean, spec.sigma);
    }
    default: return spec.mean ?? (spec.low + (spec.high - spec.low) / 2);
  }
}

function normalInvCDF(p, mu, sigma) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) { q = Math.sqrt(-2 * Math.log(p)); return mu + sigma * (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > pHigh) { q = Math.sqrt(-2 * Math.log(1 - p)); return mu - sigma * (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  q = p - 0.5; r = q * q;
  return mu + sigma * (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Default DOE parameter set. Can be overridden by UI. */
export function defaultDOE(base) {
  return [
    { key: 'boxMass',     dist: 'normal',     mean: base.boxMass, sigma: base.boxMass * 0.03 },
    { key: 'muCC',        dist: 'uniform',    low: Math.max(0.30, base.muCC - 0.10), high: Math.min(0.70, base.muCC + 0.10) },
    { key: 'wrapTensionN',dist: 'triangular', low: Math.max(0, base.wrapTensionN * 0.5), high: base.wrapTensionN * 1.5, mode: base.wrapTensionN },
    { key: 'boxLmm',      dist: 'uniform',    low: base.boxLmm * 0.99, high: base.boxLmm * 1.01 },
    { key: 'boxWmm',      dist: 'uniform',    low: base.boxWmm * 0.99, high: base.boxWmm * 1.01 },
    { key: 'boxHmm',      dist: 'uniform',    low: base.boxHmm * 0.99, high: base.boxHmm * 1.01 },
  ];
}

/** Single headless trial — no Three.js, no DOM. */
async function runOneTrial(trialInputs, onYield) {
  const world = createWorld();
  spawnGround(world);
  const palletY = 0.142 / 2;
  const pallet = spawnCHEPPallet(world, { kinematic: false, position: { x: 0, y: palletY, z: 0 } });

  const box = { L: trialInputs.boxLmm / 1000, W: trialInputs.boxWmm / 1000, H: trialInputs.boxHmm / 1000 };
  const palletTopY = pallet.topSurfaceY;
  const boxes = [];
  for (let layer = 0; layer < trialInputs.layers; layer++) {
    const positions = layoutLayer(trialInputs.pattern, layer, box);
    for (const p of positions) {
      const y = palletTopY + box.H * (layer + 0.5) + 0.001 * layer;
      const spawned = spawnBox(world, {
        L: box.L, W: box.W, H: box.H, mass: trialInputs.boxMass,
        position: { x: p.x, y, z: p.z }, rotationY: p.rotY,
        friction: trialInputs.muCC, label: '',
      });
      boxes.push(spawned);
    }
  }
  const wrap = trialInputs.wrapTurns > 0
    ? new StretchWrap({ boxes, turns: trialInputs.wrapTurns, pretensionN: trialInputs.wrapTensionN, releaseY: palletTopY + 0.03, palletTopY })
    : null;
  const metrics = new MetricsCollector({ boxes, pallet, wrap });

  await runISTA3ESequence({
    world, pallet, boxes, wrap, metrics,
    config: {
      vibrationDurationSec: trialInputs.vibrationDurationSec,
      timeCompression: trialInputs.timeCompression,
      seed: trialInputs.seed,
      compressionRampSec: 2,
      compressionHoldSec: 4,   // compressed hold for MC (still captures deflection)
      dropEdges: ['front', 'right', 'corner_fl'],
    },
    onPhase: () => {},
    onProgress: async () => { if (onYield) await onYield(); },
  });

  const report = metrics.toReport({
    palletTopY,
    boxConfig: { L: box.L, W: box.W, ectLbIn: trialInputs.ectLbIn ?? 44, caliperIn: 0.156 },
    runMeta: {},
  });

  disposeWorld(world);
  return report;
}

/**
 * Run a Monte Carlo batch.
 * @param {object} opts
 * @param {object} opts.base             Base config (from main-thread UI).
 * @param {number} opts.nTrials
 * @param {DOEParamSpec[]} [opts.doe]    Parameter distributions; default uses defaultDOE.
 * @param {number} [opts.seedRoot]
 * @param {(frac:number, trial:number)=>void} [opts.onProgress]
 * @returns {Promise<object>}            Batch result.
 */
export async function runMonteCarloBatch({ base, nTrials, doe, seedRoot = 1, onProgress }) {
  const paramSpec = doe ?? defaultDOE(base);
  const rng = new PCG32(seedRoot);
  const lhs = latinHypercube(nTrials, paramSpec.length, rng);

  const inputsByKey = {};
  const outputsByKey = {};
  for (const p of paramSpec) inputsByKey[p.key] = [];
  const metricKeys = Object.keys(THRESHOLDS);
  for (const m of metricKeys) outputsByKey[m] = [];

  const trials = [];
  for (let t = 0; t < nTrials; t++) {
    // Each trial gets a deterministic sub-seed derived from root.
    const seed = deriveSeed(seedRoot, `trial:${t}`);
    const u = lhs[t];
    const inputs = { ...base, seed };
    paramSpec.forEach((spec, d) => { inputs[spec.key] = sampleParam(u[d], spec); });

    const report = await runOneTrial(inputs, () => new Promise((r) => setTimeout(r, 0)));

    for (const p of paramSpec) inputsByKey[p.key].push(inputs[p.key]);
    const mRec = {};
    for (const m of metricKeys) {
      // metrics record uses keys like maxBoxDisplacementXY_mm; THRESHOLDS uses same.
      mRec[m] = report.metrics[m] ?? 0;
      outputsByKey[m].push(mRec[m]);
    }
    trials.push({
      trial: t, verdict: report.verdict,
      inputs: Object.fromEntries(paramSpec.map(p => [p.key, inputs[p.key]])),
      metrics: mRec,
    });

    onProgress && onProgress((t + 1) / nTrials, t + 1);
  }

  // Cpk per metric (using the threshold table for USL).
  const cpkRows = [];
  for (const m of metricKeys) {
    const th = THRESHOLDS[m];
    const samples = outputsByKey[m];
    const spec = th.direction === 'lessEq' ? { usl: th.usl } : { lsl: th.usl };
    const stats = cpk(samples, spec);
    cpkRows.push({ metric: m, ...stats });
  }

  const sensitivity = sensitivityMatrix(inputsByKey, outputsByKey);

  return {
    seedRoot,
    nTrials,
    doe: paramSpec,
    trials,
    cpk: cpkRows,
    sensitivity,
  };
}
