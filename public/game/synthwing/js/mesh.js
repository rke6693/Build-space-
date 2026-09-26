'use strict';
// =============================================================================
// SYNTHWING 64 — mesh.js
// MeshBuilder: build low-poly, vertex-coloured models from primitives with a
// transform stack. Also procedural textures (32x32, N64 texture-memory sized),
// the sprite atlas and the chrome environment map.
// =============================================================================

class MB {
  constructor() {
    this.v = [];
    this.stack = [m4()];
    this.m = this.stack[0];
    this.uvs = 1; // uv scale for auto-uv primitives
  }
  push() { const n = m4(); n.set(this.m); this.stack.push(n); this.m = n; return this; }
  pop() { this.stack.pop(); this.m = this.stack[this.stack.length - 1]; return this; }
  _mulLocal(t) { const r = m4(); m4mul(r, this.m, t); this.m.set(r); return this; }
  translate(x, y, z) { const t = m4(); t[12] = x; t[13] = y; t[14] = z; return this._mulLocal(t); }
  scale(x, y = x, z = x) { const t = m4(); t[0] = x; t[5] = y; t[10] = z; return this._mulLocal(t); }
  rotateX(a) { const t = m4(), c = Math.cos(a), s = Math.sin(a); t[5] = c; t[6] = s; t[9] = -s; t[10] = c; return this._mulLocal(t); }
  rotateY(a) { const t = m4(), c = Math.cos(a), s = Math.sin(a); t[0] = c; t[2] = -s; t[8] = s; t[10] = c; return this._mulLocal(t); }
  rotateZ(a) { const t = m4(), c = Math.cos(a), s = Math.sin(a); t[0] = c; t[1] = s; t[4] = -s; t[5] = c; return this._mulLocal(t); }

  _xf(p) {
    const m = this.m, x = p[0], y = p[1], z = p[2];
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }
  // Triangle in local space; colour [r,g,b,(lit)] — lit=0 means emissive/unlit.
  tri(a, b, c, col, ua, ub, uc) {
    const A = this._xf(a), B = this._xf(b), C = this._xf(c);
    this.triW(A, B, C, col, ua, ub, uc);
    return this;
  }
  triW(A, B, C, col, ua, ub, uc) {
    const e1x = B[0] - A[0], e1y = B[1] - A[1], e1z = B[2] - A[2];
    const e2x = C[0] - A[0], e2y = C[1] - A[1], e2z = C[2] - A[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const lit = col.length > 3 ? col[3] : 1;
    const ca = col.ca || col, cb = col.cb || col, cc = col.cc || col;
    ua = ua || ZUV; ub = ub || ZUV; uc = uc || ZUV;
    this.v.push(A[0], A[1], A[2], nx, ny, nz, ca[0], ca[1], ca[2], lit, ua[0], ua[1]);
    this.v.push(B[0], B[1], B[2], nx, ny, nz, cb[0], cb[1], cb[2], lit, ub[0], ub[1]);
    this.v.push(C[0], C[1], C[2], nx, ny, nz, cc[0], cc[1], cc[2], lit, uc[0], uc[1]);
  }
  quad(a, b, c, d, col, uv) {
    uv = uv || QUV;
    this.tri(a, b, c, col, uv[0], uv[1], uv[2]);
    this.tri(a, c, d, col, uv[0], uv[2], uv[3]);
    return this;
  }
  // Axis-aligned box. col may be a colour or {top,bottom,side,front,back,left,right}.
  box(cx, cy, cz, w, h, d, col, uvScale) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const P = (x, y, z) => [cx + x, cy + y, cz + z];
    const p000 = P(-hx, -hy, -hz), p100 = P(hx, -hy, -hz), p110 = P(hx, hy, -hz), p010 = P(-hx, hy, -hz);
    const p001 = P(-hx, -hy, hz), p101 = P(hx, -hy, hz), p111 = P(hx, hy, hz), p011 = P(-hx, hy, hz);
    const c = (k) => (Array.isArray(col) || col.length ? col : col[k] || col.side || col.all);
    const s = uvScale || 0;
    const uvF = (uw, uh) => s ? [[0, 0], [uw * s, 0], [uw * s, uh * s], [0, uh * s]] : QUV;
    this.quad(p001, p101, p111, p011, c('front'), uvF(w, h));
    this.quad(p100, p000, p010, p110, c('back'), uvF(w, h));
    this.quad(p101, p100, p110, p111, c('right'), uvF(d, h));
    this.quad(p000, p001, p011, p010, c('left'), uvF(d, h));
    this.quad(p011, p111, p110, p010, c('top'), uvF(w, d));
    this.quad(p000, p100, p101, p001, c('bottom'), uvF(w, d));
    return this;
  }
  // Surface of revolution around +Y. profile: [[r, y], ...] bottom→top.
  lathe(profile, segs, col, opts = {}) {
    const a0 = opts.phase || 0;
    const cols = typeof col === 'function' ? col : () => col;
    for (let j = 0; j < profile.length - 1; j++) {
      const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
      const cc = cols(j, profile.length - 1);
      for (let i = 0; i < segs; i++) {
        const t0 = a0 + (i / segs) * TAU, t1 = a0 + ((i + 1) / segs) * TAU;
        const s0 = Math.sin(t0), c0 = Math.cos(t0), s1 = Math.sin(t1), c1 = Math.cos(t1);
        const b0 = [r0 * s0, y0, r0 * c0], b1 = [r0 * s1, y0, r0 * c1];
        const u0 = [r1 * s0, y1, r1 * c0], u1 = [r1 * s1, y1, r1 * c1];
        const uv = [[i / segs, j], [(i + 1) / segs, j], [(i + 1) / segs, j + 1], [i / segs, j + 1]];
        if (r0 > 1e-6) this.tri(b0, b1, u1, cc, uv[0], uv[1], uv[2]);
        if (r1 > 1e-6) this.tri(b0, u1, u0, cc, uv[0], uv[2], uv[3]);
      }
    }
    if (opts.capBottom && profile[0][0] > 0) this.disc(profile[0][0], profile[0][1], segs, opts.capCol || cols(0, 1), true, a0);
    if (opts.capTop && profile[profile.length - 1][0] > 0) this.disc(profile[profile.length - 1][0], profile[profile.length - 1][1], segs, opts.capCol || cols(profile.length - 2, profile.length - 1), false, a0);
    return this;
  }
  disc(r, y, segs, col, down, phase = 0) {
    for (let i = 0; i < segs; i++) {
      const t0 = phase + (i / segs) * TAU, t1 = phase + ((i + 1) / segs) * TAU;
      const a = [r * Math.sin(t0), y, r * Math.cos(t0)], b = [r * Math.sin(t1), y, r * Math.cos(t1)];
      if (down) this.tri([0, y, 0], b, a, col); else this.tri([0, y, 0], a, b, col);
    }
    return this;
  }
  cylinder(r0, r1, y0, y1, segs, col, caps = true, phase) {
    return this.lathe([[r0, y0], [r1, y1]], segs, col, { capBottom: caps, capTop: caps, phase });
  }
  sphere(r, segW, segH, col) {
    const prof = [];
    for (let j = 0; j <= segH; j++) { const a = -PI / 2 + (j / segH) * PI; prof.push([Math.cos(a) * r, Math.sin(a) * r]); }
    prof[0][0] = 0; prof[segH][0] = 0;
    return this.lathe(prof, segW, col);
  }
  // Octahedron / diamond with separate radii.
  diamond(rx, ry, rzF, rzB, col) {
    const T = [0, ry, 0], Bt = [0, -ry, 0], Lf = [-rx, 0, 0], Rt = [rx, 0, 0], F = [0, 0, -rzF], K = [0, 0, rzB];
    const cc = typeof col === 'function' ? col : () => col;
    this.tri(T, F, Lf, cc(0)); this.tri(T, Rt, F, cc(1)); this.tri(T, K, Rt, cc(2)); this.tri(T, Lf, K, cc(3));
    this.tri(Bt, Lf, F, cc(4)); this.tri(Bt, F, Rt, cc(5)); this.tri(Bt, Rt, K, cc(6)); this.tri(Bt, K, Lf, cc(7));
    return this;
  }
  // Icosphere with optional per-vertex displacement fn(x,y,z)->scale and colour fn.
  ico(r, detail, col, displace) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map((v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const cache = new Map(), nf = [];
      const mid = (a, b) => {
        const k = a < b ? a + '_' + b : b + '_' + a;
        if (cache.has(k)) return cache.get(k);
        const va = verts[a], vb = verts[b];
        const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
        const l = Math.hypot(...m); verts.push([m[0] / l, m[1] / l, m[2] / l]);
        cache.set(k, verts.length - 1); return verts.length - 1;
      };
      for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      faces = nf;
    }
    const pv = verts.map((v) => { const s = displace ? displace(v[0], v[1], v[2]) : 1; return [v[0] * r * s, v[1] * r * s, v[2] * r * s]; });
    const cc = typeof col === 'function' ? col : () => col;
    for (const [a, b, c] of faces) {
      const cx = (verts[a][0] + verts[b][0] + verts[c][0]) / 3, cy = (verts[a][1] + verts[b][1] + verts[c][1]) / 3, cz = (verts[a][2] + verts[b][2] + verts[c][2]) / 3;
      this.tri(pv[a], pv[b], pv[c], cc(cx, cy, cz));
    }
    return this;
  }
  // Extrude a simple polygon given in (x,z) with thickness t (centered on y=0).
  extrude(pts, t, col, colSide, bevelTop = 0) {
    const tris = triangulate(pts);
    const h = t / 2;
    const cs = colSide || col;
    for (const [a, b, c] of tris) {
      const A = pts[a], B = pts[b], C = pts[c];
      // orient top (+Y)
      const cr = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
      const [p, q, r] = cr > 0 ? [A, B, C] : [A, C, B];
      this.tri([p[0], h + bevelTop, p[1]], [q[0], h + bevelTop, q[1]], [r[0], h + bevelTop, r[1]], col, [p[0], p[1]], [q[0], q[1]], [r[0], r[1]]);
      this.tri([p[0], -h, p[1]], [r[0], -h, r[1]], [q[0], -h, q[1]], cs, [p[0], p[1]], [r[0], r[1]], [q[0], q[1]]);
    }
    const area = polyArea(pts);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (area > 0) this.quad([a[0], -h, a[1]], [a[0], h + bevelTop, a[1]], [b[0], h + bevelTop, b[1]], [b[0], -h, b[1]], cs);
      else this.quad([a[0], -h, a[1]], [b[0], -h, b[1]], [b[0], h + bevelTop, b[1]], [a[0], h + bevelTop, a[1]], cs);
    }
    return this;
  }
  torus(R, r, segs, sides, col) {
    const cc = typeof col === 'function' ? col : () => col;
    const P = (i, j) => { const u = (i / segs) * TAU, v = (j / sides) * TAU; const rr = R + r * Math.cos(v); return [rr * Math.cos(u), r * Math.sin(v), rr * Math.sin(u)]; };
    for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) {
      this.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), cc(i, j));
    }
    return this;
  }
  // Add a pre-built mesh's triangles, transformed by matrix m (and tinted).
  addMesh(mesh, m, tint) {
    const d = mesh.data;
    for (let i = 0; i < d.length; i += 12) {
      const x = d[i], y = d[i + 1], z = d[i + 2], nx = d[i + 3], ny = d[i + 4], nz = d[i + 5];
      const X = m[0] * x + m[4] * y + m[8] * z + m[12], Y = m[1] * x + m[5] * y + m[9] * z + m[13], Z = m[2] * x + m[6] * y + m[10] * z + m[14];
      let NX = m[0] * nx + m[4] * ny + m[8] * nz, NY = m[1] * nx + m[5] * ny + m[9] * nz, NZ = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(NX, NY, NZ) || 1;
      this.v.push(X, Y, Z, NX / l, NY / l, NZ / l, d[i + 6] * (tint ? tint[0] : 1), d[i + 7] * (tint ? tint[1] : 1), d[i + 8] * (tint ? tint[2] : 1), d[i + 9], d[i + 10], d[i + 11]);
    }
    return this;
  }
  // Average normals of vertices sharing a position (Gouraud "smooth" look).
  smoothNormals(maxAngleDeg = 70) {
    const v = this.v, map = new Map(), cosT = Math.cos(maxAngleDeg * DEG);
    const key = (i) => `${Math.round(v[i] * 1000)},${Math.round(v[i + 1] * 1000)},${Math.round(v[i + 2] * 1000)}`;
    for (let i = 0; i < v.length; i += 12) { const k = key(i); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
    const out = new Float32Array(v.length); out.set(v);
    for (const list of map.values()) {
      for (const i of list) {
        let sx = 0, sy = 0, sz = 0;
        for (const j of list) { const d = v[i + 3] * v[j + 3] + v[i + 4] * v[j + 4] + v[i + 5] * v[j + 5]; if (d >= cosT) { sx += v[j + 3]; sy += v[j + 4]; sz += v[j + 5]; } }
        const l = Math.hypot(sx, sy, sz) || 1;
        out[i + 3] = sx / l; out[i + 4] = sy / l; out[i + 5] = sz / l;
      }
    }
    this.v = Array.from(out);
    return this;
  }
  build(name) { return new Mesh(new Float32Array(this.v), { name }); }
}
const ZUV = [0, 0];
const QUV = [[0, 0], [1, 0], [1, 1], [0, 1]];

function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
// Ear clipping triangulation for simple polygons (2D [x,y] arrays).
function triangulate(pts) {
  const n = pts.length; if (n < 3) return [];
  const idx = []; for (let i = 0; i < n; i++) idx.push(i);
  if (polyArea(pts) < 0) idx.reverse();
  const out = [];
  const inside = (p, a, b, c) => {
    const s = (u, v, w) => (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1]);
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = pts[i0], b = pts[i1], c = pts[i2];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cross <= 0) continue;
      let ok = true;
      for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (inside(pts[j], a, b, c)) { ok = false; break; } }
      if (!ok) continue;
      out.push([i0, i1, i2]); idx.splice(i, 1); clipped = true; break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

// -----------------------------------------------------------------------------
// Procedural textures
// -----------------------------------------------------------------------------
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texFromFn(size, fn, opts) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = fn(x, y), o = (y * size + x) * 4;
    img.data[o] = clamp(p[0] * 255, 0, 255); img.data[o + 1] = clamp(p[1] * 255, 0, 255); img.data[o + 2] = clamp(p[2] * 255, 0, 255);
    img.data[o + 3] = p.length > 3 ? clamp(p[3] * 255, 0, 255) : 255;
  }
  g.putImageData(img, 0, 0);
  return new Texture(c, opts);
}

const TEX = {};
function buildTextures() {
  const S = 32;
  TEX.detail = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 8, y / 8, 4, 3) * 0.7 + hash2i(x, y) * 0.3;
    const v = 0.72 + n * 0.4; return [v, v, v];
  });
  TEX.grass = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 6, y / 6, S / 6 | 0 || 5, 3), b = hash2i(x * 3, y * 7);
    const blade = (b > 0.82 ? 0.18 : 0) - (b < 0.1 ? 0.12 : 0);
    const v = 0.78 + n * 0.3 + blade; return [v, v, v];
  });
  TEX.rock = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 5, y / 5, 6, 4), crack = Math.abs(vnoise2p(x / 4, y / 9, 8, 4) - 0.5) < 0.04 ? -0.25 : 0;
    const v = 0.62 + n * 0.5 + crack; return [v, v * 0.98, v * 0.95];
  });
  TEX.water = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 8, y / 8, 4, 3);
    const w = Math.sin((x / S) * TAU * 2 + n * 6) * 0.5 + 0.5;
    const hi = smoothstep(0.82, 0.95, w * (0.6 + n * 0.6));
    return [0.55 + hi * 0.6 + n * 0.1, 0.8 + hi * 0.25 + n * 0.1, 1.0, 0.82 + hi * 0.18];
  });
  TEX.lava = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 6, y / 6, 5, 4);
    const cell = vnoise2p(x / 5, y / 5, 6, 6);
    const crust = smoothstep(0.45, 0.6, cell) * 0.85;
    const hot = 0.7 + n * 0.5;
    return [lerp(1.0 * hot, 0.25, crust), lerp(0.45 * hot, 0.08, crust), lerp(0.08, 0.05, crust)];
  });
  TEX.metal = texFromFn(S, (x, y) => {
    let v = 0.78 + hash2i(x, y) * 0.08;
    if (x % 16 === 0 || y % 16 === 0) v = 0.45;
    if (x % 16 === 1 || y % 16 === 1) v = 0.95;
    if ((x % 16 === 3 || x % 16 === 13) && (y % 16 === 3 || y % 16 === 13)) v = 0.4;
    return [v, v, v * 1.03];
  });
  TEX.hazard = texFromFn(S, (x, y) => (((x + y) >> 3) & 1 ? [0.12, 0.12, 0.12] : [1.0, 0.8, 0.1]));
  TEX.static = texFromFn(S, (x, y) => {
    const line = hash2i(0, y) > 0.78 ? 0.9 : 0;
    const n = hash2i(x >> 2, y) * 0.35 + line * (0.5 + hash2i(x, y) * 0.5);
    return [0.55 + n * 0.8, 0.5 + n * 0.3, 0.6 + n * 0.9];
  });
  TEX.windows = texFromFn(S, (x, y) => {
    const wx = x % 8, wy = y % 8;
    const win = wx > 1 && wx < 6 && wy > 1 && wy < 6;
    const lit = hash2i(x >> 3, y >> 3) > 0.55;
    if (win) return lit ? [1.3, 1.2, 0.8] : [0.35, 0.45, 0.6];
    return [1, 1, 1];
  });
  TEX.snow = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 6, y / 6, 5, 3), s = hash2i(x, y) > 0.93 ? 0.12 : 0;
    const v = 0.85 + n * 0.2 + s; return [v, v, v];
  });
  TEX.ice = texFromFn(S, (x, y) => {
    const n = fbm2p(x / 4, y / 12, 8, 3);
    const streak = smoothstep(0.62, 0.7, vnoise2p(x / 2, y / 16, 16, 2));
    return [0.75 + n * 0.25 + streak * 0.3, 0.9 + n * 0.1 + streak * 0.2, 1.0];
  });
  TEX.checker = texFromFn(S, (x, y) => (((x >> 3) + (y >> 3)) & 1 ? [0.85, 0.85, 0.85] : [1, 1, 1]));
  TEX.grid = texFromFn(S, (x, y) => (x % 16 === 0 || y % 16 === 0 ? [1.6, 1.6, 1.6] : [0.35, 0.35, 0.4]));

  // Chrome sphere map (sky above, bright horizon band, dark ground below)
  TEX.env = texFromFn(64, (x, y) => {
    const u = (x + 0.5) / 64 * 2 - 1, v = (y + 0.5) / 64 * 2 - 1;
    const r = Math.hypot(u, v);
    if (r > 1) return [0.4, 0.45, 0.55];
    const ny = -v; // up
    let c;
    if (ny > 0.08) c = mixc([0.95, 0.98, 1.0], [0.35, 0.55, 0.95], smoothstep(0.08, 0.95, ny));
    else if (ny > -0.06) c = [1.25, 1.2, 1.05];
    else c = mixc([0.55, 0.5, 0.45], [0.18, 0.16, 0.2], smoothstep(-0.06, -0.8, ny));
    const spec = Math.pow(Math.max(0, 1 - Math.hypot(u + 0.35, v + 0.45) * 2.2), 3) * 1.2;
    return [c[0] + spec, c[1] + spec, c[2] + spec];
  }, { filter: 'linear', wrap: 'clamp' });

  TEX.atlas = buildAtlas();
}

function buildAtlas() {
  const C = 64, c = makeCanvas(C * 4, C * 4), g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * C, Math.floor(i / 4) * C); g.beginPath(); g.rect(0, 0, C, C); g.clip(); fn(g); g.restore(); };
  const radial = (g, stops, r = 32) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, r); for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`); g.fillStyle = gr; g.fillRect(0, 0, C, C); };
  // 0 soft glow
  cell(0, (g) => radial(g, [[0, 1], [0.25, 0.6], [0.6, 0.15], [1, 0]]));
  // 1 hard dot
  cell(1, (g) => radial(g, [[0, 1], [0.7, 1], [0.85, 0.5], [1, 0]], 30));
  // 2 ring
  cell(2, (g) => radial(g, [[0, 0], [0.6, 0], [0.75, 1], [0.88, 0.4], [1, 0]], 31));
  // 3 sparkle
  cell(3, (g) => {
    radial(g, [[0, 1], [0.15, 0.5], [0.4, 0]], 32);
    g.fillStyle = '#fff';
    for (const [w, h] of [[2.2, 30], [30, 2.2]]) { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(32 - w, 32 - h, w * 2, h * 2); }
  });
  // 4 streak (horizontal ellipse)
  cell(4, (g) => { g.save(); g.translate(32, 32); g.scale(1, 0.22); g.translate(-32, -32); radial(g, [[0, 1], [0.5, 0.6], [1, 0]], 32); g.restore(); });
  // 5 smoke puff (putImageData ignores transforms, so place it explicitly)
  {
    const img = g.createImageData(C, C);
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const dx = (x - 32) / 32, dy = (y - 32) / 32, r = Math.hypot(dx, dy);
      const n = fbm2(x / 9, y / 9, 3);
      const a = clamp((1 - r) * 1.6 * (0.55 + n * 0.8) - 0.1, 0, 1);
      const o = (y * C + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 255;
    }
    g.putImageData(img, (5 % 4) * C, Math.floor(5 / 4) * C);
  }
  // 6 eighth note ♪
  cell(6, (g) => {
    g.fillStyle = '#fff'; g.strokeStyle = '#fff';
    g.save(); g.translate(26, 46); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 11, 8, 0, 0, TAU); g.fill(); g.restore();
    g.fillRect(34, 10, 5, 36);
    g.beginPath(); g.moveTo(39, 10); g.quadraticCurveTo(54, 18, 50, 34); g.quadraticCurveTo(48, 24, 39, 22); g.fill();
  });
  // 7 beamed notes ♫
  cell(7, (g) => {
    g.fillStyle = '#fff';
    for (const [x, y] of [[18, 48], [44, 42]]) { g.save(); g.translate(x, y); g.rotate(-0.35); g.beginPath(); g.ellipse(0, 0, 8, 6, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillRect(23, 14, 4, 34); g.fillRect(49, 8, 4, 34);
    g.beginPath(); g.moveTo(23, 14); g.lineTo(53, 8); g.lineTo(53, 16); g.lineTo(23, 22); g.fill();
  });
  // 8 hexagon (lens flare)
  cell(8, (g) => {
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28); } g.closePath();
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = gr; g.fill();
  });
  // 9 thin shock ring
  cell(9, (g) => radial(g, [[0, 0], [0.82, 0], [0.9, 1], [0.97, 0.3], [1, 0]], 31));
  // 10 laser bolt capsule
  cell(10, (g) => { g.save(); g.translate(32, 32); g.scale(1, 0.3); g.translate(-32, -32); radial(g, [[0, 1], [0.55, 1], [0.8, 0.5], [1, 0]], 32); g.restore(); });
  // 11 snowflake / cross sparkle
  cell(11, (g) => {
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI; g.beginPath(); g.moveTo(32 - Math.cos(a) * 24, 32 - Math.sin(a) * 24); g.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24); g.stroke(); }
  });
  // 12 bullet orb
  cell(12, (g) => radial(g, [[0, 1], [0.35, 1], [0.5, 0.55], [0.75, 0.35], [1, 0]], 31));
  // 13 diamond
  cell(13, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 4); g.lineTo(58, 32); g.lineTo(32, 60); g.lineTo(6, 32); g.closePath(); g.fill(); });
  // 14 plus
  cell(14, (g) => { g.fillStyle = '#fff'; g.fillRect(26, 6, 12, 52); g.fillRect(6, 26, 52, 12); });
  // 15 soft square
  cell(15, (g) => { g.fillStyle = '#fff'; g.fillRect(8, 8, 48, 48); });
  return new Texture(c, { filter: 'linear', wrap: 'clamp' });
}
const SPR = { GLOW: 0, DOT: 1, RING: 2, SPARKLE: 3, STREAK: 4, SMOKE: 5, NOTE: 6, NOTES: 7, HEX: 8, SHOCK: 9, BOLT: 10, FLAKE: 11, ORB: 12, DIAMOND: 13, PLUS: 14, SQUARE: 15 };
