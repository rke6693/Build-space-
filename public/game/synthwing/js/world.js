'use strict';
// =============================================================================
// SYNTHWING 64 — world.js
// The rail (the path the squadron flies), environments for each world, and
// streaming heightfield terrain built in chunks as you fly.
// Rail space: (d, x, y) — d = distance along the rail. World position is
//   W(d,x,y) = (railX(d) + x, railY(d) + y, -d)
// which keeps gameplay maths in a simple, stable frame while the camera
// banks and sweeps along a curving path.
// =============================================================================

const CHUNK = 64, CHUNK_RES = 16;

class Rail {
  constructor(xf, yf) { this.xf = xf; this.yf = yf; }
  x(d) { return this.xf(d); }
  y(d) { return this.yf(d); }
  world(out, d, x, y) { out.x = this.xf(d) + x; out.y = this.yf(d) + y; out.z = -d; return out; }
  // Tangent (unit, world) at d
  tangent(out, d) {
    const dx = (this.xf(d + 1) - this.xf(d - 1)) * 0.5, dy = (this.yf(d + 1) - this.yf(d - 1)) * 0.5;
    out.set(dx, dy, -1).norm(); return out;
  }
  slope(d) { return [(this.xf(d + 1) - this.xf(d - 1)) * 0.5, (this.yf(d + 1) - this.yf(d - 1)) * 0.5]; }
}

// ----------------------------------------------------------------------------
// Environments
// ----------------------------------------------------------------------------
function nrm3(x, y, z) { const l = Math.hypot(x, y, z); return new Float32Array([x / l, y / l, z / l]); }
function f3(c) { return new Float32Array(c); }
function skyDef(o) {
  return Object.assign({ zenith: hex('#2a66d9'), horizon: hex('#b8e4ff'), ground: hex('#1b5aa8'), sunDir: nrm3(0.3, 0.3, -1), sunCol: hex('#fff0c0'), cloudCol: hex('#ffffff'), nebA: [0, 0, 0], nebB: [0, 0, 0], aurA: [0, 0, 0], aurB: [0, 0, 0], sun: 1, stars: 0, cloud: 0, aurora: 0, nebula: 0, horizonPow: 0.55, grid: 0 }, o);
}

const ENVS = {};
function buildEnvs() {
  // --- Corona Shores: tropical sea planet ------------------------------------
  ENVS.corona = {
    name: 'corona',
    sky: skyDef({ zenith: hex('#2a62d4'), horizon: hex('#bfe8ff'), ground: hex('#2a78c8'), sunDir: nrm3(0.32, 0.42, -1), sunCol: hex('#fff2c8'), cloud: 0.85, sun: 1 }),
    fog: f3(hex('#bfe8ff')), fogNear: 110, fogFar: 560,
    lightDir: nrm3(0.32, 0.8, -0.5), lightCol: f3([1.0, 0.95, 0.85]), ambient: f3([0.45, 0.5, 0.62]),
    water: { level: 0, tex: 'water', tint: [0.3, 0.62, 0.95, 0.8], scroll: [0.02, 0.06] },
    terrainTex: 'detail',
    height(wx, wz, rail) {
      const d = -wz, lat = wx - rail.x(d);
      const n = fbm2(wx * 0.0055 + 11, wz * 0.0055 - 3, 4);
      let h = -13 + smoothstep(0.52, 0.76, n) * 46 + fbm2(wx * 0.03, wz * 0.03, 2) * 5;
      const cap = lerp(-4, 80, smoothstep(26, 90, Math.abs(lat)));
      if (h > cap) h = cap + (h - cap) * 0.12;
      return h;
    },
    color(h, slope) {
      if (h < -0.5) return mixc(hex('#c9b27a'), hex('#8fb2a0'), clamp01(-h / 12));
      if (h < 2.2) return hex('#f0dca0');
      if (slope > 0.75) return mixc(hex('#8d8779'), hex('#6d675b'), clamp01((slope - 0.75) * 2));
      if (h < 20) return mixc(hex('#63c24f'), hex('#3f8f38'), clamp01((h - 2) / 18));
      return mixc(hex('#8d8779'), hex('#b9b3a4'), clamp01((h - 20) / 20));
    },
    props(rng, h, slope, add) {
      if (h > 1.8 && h < 9 && slope < 0.5 && rng() < 0.11) add('palm', rng() * TAU, 0.8 + rng() * 0.5);
      if (h > 14 && slope > 0.5 && rng() < 0.03) add('rock', rng() * TAU, 1 + rng());
    },
    bg: [{ mesh: 'planet', dir: nrm3(-0.55, 0.28, -1), dist: 900, scale: 70, tint: [0.85, 0.92, 1.0], emis: [0.35, 0.4, 0.5] }],
    particles: null,
    railY: 16,
  };
  // --- Title: Corona at golden hour -----------------------------------------
  ENVS.title = Object.assign({}, ENVS.corona, {
    name: 'title',
    sky: skyDef({ zenith: hex('#2b2a7a'), horizon: hex('#ffb77a'), ground: hex('#3a4a8a'), sunDir: nrm3(0.1, 0.12, -1), sunCol: hex('#ffcf80'), cloudCol: hex('#ff9fb0'), cloud: 0.9, sun: 1.3, horizonPow: 0.5 }),
    fog: f3(hex('#f7a97c')), fogNear: 90, fogFar: 520,
    lightDir: nrm3(0.1, 0.35, -1), lightCol: f3([1.1, 0.8, 0.6]), ambient: f3([0.45, 0.4, 0.6]),
    water: { level: 0, tex: 'water', tint: [0.55, 0.5, 0.85, 0.82], scroll: [0.02, 0.06] },
    bg: [{ mesh: 'planet', dir: nrm3(-0.5, 0.35, -1), dist: 900, scale: 80, tint: [1, 0.85, 0.9], emis: [0.4, 0.3, 0.4] }],
  });
  // --- Halo Belt: asteroid field in deep space ------------------------------
  ENVS.halo = {
    name: 'halo',
    sky: skyDef({ zenith: hex('#04040f'), horizon: hex('#160f36'), ground: hex('#04040f'), sunDir: nrm3(-0.5, 0.25, -1), sunCol: hex('#fff6e0'), nebA: hex('#6a2fd0'), nebB: hex('#1fb8c7'), stars: 1, nebula: 0.75, sun: 0.9, horizonPow: 0.8 }),
    fog: f3(hex('#0e0a26')), fogNear: 160, fogFar: 640,
    lightDir: nrm3(-0.5, 0.45, -0.7), lightCol: f3([1.05, 0.95, 0.85]), ambient: f3([0.26, 0.24, 0.42]),
    water: null, height: null,
    bg: [
      { mesh: 'planet', dir: nrm3(0.7, 0.15, -1), dist: 900, scale: 190, tint: [1.0, 0.62, 0.35], emis: [0.12, 0.06, 0.02], ring: true, tilt: 0.35 },
      { mesh: 'planet', dir: nrm3(-0.6, 0.45, -1), dist: 900, scale: 26, tint: [0.7, 0.75, 0.9], emis: [0.05, 0.05, 0.08] },
    ],
    particles: 'dust',
    railY: 0,
  };
  // --- Frostline: night ice canyon under the aurora --------------------------
  ENVS.frost = {
    name: 'frost',
    sky: skyDef({ zenith: hex('#050920'), horizon: hex('#26406e'), ground: hex('#0a1030'), sunDir: nrm3(-0.35, 0.45, -1), sunCol: hex('#dfeeff'), aurA: hex('#3dffb0'), aurB: hex('#a05cff'), stars: 0.9, aurora: 1.1, sun: 0.55 }),
    fog: f3(hex('#2b4a82')), fogNear: 90, fogFar: 480,
    lightDir: nrm3(-0.3, 0.7, -0.6), lightCol: f3([0.8, 0.9, 1.1]), ambient: f3([0.46, 0.52, 0.76]),
    water: { level: -6, tex: 'ice', tint: [0.75, 0.9, 1.0, 0.95], scroll: [0, 0] },
    terrainTex: 'snow',
    height(wx, wz, rail) {
      const d = -wz, lat = Math.abs(wx - rail.x(d));
      const half = 30 + Math.sin(d * 0.004) * 8;
      const wall = smoothstep(half, half + 26, lat);
      const r = ridge2(wx * 0.012, wz * 0.012, 4);
      let h = -8 + fbm2(wx * 0.04, wz * 0.04, 2) * 3;
      h += wall * (46 + r * 60);
      return h;
    },
    color(h, slope) {
      if (h < -5.5) return hex('#bfe9ff');
      if (slope > 0.9) return mixc(hex('#7582a0'), hex('#5a6684'), clamp01((slope - 0.9) * 1.5));
      if (slope > 0.6) return mixc(hex('#e6eefa'), hex('#8894b0'), clamp01((slope - 0.6) * 3.3));
      return hex('#f2f6ff');
    },
    props(rng, h, slope, add) {
      if (h > 30 && slope < 0.55 && rng() < 0.16) add('pine', rng() * TAU, 0.8 + rng() * 0.6);
      else if (h < 2 && h > -6 && rng() < 0.03) add('crystal', rng() * TAU, 0.6 + rng() * 0.8);
    },
    bg: [{ mesh: 'planet', dir: nrm3(-0.35, 0.45, -1), dist: 900, scale: 40, tint: [0.9, 0.95, 1.1], emis: [0.55, 0.6, 0.7] }],
    particles: 'snow',
    railY: 14,
  };
  // --- The Forge: volcanic industrial world ---------------------------------
  ENVS.forge = {
    name: 'forge',
    sky: skyDef({ zenith: hex('#1a0604'), horizon: hex('#e0521d'), ground: hex('#2a0a05'), sunDir: nrm3(0.25, 0.22, -1), sunCol: hex('#ff9050'), cloudCol: hex('#3a1612'), cloud: 0.75, sun: 1.2, horizonPow: 0.45 }),
    fog: f3(hex('#7a2a12')), fogNear: 70, fogFar: 430,
    lightDir: nrm3(0.25, 0.6, -0.8), lightCol: f3([1.1, 0.62, 0.42]), ambient: f3([0.42, 0.26, 0.22]),
    water: { level: 0, tex: 'lava', tint: [1.0, 0.75, 0.55, 1.0], scroll: [0.01, 0.03], emissive: true },
    terrainTex: 'rock',
    height(wx, wz, rail) {
      const d = -wz, lat = Math.abs(wx - rail.x(d));
      const n = fbm2(wx * 0.009 + 5, wz * 0.009, 4);
      let h = -6 + smoothstep(0.42, 0.6, n) * 26 + fbm2(wx * 0.05, wz * 0.05, 2) * 3;
      h = Math.min(h, lerp(3, 70, smoothstep(26, 70, lat)));
      h += smoothstep(60, 110, lat) * 30 * ridge2(wx * 0.01, wz * 0.01, 3);
      return h;
    },
    color(h, slope) {
      if (h < 1.5) return hex('#3a1c14');
      if (slope > 0.7) return hex('#2b211f');
      return mixc(hex('#4a3a34'), hex('#5f4a40'), clamp01(h / 30));
    },
    props(rng, h, slope, add) { if (h > 4 && rng() < 0.05) add('rock', rng() * TAU, 1 + rng() * 1.5); },
    bg: [],
    particles: 'embers',
    railY: 16,
  };
  // --- The Hush: a colourless void --------------------------------------------
  ENVS.hush = {
    name: 'hush',
    sky: skyDef({ zenith: hex('#07070b'), horizon: hex('#2c2c38'), ground: hex('#050507'), sunDir: nrm3(0, 0.2, -1), sunCol: hex('#ffffff'), nebA: hex('#303040'), nebB: hex('#b8b8d0'), stars: 0.6, nebula: 0.35, sun: 0.25, grid: 0.55, horizonPow: 0.7 }),
    fog: f3(hex('#15151d')), fogNear: 150, fogFar: 620,
    lightDir: nrm3(0.2, 0.8, -0.5), lightCol: f3([0.95, 0.95, 1.0]), ambient: f3([0.35, 0.35, 0.42]),
    water: null, height: null,
    bg: [{ mesh: 'planet', dir: nrm3(0, 0.25, -1), dist: 900, scale: 120, tint: [0.05, 0.05, 0.07], emis: [0, 0, 0], halo: true }],
    particles: 'static',
    railY: 0,
  };
  // --- Briefing: deep space map -------------------------------------------------
  ENVS.brief = {
    name: 'brief',
    sky: skyDef({ zenith: hex('#05051a'), horizon: hex('#140c30'), ground: hex('#05051a'), sunDir: nrm3(0.8, 0.2, -0.5), sunCol: hex('#fff0d0'), nebA: hex('#2f6fd0'), nebB: hex('#d02f9a'), stars: 1, nebula: 0.8, sun: 1 }),
    fog: f3(hex('#05051a')), fogNear: 2000, fogFar: 4000,
    lightDir: nrm3(0.8, 0.3, 0.5), lightCol: f3([1.1, 1.0, 0.95]), ambient: f3([0.18, 0.18, 0.3]),
    water: null, height: null, bg: [], particles: null, railY: 0,
  };
}

// ----------------------------------------------------------------------------
// Terrain streaming
// ----------------------------------------------------------------------------
class Terrain {
  constructor(env, rail, seed = 1) {
    this.env = env; this.rail = rail; this.seed = seed;
    this.chunks = new Map();
    this.queue = [];
    this.propMeshes = { palm: MODELS.palm, rock: MODELS.asteroids[1], pine: MODELS.pine, crystal: MODELS.crystal };
    this.tex = TEX[env.terrainTex || 'detail'];
    this.mat = { tex: this.tex, texMix: 0.85, uvScale: [1, 1] };
    this.waterMesh = null;
    if (env.water) this.waterMesh = buildWaterMesh();
  }
  height(wx, wz) { return this.env.height ? this.env.height(wx, wz, this.rail) : -9999; }
  key(cx, cz) { return cx + ',' + cz; }
  build(cx, cz) {
    const env = this.env, rail = this.rail, R = CHUNK_RES, S = CHUNK / R;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const H = new Float32Array((R + 3) * (R + 3));
    const idx = (i, j) => (j + 1) * (R + 3) + (i + 1);
    for (let j = -1; j <= R + 1; j++) for (let i = -1; i <= R + 1; i++) H[idx(i, j)] = env.height(x0 + i * S, z0 + j * S, rail);
    const N = (i, j) => { const dx = H[idx(i + 1, j)] - H[idx(i - 1, j)], dz = H[idx(i, j + 1)] - H[idx(i, j - 1)]; const l = Math.hypot(dx, 2 * S, dz); return [-dx / l, (2 * S) / l, -dz / l]; };
    const out = [];
    const cols = new Array((R + 1) * (R + 1));
    const nrms = new Array((R + 1) * (R + 1));
    for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) {
      const n = N(i, j), h = H[idx(i, j)];
      const slope = 1 - n[1];
      const c = env.color(h, slope * 3.2);
      const jit = 0.94 + hash2i(x0 + i * 7, z0 + j * 13) * 0.1;
      cols[j * (R + 1) + i] = [c[0] * jit, c[1] * jit, c[2] * jit];
      nrms[j * (R + 1) + i] = n;
    }
    const V = (i, j) => {
      const h = H[idx(i, j)], n = nrms[j * (R + 1) + i], c = cols[j * (R + 1) + i];
      out.push(x0 + i * S, h, z0 + j * S, n[0], n[1], n[2], c[0], c[1], c[2], 1, (x0 + i * S) / 16, (z0 + j * S) / 16);
    };
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      // alternate diagonals for a less regular look
      if ((i + j) & 1) { V(i, j); V(i, j + 1); V(i + 1, j + 1); V(i, j); V(i + 1, j + 1); V(i + 1, j); }
      else { V(i, j); V(i, j + 1); V(i + 1, j); V(i + 1, j); V(i, j + 1); V(i + 1, j + 1); }
    }
    // Decorative props merged into the chunk mesh (no extra draw calls)
    if (env.props) {
      const rng = mulberry32((cx * 73856093) ^ (cz * 19349663) ^ this.seed);
      const pb = new MB();
      const m = m4();
      for (let k = 0; k < 40; k++) {
        const fx = rng() * CHUNK, fz = rng() * CHUNK;
        const wx = x0 + fx, wz = z0 + fz;
        const h = env.height(wx, wz, rail);
        const lat = Math.abs(wx - rail.x(-wz));
        if (lat < 14) continue;
        const hx = env.height(wx + 2, wz, rail), hz = env.height(wx, wz + 2, rail);
        const slope = Math.hypot(hx - h, hz - h) / 2;
        env.props(rng, h, slope, (name, rot, s) => {
          const mesh = name === 'rock' ? MODELS.asteroids[(k % 3) + 1] : this.propMeshes[name];
          if (!mesh) return;
          m4euler(m, wx, h - 0.3, wz, rot, 0, 0, s * (name === 'rock' ? 3 : 1));
          pb.addMesh(mesh, m);
        });
      }
      if (pb.v.length) for (const f of pb.v) out.push(f);
    }
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < H.length; i++) { if (H[i] < mn) mn = H[i]; if (H[i] > mx) mx = H[i]; }
    mx += 14; // props
    const mesh = new Mesh(new Float32Array(out), { radius: CHUNK });
    return { cx, cz, mesh, center: new V3(x0 + CHUNK / 2, (mn + mx) / 2, z0 + CHUNK / 2), rad: Math.hypot(CHUNK * 0.71, (mx - mn) / 2) + 4 };
  }
  update(camD, lookAhead, renderer, budget = 2) {
    if (!this.env.height) return;
    const rail = this.rail;
    const want = new Set();
    const needList = [];
    const zNear = -(camD - 40), zFar = -(camD + lookAhead);
    const cz0 = Math.floor(zFar / CHUNK), cz1 = Math.floor(zNear / CHUNK);
    for (let cz = cz1; cz >= cz0; cz--) {
      const d = -(cz * CHUNK + CHUNK / 2);
      const cxC = rail.x(d);
      const halfW = 160 + (d - camD) * 0.35;
      const cxa = Math.floor((cxC - halfW) / CHUNK), cxb = Math.floor((cxC + halfW) / CHUNK);
      for (let cx = cxa; cx <= cxb; cx++) {
        const k = this.key(cx, cz);
        want.add(k);
        if (!this.chunks.has(k)) needList.push([cx, cz, Math.abs(d - camD) + Math.abs(cx * CHUNK + 32 - cxC) * 0.5]);
      }
    }
    needList.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < Math.min(budget, needList.length); i++) { const [cx, cz] = needList[i]; this.chunks.set(this.key(cx, cz), this.build(cx, cz)); }
    for (const [k, c] of this.chunks) if (!want.has(k)) { renderer.freeMesh(c.mesh); this.chunks.delete(k); }
  }
  prewarm(camD, lookAhead, renderer) { let guard = 0; while (guard++ < 200) { const n = this.chunks.size; this.update(camD, lookAhead, renderer, 50); if (this.chunks.size === n) break; } }
  draw(r, cam, frustum) {
    if (this.env.height) {
      const I = IDENT4;
      for (const c of this.chunks.values()) {
        if (frustum && !frustum.sphere(c.center.x, c.center.y, c.center.z, c.rad)) continue;
        r.draw(c.mesh, I, this.mat);
      }
    }
  }
  drawWater(r, cam, time) {
    const w = this.env.water;
    if (!w || !this.waterMesh) return;
    const cell = 24;
    const sx = Math.round(cam.pos.x / cell) * cell, sz = Math.round(cam.pos.z / cell) * cell;
    const m = _waterM; m4identity(m); m[12] = sx; m[13] = w.level; m[14] = sz;
    const mat = _waterMat;
    mat.tex = TEX[w.tex]; mat.tint = w.tint; mat.scroll = [time * w.scroll[0], time * w.scroll[1]];
    mat.blend = w.tint[3] < 1 ? 'alpha' : null;
    mat.emis = w.emissive ? [0.35, 0.12, 0.02] : null;
    r.draw(this.waterMesh, m, mat);
  }
  dispose(r) { for (const c of this.chunks.values()) r.freeMesh(c.mesh); this.chunks.clear(); }
}
const _waterM = m4();
const _waterMat = { texMix: 1 };
function buildWaterMesh() {
  const b = new MB(), N = 44, cell = 24, h = (N * cell) / 2;
  const col = [1, 1, 1, 1];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x0 = -h + i * cell, z0 = -h + j * cell;
    b.quad([x0, 0, z0 + cell], [x0 + cell, 0, z0 + cell], [x0 + cell, 0, z0], [x0, 0, z0], col, [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]]);
  }
  return b.build('water');
}

// View-frustum planes for culling
class Frustum {
  constructor() { this.p = new Float32Array(24); }
  setFrom(m) {
    const p = this.p;
    const set = (i, a, b, c, d) => { const l = Math.hypot(a, b, c); p[i] = a / l; p[i + 1] = b / l; p[i + 2] = c / l; p[i + 3] = d / l; };
    set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  }
  sphere(x, y, z, r) {
    const p = this.p;
    for (let i = 0; i < 24; i += 4) if (p[i] * x + p[i + 1] * y + p[i + 2] * z + p[i + 3] < -r) return false;
    return true;
  }
}
