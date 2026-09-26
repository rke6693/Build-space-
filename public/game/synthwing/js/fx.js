'use strict';
// =============================================================================
// SYNTHWING 64 — fx.js
// Particles (additive and alpha sprites), debris, explosion shells, ribbon
// trails, weather, and floating score text.
// =============================================================================

class Particle {
  constructor() { this.alive = false; }
}

const FX = {
  parts: [], pool: null, debris: [], shells: [], trails: [], texts: [], weather: [],
  weatherKind: null, reducedFlash: false,
  init() {
    this.pool = new Pool(() => new Particle(), 1800);
  },
  clear() {
    for (const p of this.parts) this.pool.release(p);
    this.parts.length = 0; this.debris.length = 0; this.shells.length = 0; this.trails.length = 0; this.texts.length = 0; this.weather.length = 0;
  },
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, frame, add = true, drag = 0, grav = 0) {
    if (this.parts.length > 1700) return null;
    const p = this.pool.get();
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.r = r; p.g = g; p.b = b; p.a = a;
    p.frame = frame; p.add = add; p.drag = drag; p.grav = grav; p.rot = Math.random() * TAU; p.vrot = (Math.random() - 0.5) * 4;
    p.stretch = 0; p.fadeIn = 0; p.r1 = -1;
    this.parts.push(p);
    return p;
  },
  // ---- recipes -----------------------------------------------------------------
  explode(x, y, z, size = 1, opt = {}) {
    const ivx = opt.vx || 0, ivy = opt.vy || 0, ivz = opt.vz || 0;
    const pal = opt.palette || [[1, 0.85, 0.4], [1, 0.45, 0.15], [1, 0.2, 0.5]];
    const s = size;
    this.spawn(x, y, z, ivx, ivy, ivz, 0.22, 7 * s, 1 * s, 1, 1, 0.95, 1, SPR.GLOW);
    for (let i = 0; i < 10 + s * 6; i++) {
      const c = pick(pal), sp = rr(6, 20) * Math.sqrt(s);
      const [dx, dy, dz] = randDir();
      this.spawn(x, y, z, ivx + dx * sp, ivy + dy * sp, ivz + dz * sp, rr(0.35, 0.7), rr(2.2, 4) * s, 0.2, c[0], c[1], c[2], 1, SPR.GLOW, true, 3.5);
    }
    for (let i = 0; i < 8 + s * 4; i++) {
      const sp = rr(20, 45) * Math.sqrt(s), [dx, dy, dz] = randDir();
      const p = this.spawn(x, y, z, ivx + dx * sp, ivy + dy * sp, ivz + dz * sp, rr(0.3, 0.6), 0.35 * s, 0.1, 1, 0.9, 0.5, 1, SPR.STREAK, true, 2, -18);
      if (p) p.stretch = 0.05;
    }
    for (let i = 0; i < 3 + s * 2; i++) {
      const [dx, dy, dz] = randDir();
      this.spawn(x + dx * s, y + dy * s, z + dz * s, ivx * 0.6 + dx * 3, ivy * 0.6 + 3 + dy * 2, ivz * 0.6 + dz * 3, rr(0.9, 1.6), 2 * s, 5 * s, 0.25, 0.22, 0.26, 0.55, SPR.SMOKE, false, 1.2);
    }
    const ring = this.spawn(x, y, z, ivx, ivy, ivz, 0.35, 1 * s, 9 * s, 1, 0.8, 0.6, 0.9, SPR.SHOCK);
    // musical notes — the signature of a Static unit being "re-tuned"
    if (opt.notes !== false) for (let i = 0; i < 2 + Math.floor(s); i++) {
      const hue = (Math.random() + (opt.hue || 0)) % 1, c = hsl(hue, 0.9, 0.65);
      const p = this.spawn(x + rr(-1, 1) * s, y + rr(-1, 1) * s, z + rr(-1, 1) * s, ivx + rr(-4, 4), ivy + rr(5, 10), ivz + rr(-4, 4), rr(1.0, 1.6), 1.6 * Math.min(2, s), 1.2, c[0], c[1], c[2], 1, Math.random() < 0.5 ? SPR.NOTE : SPR.NOTES, true, 1.5, 0);
      if (p) { p.rot = rr(-0.3, 0.3); p.vrot = rr(-1, 1); p.fadeIn = 0.1; }
    }
    // debris
    const dc = opt.debris || [0.18, 0.13, 0.26];
    for (let i = 0; i < Math.min(10, 3 + s * 3); i++) {
      const [dx, dy, dz] = randDir(), sp = rr(8, 22) * Math.sqrt(s);
      this.debris.push({ x, y, z, vx: ivx + dx * sp, vy: ivy + dy * sp + 4, vz: ivz + dz * sp, rx: rand() * TAU, ry: rand() * TAU, vr: rr(-8, 8), life: rr(0.8, 1.5), s: rr(0.6, 1.3) * Math.sqrt(s), col: i % 3 === 0 ? [1, 0.2, 0.6] : dc, glow: i % 3 === 0 });
    }
    if (s >= 2) this.shells.push({ x, y, z, vx: ivx, vy: ivy, vz: ivz, t: 0, max: 0.5 + s * 0.08, r0: s * 1.2, r1: s * 6, col: opt.shell || [1, 0.6, 0.25] });
  },
  hitSpark(x, y, z, vx = 0, vy = 0, vz = 0, col = [1, 0.9, 0.6]) {
    this.spawn(x, y, z, vx, vy, vz, 0.1, 2.2, 0.5, col[0], col[1], col[2], 1, SPR.SPARKLE);
    for (let i = 0; i < 4; i++) {
      const [dx, dy, dz] = randDir(), sp = rr(10, 25);
      const p = this.spawn(x, y, z, vx + dx * sp, vy + dy * sp, vz + dz * sp, rr(0.15, 0.3), 0.3, 0.05, col[0], col[1], col[2], 1, SPR.STREAK, true, 3);
      if (p) p.stretch = 0.04;
    }
  },
  burst(x, y, z, n, col, speed, life, size, frame = SPR.GLOW, vx = 0, vy = 0, vz = 0) {
    for (let i = 0; i < n; i++) { const [dx, dy, dz] = randDir(), sp = speed * rr(0.5, 1); this.spawn(x, y, z, vx + dx * sp, vy + dy * sp, vz + dz * sp, life * rr(0.7, 1.2), size, 0.1, col[0], col[1], col[2], 1, frame, true, 2); }
  },
  ringBurst(x, y, z, col, vx = 0, vy = 0, vz = 0) {
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; this.spawn(x, y, z, vx + Math.cos(a) * 14, vy + Math.sin(a) * 14, vz, 0.5, 1.2, 0.2, col[0], col[1], col[2], 1, SPR.SPARKLE, true, 2); }
    this.spawn(x, y, z, vx, vy, vz, 0.4, 2, 10, col[0], col[1], col[2], 1, SPR.SHOCK);
  },
  text(x, y, z, str, col = '#ffffff', big = false) {
    if (this.texts.length > 7) this.texts.shift();
    this.texts.push({ x: x + rr(-1.5, 1.5), y: y + rr(-1, 1.5), z, str, col, t: 0, max: big ? 1.4 : 0.9, big });
  },
  trail(width, color, maxPts = 16) { const t = { pts: [], width, color, maxPts, alive: true, fade: 1, a: 1 }; this.trails.push(t); return t; },

  setWeather(kind) { this.weatherKind = kind; this.weather.length = 0; },

  update(dt, cam) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { this.pool.release(p); ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vrot * dt;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt; if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      d.vy -= 30 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.vr * dt; d.ry += d.vr * 0.7 * dt;
      if (Math.random() < dt * 20) this.spawn(d.x, d.y, d.z, 0, 1, 0, 0.5, 0.8 * d.s, 1.8 * d.s, 0.3, 0.28, 0.3, 0.4, SPR.SMOKE, false, 1);
    }
    for (let i = this.shells.length - 1; i >= 0; i--) { const s = this.shells[i]; s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.t > s.max) this.shells.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += dt; t.y += dt * 4; if (t.t > t.max) this.texts.splice(i, 1); }
    for (let i = this.trails.length - 1; i >= 0; i--) { const t = this.trails[i]; if (!t.alive) { t.fade -= dt * 4; if (t.fade <= 0) this.trails.splice(i, 1); } }
    this.updateWeather(dt, cam);
  },
  updateWeather(dt, cam) {
    const k = this.weatherKind;
    if (!k || !cam) return;
    const W = this.weather, target = k === 'snow' ? 260 : k === 'dust' ? 160 : k === 'embers' ? 140 : 120;
    const f = cam.fwd;
    while (W.length < target) {
      const dist = rr(4, 110);
      W.push({ x: cam.pos.x + f.x * dist + rr(-60, 60), y: cam.pos.y + f.y * dist + rr(-35, 35), z: cam.pos.z + f.z * dist + rr(-60, 60), s: rr(0.2, 0.55), ph: rand() * TAU });
    }
    const t = performance.now() / 1000;
    for (const w of W) {
      if (k === 'snow') { w.y -= dt * 6; w.x += Math.sin(t * 1.3 + w.ph) * dt * 3; }
      else if (k === 'embers') { w.y += dt * 7; w.x += Math.sin(t * 2 + w.ph) * dt * 4; }
      // recycle when behind the camera or too far
      const dx = w.x - cam.pos.x, dy = w.y - cam.pos.y, dz = w.z - cam.pos.z;
      const along = dx * f.x + dy * f.y + dz * f.z;
      if (along < 2 || along > 120 || Math.abs(dy) > 40) {
        const dist = rr(70, 120);
        w.x = cam.pos.x + f.x * dist + rr(-70, 70); w.y = cam.pos.y + f.y * dist + rr(-35, 35); w.z = cam.pos.z + f.z * dist + rr(-40, 40);
      }
    }
  },

  draw(r, dt, railSpeed) {
    for (const p of this.parts) {
      const t = 1 - p.life / p.max;
      let a = p.a * (p.add ? 1 - t * t : 1 - t);
      if (p.fadeIn && t < p.fadeIn) a *= t / p.fadeIn;
      const s = lerp(p.s0, p.s1, t);
      if (p.stretch) r.streak(p.x, p.y, p.z, p.vx * p.stretch, p.vy * p.stretch, p.vz * p.stretch, s, p.frame, p.r, p.g, p.b, a);
      else r.sprite(p.x, p.y, p.z, s, s, p.rot, p.frame, p.r, p.g, p.b, a, p.add);
    }
    const k = this.weatherKind;
    if (k) {
      for (const w of this.weather) {
        if (k === 'snow') r.sprite(w.x, w.y, w.z, w.s * 0.5, w.s * 0.5, 0, SPR.DOT, 0.9, 0.95, 1, 0.85, false);
        else if (k === 'embers') r.sprite(w.x, w.y, w.z, w.s, w.s, 0, SPR.GLOW, 1, 0.5, 0.15, 1, true);
        else if (k === 'dust') r.streak(w.x, w.y, w.z, 0, 0, railSpeed * 0.035, w.s * 0.35, SPR.STREAK, 0.7, 0.75, 1, 0.55);
        else if (k === 'static') r.sprite(w.x, w.y, w.z, w.s * 0.8, w.s * 0.8, 0, SPR.SQUARE, 0.8, 0.8, 0.85, 0.6, true);
      }
    }
  },
  drawMeshes(r) {
    const M = _fxM;
    for (const d of this.debris) {
      m4euler(M, d.x, d.y, d.z, d.ry, d.rx, 0, d.s * Math.min(1, d.life * 2));
      r.draw(MODELS.shard, M, { tint: [d.col[0], d.col[1], d.col[2], 1], emis: d.glow ? [0.8, 0.1, 0.4] : null });
    }
    for (const s of this.shells) {
      const t = s.t / s.max, rad = lerp(s.r0, s.r1, easeOutCubic(t));
      m4euler(M, s.x, s.y, s.z, t * 2, t, 0, rad);
      const a = (1 - t) * 0.8;
      r.draw(MODELS.shell, M, { tint: [s.col[0] * a, s.col[1] * a, s.col[2] * a, 1], blend: 'add', cull: false });
    }
  },
  drawTrails(r) {
    for (const t of this.trails) {
      if (t.pts.length < 2) continue;
      const c = t.color;
      r.ribbon(t.pts, t.pts.length, (u) => t.width * (1 - u * 0.85), c[0], c[1], c[2], t.a * t.fade, 0);
    }
  },
};
const _fxM = m4();
function randDir() {
  const z = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - z * z);
  return [Math.cos(a) * r, Math.sin(a) * r, z];
}
