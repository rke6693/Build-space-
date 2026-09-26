'use strict';
// =============================================================================
// SYNTHWING 64 — util.js
// Math, RNG, noise and small helpers shared by every other module.
// All scripts are classic scripts that share top-level bindings, so the build
// step can concatenate them into one file without a bundler.
// =============================================================================

const PI = Math.PI;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutElastic = (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1);
// Framerate independent exponential approach.
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrapAngle = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };

const rand = Math.random;
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Value noise (deterministic, seedable by offset) — used for terrain, textures.
// ---------------------------------------------------------------------------
function hash2i(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2i(xi, yi), b = hash2i(xi + 1, yi), c = hash2i(xi, yi + 1), d = hash2i(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// Periodic variant for tileable textures.
function vnoise2p(x, y, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash2i(x0, y0), b = hash2i(x1, y0), c = hash2i(x0, y1), d = hash2i(x1, y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise2(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= gain; f *= lac; }
  return s / n;
}
function fbm2p(x, y, period, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise2p(x * f, y * f, period * f, period * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}
// Ridged noise for mountains/canyons.
function ridge2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(vnoise2(x * f + i * 31.7, y * f + i * 7.7) * 2 - 1)); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ---------------------------------------------------------------------------
// Vec3 — mutable small vector class. Use `tmpV` pools in hot code.
// ---------------------------------------------------------------------------
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  len() { return Math.hypot(this.x, this.y, this.z); }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  norm() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    this.x = x; this.y = y; this.z = z; return this;
  }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distSq(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
}

// ---------------------------------------------------------------------------
// Mat4 (column-major Float32Array(16), OpenGL conventions)
// ---------------------------------------------------------------------------
function m4() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function m4identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }
function m4mul(o, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return o;
}
function m4persp(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  return o;
}
function m4lookAt(o, eye, target, up) {
  let zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
  o[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
  o[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
  o[15] = 1;
  return o;
}
function m4invert(o, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
// Model matrix from position + orthonormal basis (right, up, forward) + euler
// rotation in that local frame (yaw about up, pitch about right, roll about fwd)
// and uniform/non-uniform scale. Models are authored facing -Z.
function m4frame(o, px, py, pz, R, U, F, yaw, pitch, roll, sx, sy = sx, sz = sx) {
  // local rotation L = Ry(yaw) * Rx(pitch) * Rz(roll) (in model axes, -Z forward)
  const cy = Math.cos(yaw), sy_ = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  // columns of L
  const l00 = cy * cr + sy_ * sp * sr, l01 = cp * sr, l02 = -sy_ * cr + cy * sp * sr;
  const l10 = -cy * sr + sy_ * sp * cr, l11 = cp * cr, l12 = sy_ * sr + cy * sp * cr;
  const l20 = sy_ * cp, l21 = -sp, l22 = cy * cp;
  // world basis: model X -> R, model Y -> U, model Z -> -F
  const bx0 = R.x, bx1 = R.y, bx2 = R.z;
  const by0 = U.x, by1 = U.y, by2 = U.z;
  const bz0 = -F.x, bz1 = -F.y, bz2 = -F.z;
  // M = B * L, column j = B * Lcol_j
  o[0] = (bx0 * l00 + by0 * l01 + bz0 * l02) * sx;
  o[1] = (bx1 * l00 + by1 * l01 + bz1 * l02) * sx;
  o[2] = (bx2 * l00 + by2 * l01 + bz2 * l02) * sx;
  o[3] = 0;
  o[4] = (bx0 * l10 + by0 * l11 + bz0 * l12) * sy;
  o[5] = (bx1 * l10 + by1 * l11 + bz1 * l12) * sy;
  o[6] = (bx2 * l10 + by2 * l11 + bz2 * l12) * sy;
  o[7] = 0;
  o[8] = (bx0 * l20 + by0 * l21 + bz0 * l22) * sz;
  o[9] = (bx1 * l20 + by1 * l21 + bz1 * l22) * sz;
  o[10] = (bx2 * l20 + by2 * l21 + bz2 * l22) * sz;
  o[11] = 0;
  o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
  return o;
}
const AXIS_X = new V3(1, 0, 0), AXIS_Y = new V3(0, 1, 0), AXIS_NZ = new V3(0, 0, -1);
function m4euler(o, px, py, pz, yaw, pitch, roll, s = 1) {
  return m4frame(o, px, py, pz, AXIS_X, AXIS_Y, AXIS_NZ, yaw, pitch, roll, s, s, s);
}

// Colors: hex → [r,g,b] floats
function hex(h, a) {
  if (typeof h !== 'string') return h;
  const n = parseInt(h.replace('#', ''), 16);
  const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  if (a !== undefined) c.push(a);
  return c;
}
function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
function cssColor(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

// Segment (p0 -> p1) vs sphere (c, r) intersection test.
function segSphere(p0x, p0y, p0z, p1x, p1y, p1z, cx, cy, cz, r) {
  const dx = p1x - p0x, dy = p1y - p0y, dz = p1z - p0z;
  const fx = p0x - cx, fy = p0y - cy, fz = p0z - cz;
  const dd = dx * dx + dy * dy + dz * dz;
  let t = dd > 0 ? -(fx * dx + fy * dy + fz * dz) / dd : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = fx + dx * t, qy = fy + dy * t, qz = fz + dz * t;
  return qx * qx + qy * qy + qz * qz <= r * r;
}

// Safe localStorage wrappers (private mode / sandboxed frames can throw).
const Store = {
  get(key, fallback) {
    try { const s = window.localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
};

// Tiny pool helper for particle-like objects.
class Pool {
  constructor(factory, n) { this.items = []; this.free = []; this.factory = factory; for (let i = 0; i < n; i++) { const o = factory(); o.alive = false; this.items.push(o); this.free.push(o); } }
  get() { let o = this.free.pop(); if (!o) { o = this.factory(); this.items.push(o); } o.alive = true; return o; }
  release(o) { if (o.alive) { o.alive = false; this.free.push(o); } }
}
