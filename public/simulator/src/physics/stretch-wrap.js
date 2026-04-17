// Stretch-wrap containment as a radial spring-damper field applied to perimeter boxes.
// NOT a mesh — purely a per-step external force. Break criterion: film strain or stress
// exceeds LLDPE limits, after which forces are disabled and the failure is logged.
//
// Sources: LLDPE mechanical properties, typical stretch-film pallet wrap practice.

import RAPIER from '@dimforge/rapier3d-compat';

const E_FILM_PA = 250e6;          // LLDPE elastic modulus (≈250 MPa)
const SIGMA_BREAK_PA = 25e6;      // tensile break stress (~25 MPa)
const EPS_BREAK = 1.5;            // 150% elongation at break
const FILM_WIDTH_M = 0.50;        // typical 20" wrap width
const FILM_THICKNESS_M = 20e-6;   // 80-gauge ≈ 20 µm

export class StretchWrap {
  /**
   * @param {object} opts
   * @param {Array} opts.boxes             array of spawned box records (with .body, .dims)
   * @param {number} opts.turns            number of wrap turns (dimensionless)
   * @param {number} opts.pretensionN      pretension applied as constant inward force (N)
   * @param {number} opts.releaseY         world Y below which a box is no longer wrapped (m)
   * @param {number} opts.palletTopY       pallet top surface Y (m)
   */
  constructor({ boxes, turns = 4, pretensionN = 120, releaseY = 0.1, palletTopY = 0.14 }) {
    this.boxes = boxes;
    this.turns = turns;
    this.pretensionN = pretensionN;
    this.releaseY = releaseY;
    this.palletTopY = palletTopY;

    // Precompute initial load footprint + hull of perimeter boxes.
    this._computeInitialGeometry();

    // Film stiffness per perimeter segment (N/m):
    const A = FILM_WIDTH_M * FILM_THICKNESS_M * this.turns;
    this.k_per_box = (E_FILM_PA * A) / Math.max(0.01, this.circumference0);
    this.maxSegmentN = SIGMA_BREAK_PA * A;

    this.broken = false;
    this.brokenAtSec = null;
    this.peakSegmentN = 0;
    this.peakStrain = 0;
  }

  _computeInitialGeometry() {
    // Load center XZ from box mean (weighted by mass).
    let mx = 0, mz = 0, totalM = 0;
    for (const b of this.boxes) {
      const p = b.body.translation();
      mx += p.x * b.mass; mz += p.z * b.mass; totalM += b.mass;
    }
    this.centerX = totalM > 0 ? mx / totalM : 0;
    this.centerZ = totalM > 0 ? mz / totalM : 0;

    // Perimeter box set: top layer (above palletTopY + ε) is always perimeter on outside
    // of its layer; below-top we pick those with max distance per angular sector.
    this.perimeter = [];
    let circum = 0;
    // Group by layer (approx by y bucket of 5 cm).
    const byLayer = new Map();
    for (const b of this.boxes) {
      const p = b.body.translation();
      const key = Math.round((p.y - this.palletTopY) / 0.03);
      if (!byLayer.has(key)) byLayer.set(key, []);
      byLayer.get(key).push(b);
    }
    for (const layer of byLayer.values()) {
      // For each layer, keep only boxes on convex hull (approximate: max radius in 24 angular bins).
      const bins = new Array(24).fill(null);
      for (const b of layer) {
        const p = b.body.translation();
        const dx = p.x - this.centerX, dz = p.z - this.centerZ;
        const r = Math.hypot(dx, dz);
        const angle = Math.atan2(dz, dx);
        const bin = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 24) % 24;
        if (!bins[bin] || bins[bin].r < r) bins[bin] = { b, r, angle };
      }
      for (const entry of bins) {
        if (!entry) continue;
        this.perimeter.push({
          body: entry.b.body,
          r0: entry.r,
          angle0: entry.angle,
          box: entry.b,
        });
        circum += entry.r * (2 * Math.PI / 24);
      }
    }
    this.circumference0 = Math.max(0.1, circum);
  }

  // Called every physics step BEFORE world.step(). Applies forces via rigidBody.addForce.
  applyForces(simTimeSec) {
    if (this.broken) return;
    let overallPeakStrain = 0;
    let overallPeakN = 0;
    for (const seg of this.perimeter) {
      const p = seg.body.translation();
      if (p.y < this.releaseY) continue; // below wrap coverage
      const dx = p.x - this.centerX;
      const dz = p.z - this.centerZ;
      const r = Math.hypot(dx, dz);
      if (r < 1e-6) continue;
      const nx = dx / r, nz = dz / r;
      const dr = Math.max(0, r - seg.r0);
      const strain = dr / Math.max(0.05, seg.r0);
      if (strain > overallPeakStrain) overallPeakStrain = strain;

      // Radial force = spring term + pretension pulling inward.
      const fSpring = this.k_per_box * dr;
      const fPre = this.pretensionN / Math.max(1, this.perimeter.length);
      const fTotal = fSpring + fPre;
      if (fTotal > overallPeakN) overallPeakN = fTotal;
      // Apply inward radial force; no vertical component (wrap is horizontal).
      seg.body.addForce({ x: -nx * fTotal, y: 0, z: -nz * fTotal }, true);
    }
    this.peakStrain = Math.max(this.peakStrain, overallPeakStrain);
    this.peakSegmentN = Math.max(this.peakSegmentN, overallPeakN);
    if (overallPeakStrain > EPS_BREAK || overallPeakN > this.maxSegmentN) {
      this.broken = true;
      this.brokenAtSec = simTimeSec;
    }
  }

  summary() {
    return {
      broken: this.broken,
      brokenAtSec: this.brokenAtSec,
      peakStrain: this.peakStrain,
      peakSegmentN: this.peakSegmentN,
      turns: this.turns,
      pretensionN: this.pretensionN,
      perimeterCount: this.perimeter.length,
      circumference0: this.circumference0,
      k_per_box: this.k_per_box,
      maxSegmentN: this.maxSegmentN,
    };
  }
}
