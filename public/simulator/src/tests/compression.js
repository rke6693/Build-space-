// Quasi-static compression per ISTA 3E §4.6.
// Applied load proxies warehouse stacking: F = stackWeight * (stackHeight - 1).
// A kinematic platen body is placed above the stack, then ramped downward in
// force while we measure its penetration into the stack.

import RAPIER from '@dimforge/rapier3d-compat';
import { PHYS_DT } from '../physics/world.js';
import { GROUP, interactionBits } from '../physics/contacts.js';

export class CompressionTest {
  /**
   * @param {object} opts
   * @param {RAPIER.World} opts.world
   * @param {Array} opts.boxes
   * @param {number} opts.targetForceN     total downward force at hold
   * @param {number} opts.rampSec          seconds to ramp from 0 to target
   * @param {number} opts.holdSec          seconds to hold at target
   * @param {number} opts.platenAreaL      length (m) of platen (covers top layer)
   * @param {number} opts.platenAreaW      width (m)
   */
  constructor({ world, boxes, targetForceN, rampSec = 10, holdSec = 60, platenAreaL = 1.25, platenAreaW = 1.05 }) {
    this.world = world;
    this.boxes = boxes;
    this.targetForceN = targetForceN;
    this.rampSec = rampSec;
    this.holdSec = holdSec;
    this.platenAreaL = platenAreaL;
    this.platenAreaW = platenAreaW;
    this.platenBody = null;
    this.platenStartY = 0;
    this.maxDeflection_mm = 0;
  }

  _topY() {
    let maxY = -Infinity;
    for (const b of this.boxes) {
      const p = b.body.translation();
      const topOfBox = p.y + b.dims.H / 2;
      if (topOfBox > maxY) maxY = topOfBox;
    }
    return maxY;
  }

  spawnPlaten() {
    const topY = this._topY() + 0.01;
    const thick = 0.02;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, topY + thick / 2, 0)
      .setAdditionalMass(1.0)
      .setLinearDamping(1.5)
      .setAngularDamping(5.0)
      .setCanSleep(false);
    // Lock rotation and horizontal motion — platen only moves vertically.
    desc.lockRotations();
    desc.enabledTranslations(false, true, false, true);
    const body = this.world.createRigidBody(desc);
    const collider = RAPIER.ColliderDesc.cuboid(this.platenAreaL / 2, thick / 2, this.platenAreaW / 2)
      .setFriction(0.6)
      .setRestitution(0.0)
      .setCollisionGroups(interactionBits(GROUP.PLATEN, GROUP.BOX));
    this.world.createCollider(collider, body);
    this.platenBody = body;
    this.platenStartY = topY + thick / 2;
    return body;
  }

  /** Call every physics step during ramp/hold phases. */
  applyForce(phaseTimeSec, phase) {
    let f = 0;
    if (phase === 'ramp') f = this.targetForceN * Math.min(1, phaseTimeSec / this.rampSec);
    else if (phase === 'hold') f = this.targetForceN;
    if (this.platenBody) {
      this.platenBody.addForce({ x: 0, y: -f, z: 0 }, true);
      const y = this.platenBody.translation().y;
      const deflection = (this.platenStartY - y) * 1000; // mm
      if (deflection > this.maxDeflection_mm) this.maxDeflection_mm = deflection;
    }
  }

  despawnPlaten() {
    if (this.platenBody) {
      this.world.removeRigidBody(this.platenBody);
      this.platenBody = null;
    }
  }

  summary() {
    return {
      targetForceN: this.targetForceN,
      maxDeflection_mm: this.maxDeflection_mm,
      rampSec: this.rampSec,
      holdSec: this.holdSec,
    };
  }
}

/** Compute target compression force for ISTA 3E: load above + safety factor. */
export function computeCompressionForce({ stackMassKg, warehouseStackHeight = 3, safetyFactor = 1.4 }) {
  const g = 9.80665;
  const layersAbove = Math.max(1, warehouseStackHeight - 1);
  return stackMassKg * layersAbove * g * safetyFactor;
}
