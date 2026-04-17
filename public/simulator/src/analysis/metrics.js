// Per-frame and aggregate metrics collection.
//
// Units in SI unless noted. Pass/fail thresholds are captured in THRESHOLDS for
// a single source of truth. McKee BCT is an advisory (not a simulated) value.

export const THRESHOLDS = {
  maxBoxDisplacementXY_mm: { usl: 25.0, direction: 'lessEq' },
  maxLayerShear_mm:        { usl: 12.0, direction: 'lessEq' },
  boxesToppled:            { usl: 0,    direction: 'lessEq' }, // hard fail if >0
  loadLeanAngle_deg:       { usl: 3.0,  direction: 'lessEq' },
  palletCOGShift_mm:       { usl: 50.0, direction: 'lessEq' },
  wrapBroken:              { usl: 0,    direction: 'lessEq' }, // 0=false, 1=true
  compressionDeflection_mm:{ usl: 10.0, direction: 'lessEq' },
};

const G = 9.80665;
const RAD2DEG = 180 / Math.PI;

export class MetricsCollector {
  /**
   * @param {object} ctx
   * @param {Array} ctx.boxes          Array of spawned box records.
   * @param {object} ctx.pallet        { body, outer, topSurfaceY }
   * @param {StretchWrap|null} ctx.wrap
   */
  constructor(ctx) {
    this.boxes = ctx.boxes;
    this.pallet = ctx.pallet;
    this.wrap = ctx.wrap;
    this.initialBoxPositions = this.boxes.map(b => {
      const p = b.body.translation();
      return { x: p.x, y: p.y, z: p.z };
    });
    this.initialCOG = this._currentCOG();
    this.maxBoxDisplacementXY_mm = 0;
    this.maxLayerShear_mm = 0;
    this.maxLoadLeanAngle_deg = 0;
    this.palletCOGShift_mm = 0;
    this.maxBoxAccel_g = 0;
    this.maxContactImpulse_Ns = 0;
    this._prevVel = this.boxes.map(() => ({ x: 0, y: 0, z: 0 }));
    this.compressionDeflection_mm = 0;
    this.dropDamageProxy_J = 0;
    this.phaseMetrics = {};
  }

  _currentCOG() {
    let mx = 0, my = 0, mz = 0, m = 0;
    for (const b of this.boxes) {
      const p = b.body.translation();
      mx += p.x * b.mass; my += p.y * b.mass; mz += p.z * b.mass; m += b.mass;
    }
    return m > 0 ? { x: mx / m, y: my / m, z: mz / m, m } : { x: 0, y: 0, z: 0, m: 0 };
  }

  /** Call every fixed physics step, passing dt for acceleration estimation. */
  sample(dt) {
    // Per-box displacement + acceleration from finite differences.
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const p = b.body.translation();
      const p0 = this.initialBoxPositions[i];
      const dx = (p.x - p0.x);
      const dz = (p.z - p0.z);
      const shiftMm = Math.hypot(dx, dz) * 1000;
      if (shiftMm > this.maxBoxDisplacementXY_mm) this.maxBoxDisplacementXY_mm = shiftMm;

      const v = b.body.linvel();
      const prev = this._prevVel[i];
      const ax = (v.x - prev.x) / dt;
      const ay = (v.y - prev.y) / dt;
      const az = (v.z - prev.z) / dt;
      const amag_g = Math.hypot(ax, ay, az) / G;
      if (amag_g > this.maxBoxAccel_g) this.maxBoxAccel_g = amag_g;
      prev.x = v.x; prev.y = v.y; prev.z = v.z;
    }

    // Load lean: compute angle of top-layer centroid relative to pallet centroid.
    const topY = this._approxTopLayerY();
    let mx = 0, mz = 0, m = 0;
    for (const b of this.boxes) {
      const p = b.body.translation();
      if (p.y >= topY - 0.05) {
        mx += p.x * b.mass; mz += p.z * b.mass; m += b.mass;
      }
    }
    if (m > 0) {
      const topCx = mx / m, topCz = mz / m;
      const pp = this.pallet.body.translation();
      const dx = topCx - pp.x;
      const dz = topCz - pp.z;
      const lateral = Math.hypot(dx, dz);
      const height = Math.max(0.1, topY - pp.y);
      const angleDeg = Math.atan2(lateral, height) * RAD2DEG;
      if (angleDeg > this.maxLoadLeanAngle_deg) this.maxLoadLeanAngle_deg = angleDeg;
    }

    // Pallet COG shift (load only, not pallet).
    const cog = this._currentCOG();
    const shift = Math.hypot(cog.x - this.initialCOG.x, cog.z - this.initialCOG.z) * 1000;
    if (shift > this.palletCOGShift_mm) this.palletCOGShift_mm = shift;
  }

  _approxTopLayerY() {
    let maxY = -Infinity;
    for (const b of this.boxes) {
      const p = b.body.translation();
      if (p.y > maxY) maxY = p.y;
    }
    return maxY;
  }

  /** Count boxes that have rotated more than 30° from upright OR fallen below pallet top. */
  countToppled(palletTopY) {
    let n = 0;
    for (const b of this.boxes) {
      const q = b.body.rotation();
      // Up-vector of the box (local Y rotated). For a quat {x,y,z,w}, the rotated
      // world-space Y axis is (2(xy+wz), 1-2(xx+zz), 2(yz-wx)). Dot with world-Y.
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      const angleOff = Math.acos(Math.min(1, Math.max(-1, upY))) * RAD2DEG;
      const p = b.body.translation();
      if (angleOff > 30 || p.y < palletTopY - 0.2) n++;
    }
    return n;
  }

  /** Layer-shear metric: max centroid shift between adjacent layers (mm). */
  computeMaxLayerShear() {
    const byLayer = new Map();
    for (const b of this.boxes) {
      const p = b.body.translation();
      const key = Math.round(p.y / 0.1); // 10 cm bucket
      if (!byLayer.has(key)) byLayer.set(key, []);
      byLayer.get(key).push(p);
    }
    const layers = [...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([_, ps]) => {
      const mx = ps.reduce((s, p) => s + p.x, 0) / ps.length;
      const mz = ps.reduce((s, p) => s + p.z, 0) / ps.length;
      return { x: mx, z: mz };
    });
    let maxShear = 0;
    for (let i = 1; i < layers.length; i++) {
      const dx = layers[i].x - layers[i - 1].x;
      const dz = layers[i].z - layers[i - 1].z;
      const d = Math.hypot(dx, dz) * 1000;
      if (d > maxShear) maxShear = d;
    }
    this.maxLayerShear_mm = maxShear;
    return maxShear;
  }

  /** Advisory McKee BCT (lbf). Input: ECT (lb/in), caliper t (in), perimeter Z (in). */
  static mckeeBCT({ ectLbIn, caliperIn, perimeterIn }) {
    return 5.874 * ectLbIn * Math.sqrt(Math.max(1e-6, caliperIn * perimeterIn));
  }

  toReport({ palletTopY, boxConfig, runMeta, compressionLoad_kg = 0 }) {
    const toppled = this.countToppled(palletTopY);
    const shear = this.computeMaxLayerShear();
    const perimeterIn = 2 * (boxConfig.L + boxConfig.W) * 39.3701;
    const bct = MetricsCollector.mckeeBCT({
      ectLbIn: boxConfig.ectLbIn ?? 44,
      caliperIn: boxConfig.caliperIn ?? 0.156, // nominal double-wall
      perimeterIn,
    });
    const vals = {
      maxBoxDisplacementXY_mm: this.maxBoxDisplacementXY_mm,
      maxLayerShear_mm: shear,
      boxesToppled: toppled,
      loadLeanAngle_deg: this.maxLoadLeanAngle_deg,
      palletCOGShift_mm: this.palletCOGShift_mm,
      wrapBroken: this.wrap && this.wrap.broken ? 1 : 0,
      compressionDeflection_mm: this.compressionDeflection_mm,
      maxBoxAccel_g: this.maxBoxAccel_g,
      maxContactImpulse_Ns: this.maxContactImpulse_Ns,
      dropDamageProxy_J: this.dropDamageProxy_J,
      bctAdvisory_lbf: bct,
      compressionAppliedLoad_kg: compressionLoad_kg,
      wrapPeakStrain: this.wrap?.peakStrain ?? 0,
      wrapPeakForceN: this.wrap?.peakSegmentN ?? 0,
    };
    const perCriterion = evaluatePassFail(vals);
    return { ...runMeta, metrics: vals, perCriterion, verdict: perCriterion.every(c => c.pass) ? 'PASS' : 'FAIL' };
  }
}

export function evaluatePassFail(vals) {
  const rows = [];
  for (const [key, th] of Object.entries(THRESHOLDS)) {
    const v = vals[key];
    if (v === undefined) continue;
    const pass = th.direction === 'lessEq' ? v <= th.usl : v >= th.usl;
    rows.push({ metric: key, value: v, usl: th.usl, direction: th.direction, pass });
  }
  return rows;
}
