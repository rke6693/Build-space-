// Orchestrates the ISTA 3E test sequence in order:
//   1. Precondition (metadata only, no physics)
//   2. Compression (quasi-static)
//   3. Random vibration (PSD-driven kinematic base motion)
//   4. Rotational edge drops (3: short edge, long edge, corner)
//
// The sequencer is an async generator-ish loop: it drives world.step() directly
// and yields progress events so the UI can update. Designed to be reusable
// headlessly from a Web Worker (Monte Carlo) — no direct DOM access.

import RAPIER from '@dimforge/rapier3d-compat';
import { PHYS_DT } from '../physics/world.js';
import { buildISTA3EVerticalDisplacement, VibrationDriver } from './vibration-psd.js';
import { CompressionTest, computeCompressionForce } from './compression.js';
import { performEdgeDrop, selectDropHeightMeters } from './edge-drop.js';

export async function runISTA3ESequence({
  world,
  pallet,
  boxes,
  wrap,
  metrics,
  config,
  onPhase = () => {},
  onProgress = () => {},
}) {
  const totalMassKg = boxes.reduce((s, b) => s + b.mass, 0);
  const baseY = pallet.body.translation().y;
  const phaseLog = [];

  // --- Phase 0: settle (let any build transients decay) ---
  onPhase('settle');
  const settleSec = 2.0;
  const settleSteps = Math.round(settleSec / PHYS_DT);
  for (let i = 0; i < settleSteps; i++) {
    wrap?.applyForces(i * PHYS_DT);
    world.step();
    metrics?.sample(PHYS_DT);
    if ((i & 31) === 0) onProgress({ phase: 'settle', t: i * PHYS_DT, frac: i / settleSteps });
  }
  phaseLog.push({ phase: 'settle', duration: settleSec });

  // Swap pallet to kinematic for all scripted phases (vibration + drops).
  pallet.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  pallet.body.setNextKinematicTranslation({ x: 0, y: baseY, z: 0 });

  // --- Phase 1: Compression ---
  onPhase('compression');
  const compression = new CompressionTest({
    world,
    boxes,
    targetForceN: computeCompressionForce({
      stackMassKg: totalMassKg,
      warehouseStackHeight: config.warehouseStackHeight ?? 3,
      safetyFactor: config.compressionSafetyFactor ?? 1.4,
    }),
    rampSec: config.compressionRampSec ?? 10,
    holdSec: config.compressionHoldSec ?? 60,
  });
  compression.spawnPlaten();
  const rampSteps = Math.round(compression.rampSec / PHYS_DT);
  const holdSteps = Math.round(compression.holdSec / PHYS_DT);
  for (let i = 0; i < rampSteps; i++) {
    compression.applyForce(i * PHYS_DT, 'ramp');
    wrap?.applyForces(i * PHYS_DT);
    world.step();
    metrics?.sample(PHYS_DT);
    if ((i & 63) === 0) onProgress({ phase: 'compression:ramp', t: i * PHYS_DT, frac: i / rampSteps });
  }
  for (let i = 0; i < holdSteps; i++) {
    compression.applyForce(i * PHYS_DT, 'hold');
    wrap?.applyForces(i * PHYS_DT);
    world.step();
    metrics?.sample(PHYS_DT);
    if ((i & 63) === 0) onProgress({ phase: 'compression:hold', t: i * PHYS_DT, frac: i / holdSteps });
  }
  compression.despawnPlaten();
  if (metrics) metrics.compressionDeflection_mm = compression.maxDeflection_mm;
  phaseLog.push({ phase: 'compression', ...compression.summary() });

  // --- Phase 2: Random vibration ---
  onPhase('vibration');
  const vibDurationSec = config.vibrationDurationSec ?? 180;
  const timeCompression = config.timeCompression ?? 60;
  const psdData = buildISTA3EVerticalDisplacement({
    durationSec: vibDurationSec,
    fs: config.psdSampleRate ?? 480,
    seed: config.seed ?? 42,
  });
  const driver = new VibrationDriver({
    body: pallet.body,
    displacement_m: psdData.disp_m,
    fs: psdData.fs,
    baseY,
    timeCompression,
  });
  driver.start();
  const vibWallSec = vibDurationSec / timeCompression;
  const vibSteps = Math.round(vibWallSec / PHYS_DT);
  for (let i = 0; i < vibSteps; i++) {
    driver.step(PHYS_DT);
    wrap?.applyForces(i * PHYS_DT);
    world.step();
    metrics?.sample(PHYS_DT);
    if ((i & 127) === 0) onProgress({ phase: 'vibration', t: i * PHYS_DT, frac: i / vibSteps });
  }
  driver.stop();
  // Return pallet to base
  pallet.body.setNextKinematicTranslation({ x: 0, y: baseY, z: 0 });
  phaseLog.push({ phase: 'vibration', durationSec: vibDurationSec, compressed: timeCompression, grms: psdData.grmsEmpirical });

  // --- Phase 3: Rotational edge drops ---
  onPhase('edge_drops');
  const dropH = selectDropHeightMeters(totalMassKg);
  const drops = [];
  for (const edge of (config.dropEdges ?? ['front', 'right', 'corner_fl'])) {
    const r = await performEdgeDrop({
      world, pallet, edge, dropHeightM: dropH,
      onPhase: (p) => onPhase(p),
      postStep: (dt) => {
        wrap?.applyForces(0);
        metrics?.sample(dt);
      },
    });
    drops.push(r);
    // let everything settle between drops
    for (let i = 0; i < Math.round(0.8 / PHYS_DT); i++) {
      wrap?.applyForces(0);
      world.step();
      metrics?.sample(PHYS_DT);
    }
  }
  phaseLog.push({ phase: 'edge_drops', drops });

  onPhase('done');
  return { phaseLog };
}
