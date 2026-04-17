// Rotational edge-drop per ISTA 3E §4.5.
//   Heights: 9 in (≤500 lb gross load) or 6 in (>500 lb).
//   Procedure: lift one edge of the pallet to the drop-angle, hold, then release.
//   A kinematic "anchor" holds the opposite edge while a second kinematic "lifter"
//   raises the dropped edge. On release, all constraints are removed and gravity
//   lets the pallet rotate back onto the floor. The impact excites the stack.
//
// Implementation note: because the pallet body is dynamic during the stack build,
// we use two kinematic constraints implemented as position-setpoints via very
// stiff temporary spherical joints. A simpler and equally correct approach is to
// temporarily swap the pallet body type to kinematic during lift, script the pose,
// then swap back before release. We use that approach — it's fewer moving parts
// and is deterministic.

import RAPIER from '@dimforge/rapier3d-compat';
import { PHYS_DT } from '../physics/world.js';

const INCH = 0.0254;

export function selectDropHeightMeters(grossLoadKg) {
  // 500 lb ≈ 226.8 kg
  return grossLoadKg <= 226.8 ? 9 * INCH : 6 * INCH;
}

/**
 * Script a single rotational edge drop.
 * @param {object} opts
 * @param {RAPIER.World} opts.world
 * @param {object} opts.pallet              { body, outer }
 * @param {'front'|'back'|'left'|'right'|'corner_fl'|'corner_br'} opts.edge
 * @param {number} opts.dropHeightM
 * @param {(phase: string) => void} opts.onPhase
 * @param {(dt: number) => void} opts.postStep  called after each world.step()
 * @returns {object} sub-phase timings + kinetic-energy peak
 */
export async function performEdgeDrop({ world, pallet, edge, dropHeightM, onPhase, postStep }) {
  const body = pallet.body;
  const { L, W } = pallet.outer;
  const baseY = body.translation().y;

  // Determine pivot (fixed edge) and lift direction.
  // Coordinate system: +x along pallet length (48"), +z along width (40").
  let pivot; // 2D (x,z) of the fixed edge midpoint; lift occurs on the opposite side.
  let liftAxis; // 'x' (rotate about z-axis) or 'z' (rotate about x-axis)
  let liftSign;
  switch (edge) {
    case 'front':  pivot = { x: -L / 2, z: 0 };  liftAxis = 'z'; liftSign = +1; break;
    case 'back':   pivot = { x:  L / 2, z: 0 };  liftAxis = 'z'; liftSign = -1; break;
    case 'left':   pivot = { x: 0, z: -W / 2 };  liftAxis = 'x'; liftSign = -1; break;
    case 'right':  pivot = { x: 0, z:  W / 2 };  liftAxis = 'x'; liftSign = +1; break;
    case 'corner_fl': pivot = { x: -L / 2, z: -W / 2 }; liftAxis = 'corner'; liftSign = +1; break;
    case 'corner_br': pivot = { x:  L / 2, z:  W / 2 }; liftAxis = 'corner'; liftSign = -1; break;
    default: throw new Error(`Unknown edge: ${edge}`);
  }
  const leverLength =
    liftAxis === 'x' ? W :
    liftAxis === 'z' ? L :
    Math.hypot(L, W);
  const thetaMax = Math.asin(Math.min(1, dropHeightM / leverLength));

  // Swap pallet to kinematic for scripting the lift.
  body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);

  const rampSec = 1.0;
  const holdSec = 0.3;
  const postReleaseSec = 1.8;

  const smoothstep = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

  // Phase: LIFT
  onPhase && onPhase(`edge_drop_${edge}_lift`);
  const rampSteps = Math.round(rampSec / PHYS_DT);
  for (let i = 0; i <= rampSteps; i++) {
    const t = i / rampSteps;
    const theta = thetaMax * smoothstep(t);
    applyTilt(body, pivot, theta, liftAxis, liftSign, baseY);
    world.step();
    postStep && postStep(PHYS_DT);
  }

  // Phase: HOLD
  onPhase && onPhase(`edge_drop_${edge}_hold`);
  const holdSteps = Math.round(holdSec / PHYS_DT);
  for (let i = 0; i < holdSteps; i++) {
    applyTilt(body, pivot, thetaMax, liftAxis, liftSign, baseY);
    world.step();
    postStep && postStep(PHYS_DT);
  }

  // Phase: RELEASE — flip to dynamic, let gravity bring it down.
  onPhase && onPhase(`edge_drop_${edge}_release`);
  body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  // Give it an initial nudge so the free fall starts immediately without waiting
  // for the solver to pick up gravity.
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);

  let peakOmega = 0;
  const postSteps = Math.round(postReleaseSec / PHYS_DT);
  for (let i = 0; i < postSteps; i++) {
    world.step();
    postStep && postStep(PHYS_DT);
    const av = body.angvel();
    const mag = Math.hypot(av.x, av.y, av.z);
    if (mag > peakOmega) peakOmega = mag;
  }

  // Reset pallet back to kinematic for the next test phase (vibration/compression).
  body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  body.setNextKinematicTranslation({ x: 0, y: baseY, z: 0 });
  body.setNextKinematicRotation({ x: 0, y: 0, z: 0, w: 1 });

  return { edge, dropHeightM, thetaMax, peakAngularVelocity_rads: peakOmega };
}

function applyTilt(body, pivot, theta, axis, sign, baseY) {
  // Rotate the pallet body around the pivot edge by theta. The body center
  // translates so the pivot stays at (pivot.x, 0, pivot.z) at world floor height.
  let qx = 0, qy = 0, qz = 0, qw = 1;
  const s = Math.sin(theta / 2 * sign);
  const c = Math.cos(theta / 2 * sign);
  let pivotToCenter;
  if (axis === 'z') {
    qz = s; qw = c;
    pivotToCenter = { x: -pivot.x, y: 0, z: 0 };
  } else if (axis === 'x') {
    qx = s; qw = c;
    pivotToCenter = { x: 0, y: 0, z: -pivot.z };
  } else { // corner — rotate about diagonal axis
    const ax = -pivot.z, az = pivot.x; // perpendicular to radial dir
    const len = Math.hypot(ax, az) || 1;
    qx = (ax / len) * s; qz = (az / len) * s; qw = c;
    pivotToCenter = { x: -pivot.x, y: 0, z: -pivot.z };
  }
  // rotated(pivotToCenter) + pivot gives center position relative to pivot at y=0.
  const rx = pivotToCenter.x, ry = pivotToCenter.y, rz = pivotToCenter.z;
  const rotated = rotateByQuat(rx, ry, rz, qx, qy, qz, qw);
  const cx = pivot.x + rotated.x;
  const cy = baseY + rotated.y;
  const cz = pivot.z + rotated.z;
  body.setNextKinematicTranslation({ x: cx, y: cy, z: cz });
  body.setNextKinematicRotation({ x: qx, y: qy, z: qz, w: qw });
}

function rotateByQuat(vx, vy, vz, qx, qy, qz, qw) {
  // v' = q * v * q^-1
  const ix =  qw * vx + qy * vz - qz * vy;
  const iy =  qw * vy + qz * vx - qx * vz;
  const iz =  qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}
