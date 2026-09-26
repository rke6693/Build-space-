'use strict';
// =============================================================================
// SYNTHWING 64 — bosses.js
// Five bosses. Every attack is locked to the music: arms conduct on the bar,
// fists slam on the downbeat, petals fire on their own sixteenth.
// =============================================================================

const BOSS_MODELS = {};
function buildBossModels() {
  const B = BOSS_MODELS;
  { // CONDUCTOR — hovering sea fortress
    const b = new MB();
    b.push(); b.scale(1, 0.35, 1);
    b.lathe([[11, -3], [17, -1], [18, 1], [14, 3], [6, 5], [0, 5.5]], 10, (j) => (j < 2 ? C.stBody : j < 4 ? C.stHi : C.stMetal), { capBottom: true });
    b.pop();
    b.cylinder(5, 4, 1, 9, 8, C.stBody);
    b.cylinder(4.4, 4.4, 9, 10, 8, G.magenta, false);
    for (let i = 0; i < 8; i++) { b.push(); b.rotateY((i / 8) * TAU); b.translate(0, 0.5, 16.5); b.box(0, 0, 0, 3, 1.2, 1.2, i % 2 ? G.magenta : C.stMetal); b.pop(); }
    B.conductorHull = b.build('conductorHull');
    const e = new MB(); e.sphere(3.2, 10, 6, [0.95, 0.95, 1.0]); e.push(); e.translate(0, 0, -2.9); e.rotateX(PI / 2); e.disc(1.6, 0, 10, G.magenta, true); e.disc(0.7, 0.01, 8, [0.05, 0, 0.05, 0], true); e.pop();
    B.eye = e.build('eye');
    const s = new MB(); s.push(); s.scale(1, 1, 0.5); s.lathe([[3.6, 0], [3.2, 2.2], [1.8, 3.4], [0, 3.8]], 10, C.stHi, {}); s.pop();
    B.shutter = s.build('shutter');
    const a = new MB(); a.box(0, 0, 0, 1.4, 1.4, 1.4, C.stMetal); a.box(0, 0, -9, 0.8, 0.8, 18, C.stBody); a.box(0, 0, -9, 0.9, 0.2, 16, G.magenta);
    B.arm = a.build('arm');
    const o = new MB(); o.ico(2.2, 1, G.pink); o.push(); o.scale(1.25); o.ico(2.0, 0, C.stDark); o.pop();
    B.orb = o.build('orb');
  }
  { // GRINDER — asteroid-eating drill ship
    const b = new MB();
    b.push(); b.rotateX(PI / 2);
    b.lathe([[12, 0], [12.5, 6], [11, 16], [8, 22], [5, 24]], 8, (j) => (j % 2 ? C.stBody : C.stHi), { capTop: true, phase: PI / 8 });
    b.pop();
    for (let i = 0; i < 8; i++) { b.push(); b.rotateZ((i / 8) * TAU); b.translate(0, 12.6, 10); b.box(0, 0, 0, 2.5, 1, 14, i % 2 ? C.yellow : C.dark); b.pop(); }
    for (const s of [-1, 1]) { b.push(); b.translate(s * 14, 0, 16); b.box(0, 0, 0, 5, 3, 10, C.stMetal); b.box(0, 0, 5.2, 4, 2, 0.3, G.orange); b.pop(); }
    B.grinderBody = b.build('grinderBody');
    const d = new MB();
    d.push(); d.rotateX(-PI / 2);
    d.lathe([[10.5, 0], [8, 6], [4.5, 13], [0, 20]], 8, (j) => [C.grey, C.dark, C.grey][j % 3], {});
    d.pop();
    for (let i = 0; i < 4; i++) { d.push(); d.rotateZ((i / 4) * TAU); d.translate(0, 0, -4); d.push(); d.rotateX(-PI / 2); d.extrude([[0, 0], [6, -14], [9.5, 0]], 0.8, C.yellow, C.dark); d.pop(); d.pop(); }
    B.drill = d.build('drill');
    const t = new MB(); t.box(0, 0, 0, 3, 3, 3, C.stDark); t.box(0, 0, -1.6, 2, 2, 0.4, G.red); B.tooth = t.build('tooth');
    const c = new MB(); c.ico(4.5, 1, G.orange); c.push(); c.scale(0.7); c.ico(4.5, 0, G.yellow); c.pop(); B.core = c.build('core');
  }
  { // GLASS SERPENT
    const seg = (glowCore) => {
      const b = new MB();
      b.diamond(2.6, 2.6, 3.6, 3.6, (i) => (i % 2 ? C.ice : hex('#dff8ff')));
      for (let i = 0; i < 4; i++) { b.push(); b.rotateZ((i / 4) * TAU + PI / 4); b.translate(0, 2.4, 0); b.lathe([[0.9, 0], [0, 3]], 4, hex('#bfefff'), {}); b.pop(); }
      if (glowCore) { b.push(); b.scale(1.05); b.diamond(1.6, 1.6, 2.2, 2.2, G.magenta); b.pop(); }
      return b;
    };
    B.segment = seg(false).build('segment');
    B.segWeak = seg(true).build('segWeak');
    const h = new MB();
    h.diamond(3.6, 2.8, 7, 3, (i) => (i < 4 ? hex('#dff8ff') : C.ice));
    for (const s of [-1, 1]) { h.push(); h.translate(s * 2.2, 1.4, -2.5); h.box(0, 0, 0, 1.2, 0.5, 0.8, G.magenta); h.pop(); h.push(); h.translate(s * 2.6, 2, 1.5); h.rotateZ(-s * 0.5); h.lathe([[0.7, 0], [0, 5]], 4, hex('#bfefff'), {}); h.pop(); }
    h.push(); h.translate(0, -2.2, -3); h.diamond(2.4, 0.8, 4, 1, C.ice); h.pop();
    B.head = h.build('head');
  }
  { // ANVIL — lava titan
    const t = new MB();
    t.box(0, 0, 0, 22, 16, 12, { top: hex('#4a3a34'), side: hex('#3a2e2a'), front: hex('#2e2422'), all: hex('#3a2e2a') }, 0.2);
    t.box(0, -2, -6.2, 12, 8, 0.6, G.orange);
    for (const s of [-1, 1]) { t.push(); t.translate(s * 14, 5, 0); t.sphere(5.5, 8, 5, hex('#5a4a44')); t.pop(); }
    t.box(0, 10, 0, 8, 4, 8, hex('#2e2422'));
    B.torso = t.build('torso');
    const h = new MB();
    h.box(0, 0, 0, 10, 8, 9, { top: hex('#5a4a44'), side: hex('#3a2e2a'), all: hex('#3a2e2a') }, 0.2);
    for (const s of [-1, 1]) { h.push(); h.translate(s * 5.5, 3, 0); h.rotateZ(s * -0.6); h.cylinder(1.2, 0, 0, 6, 5, hex('#5a4a44')); h.pop(); }
    B.anvilHead = h.build('anvilHead');
    const v = new MB(); v.box(0, 0, 0, 8.4, 2.4, 1, G.orange); B.visor = v.build('visor');
    const f = new MB();
    f.box(0, 0, 0, 9, 9, 9, { top: hex('#5a4a44'), side: hex('#3a2e2a'), all: hex('#3a2e2a') }, 0.2);
    for (let i = 0; i < 4; i++) f.box(-3.4 + i * 2.25, -3.5, -4.7, 1.8, 2, 1.2, hex('#6a5a50'));
    f.box(0, 1, -4.6, 5, 2, 0.4, G.orange);
    B.fist = f.build('fist');
    const a = new MB(); a.cylinder(2, 2, 0, 1, 8, hex('#4a3a34')); B.armSeg = a.build('armSeg');
  }
  { // THE HUSH
    const p = new MB();
    const leaf = [[0, 0], [3.5, 6], [3, 16], [0, 24], [-3, 16], [-3.5, 6]];
    p.push(); p.rotateX(-PI / 2); p.extrude(leaf, 1.2, hex('#18161f'), hex('#0c0a12'), 0.4); p.pop();
    p.push(); p.translate(0, 0, -0.9); p.rotateX(-PI / 2); p.extrude(leaf.map(([x, z]) => [x * 0.25, z * 0.9 + 1]), 1.4, G.white, G.white); p.pop();
    B.petal = p.build('petal');
    const m = new MB();
    m.sphere(7, 12, 8, hex('#e8e6f0'));
    for (const s of [-1, 1]) { m.push(); m.translate(s * 2.6, 1.5, -6); m.box(0, 0, 0, 2.6, 1.6, 1.5, [0.02, 0.02, 0.03, 0]); m.pop(); }
    m.push(); m.translate(0, -3, -6.3); m.box(0, 0, 0, 3, 0.5, 1, [0.02, 0.02, 0.03, 0]); m.pop();
    B.mask = m.build('mask');
    const r = new MB(); r.push(); r.rotateX(PI / 2); r.torus(14, 0.5, 32, 4, G.white); r.pop(); B.halo = r.build('halo');
  }
}

// ---------------------------------------------------------------------------
class Boss {
  constructor(name, sub) {
    this.name = name; this.sub = sub; this.t = 0;
    this.parts = []; this.dead = false; this.dying = 0; this.d = 0; this.x = 0; this.y = 0;
    this.entering = true; this.enterT = 0; this.off = 70;
    // flinch springs (whole body) + low-health state
    this.fd = 0; this.fx = 0; this.fy = 0; this.fvd = 0; this.fvx = 0; this.fvy = 0; this.froll = 0; this.frollV = 0;
    this.enraged = false; this.smokeT = 0;
  }
  // Called after update(): layer the flinch on top of the scripted motion, shake hit parts.
  postUpdate(dt) {
    spring(this, 'fd', 'fvd', 22, 6, dt); spring(this, 'fx', 'fvx', 22, 6, dt); spring(this, 'fy', 'fvy', 22, 6, dt);
    spring(this, 'froll', 'frollV', 18, 4, dt);
    this.d += this.fd; this.x += this.fx; this.y += this.fy;
    for (const p of this.parts) {
      const j = p.flash * 0.35;
      p.d += this.fd + (j ? rr(-j, j) : 0); p.x += this.fx + (j ? rr(-j, j) : 0); p.y += this.fy + (j ? rr(-j, j) : 0);
    }
    if (this.dead || this.entering) return;
    const h = this.health;
    if (!this.enraged && h < 0.3) {
      this.enraged = true;
      SFX.roar(); Game.shake(0.5); Game.banner(this.name + ' IS ENRAGED!', '#ff5a5a', true);
    }
    if (h < 0.45) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = h < 0.3 ? 0.03 : 0.07;
        const p = pick(this.parts.filter((q) => q.alive)) || this.parts[0];
        const w = this.wp(p), v = -Game.speed;
        FX.spawn(w[0] + rr(-p.r, p.r), w[1] + rr(-p.r, p.r), w[2], rr(-2, 2), rr(3, 7), v * 0.95, rr(0.8, 1.4), p.r * 0.5, p.r * 1.5, 0.18, 0.16, 0.2, 0.65, SPR.SMOKE, false, 1);
        if (Math.random() < 0.5) FX.hitSpark(w[0] + rr(-p.r, p.r), w[1] + rr(-p.r, p.r), w[2], 0, 0, v, [1, 0.7, 0.3]);
      }
    }
  }
  part(o) {
    const p = Object.assign({ d: 0, x: 0, y: 0, r: 3, hp: 10, alive: true, weak: true, flash: 0, lockCount: 0, lockPulse: 0, invuln: false, boss: this, isPart: true }, o);
    p.maxHp = p.hp = p.hp * Game.diff.hp;
    this.parts.push(p); return p;
  }
  get health() { let h = 0, m = 0; for (const p of this.parts) if (p.weak) { h += Math.max(0, p.hp); m += p.maxHp; } return m ? h / m : 0; }
  hit(p, dmg, src) {
    if (!p.alive || this.dead || this.entering) return false;
    if (p.invuln) { FX.hitSpark(...this.wp(p), 0, 0, 0, [0.7, 0.7, 1]); SFX.deflect(); return false; }
    p.hp -= dmg; p.flash = 1; SFX.hit();
    this.fvd += 0.9 * dmg; this.frollV += rr(-0.25, 0.25) * dmg;
    const w = this.wp(p); FX.hitSpark(w[0], w[1], w[2] + p.r * 0.5);
    Game.addScore(10, p);
    if (p.hp <= 0) { p.alive = false; this.partDestroyed(p); }
    return true;
  }
  wp(p) { Game.rail.world(_p, p.d, p.x, p.y); return [_p.x, _p.y, _p.z]; }
  partDestroyed(p) {
    const w = this.wp(p);
    FX.explode(w[0], w[1], w[2], 2.5, { shell: [1, 0.5, 0.8] }); SFX.explode(2.5); Game.shake(0.7); Game.hitstop(0.08);
    // the whole body reels from the blow
    this.fvd += 16; this.fvy += rr(-3, 7); this.fvx += (p.x - this.x) * -0.8; this.frollV += (p.x >= this.x ? -1 : 1) * 3;
    Game.shockwave(w[0], w[1], w[2], 1.2); Game.fovKick = Math.max(Game.fovKick, 5);
    Game.addScore(1000, p); Game.resonanceGain(3);
    if (this.parts.filter((q) => q.weak && q.alive).length === 0) this.defeat();
    else this.onPart(p);
  }
  onPart() {}
  defeat() { this.dead = true; this.dying = 0; Game.onBossDefeated(this); }
  baseUpdate(dt) {
    const G = Game, P = G.player;
    this.t += dt;
    for (const p of this.parts) { p.flash = Math.max(0, p.flash - dt * 8); p.lockPulse = Math.max(0, p.lockPulse - dt * 3); }
    if (this.entering) {
      this.enterT += dt;
      const k = Math.min(1, this.enterT / 3.5);
      this.curOff = lerp(320, this.off, easeOutCubic(k));
      if (k >= 1) this.entering = false;
    } else this.curOff = this.off;
    if (this.dead) {
      this.dying += dt;
      if (Math.random() < dt * 14) { const p = pick(this.parts); const w = this.wp(p); FX.explode(w[0] + rr(-6, 6), w[1] + rr(-6, 6), w[2] + rr(-4, 4), rr(1, 2.5), { shell: [1, 0.7, 0.4] }); SFX.explode(1.5); }
    }
    // body collision
    if (P.alive && !this.dead) for (const p of this.parts) {
      if (!p.alive && p.weak) continue;
      const dd = p.d - P.d, dx = p.x - P.x, dy = p.y - P.y, r = p.r + P.r;
      if (dd * dd + dx * dx + dy * dy < r * r) { if (P.hurt(20)) { P.vx = -Math.sign(dx || 1) * 30; } }
    }
  }
  // Attack helpers -----------------------------------------------------------
  ring(d, x, y, n, speed, phase = 0, approach = 22, kind = 'orb') {
    const G = Game, s = speed * G.diff.bullet;
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * TAU;
      G.ebullets.push({ d, x, y, vd: G.speed - approach * G.diff.bullet, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1, life: 6, dmg: 10, kind });
    }
    SFX.enemyShot();
  }
  aimed(d, x, y, speed, spread = 0, n = 1, kind = 'orb') {
    const G = Game, P = G.player, s = speed * G.diff.bullet;
    for (let i = 0; i < n; i++) {
      const off = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
      let dd = P.d + 4 - d, dx = P.x - x + off * Math.abs(P.d - d), dy = P.y - y; const l = Math.hypot(dd, dx, dy) || 1;
      G.ebullets.push({ d, x, y, vd: G.speed + (dd / l) * s, vx: (dx / l) * s, vy: (dy / l) * s, r: 1, life: 6, dmg: 12, kind });
    }
    SFX.enemyShot();
  }
  drawPart(r, mesh, p, yaw, pitch, roll, scale, extra = {}) {
    const rage = this.enraged && !this.dead && Math.sin(this.t * 14) > 0.4 ? 0.35 : 0;
    const lp = p && p.lockPulse ? p.lockPulse : 0;
    const mat = Object.assign({ flash: p ? p.flash : 0, emis: lp || rage ? [lp * 0.6 + rage, 0.1 * lp, lp * 0.4 + rage * 0.2] : null }, extra);
    drawAt(r, mesh, p ? p.d : this.d, p ? p.x : this.x, p ? p.y : this.y, yaw + this.froll * 0.3, pitch, roll + this.froll, scale, mat);
  }
}

// ---------------------------------------------------------------------------
// 1. THE CONDUCTOR
// ---------------------------------------------------------------------------
class BossConductor extends Boss {
  constructor() {
    super('THE CONDUCTOR', 'Silencer of the Seas');
    this.off = 78;
    this.armL = this.part({ r: 3.2, hp: 20, name: 'armL' });
    this.armR = this.part({ r: 3.2, hp: 20, name: 'armR' });
    this.eye = this.part({ r: 4.2, hp: 42, invuln: true, name: 'eye' });
    this.hull = this.part({ r: 9, hp: 1, weak: false, invuln: true, name: 'hull' });
    this.beam = null; this.armAng = [0.6, -0.6];
  }
  update(dt) {
    const G = Game, P = G.player;
    this.baseUpdate(dt);
    this.d = P.d + this.curOff;
    this.x = Math.sin(this.t * 0.35) * 7; this.y = -4 + Math.sin(this.t * 0.9) * 1.2 - (this.dead ? this.dying * 6 : 0);
    const bp = Music.barPhase();
    // arms conduct: 4-beat pattern (down, in, out, up)
    const pat = [[-0.5, 0.2], [0.3, -0.1], [-0.1, 0.9], [0.9, 0.5]];
    const beat = Math.floor(bp * 4), f = easeInOutCubic((bp * 4) % 1);
    const a0 = pat[beat], a1 = pat[(beat + 1) % 4];
    for (const [i, arm] of [[0, this.armL], [1, this.armR]]) {
      const s = i === 0 ? -1 : 1;
      const ang = lerp(a0[i], a1[i], f);
      this.armAng[i] = ang;
      arm.d = this.d - 2; arm.x = this.x + s * (6 + Math.cos(ang) * 12); arm.y = this.y + 9 + Math.sin(ang) * 12;
    }
    this.hull.d = this.d; this.hull.x = this.x; this.hull.y = this.y + 1;
    this.eyeOpen = !this.armL.alive && !this.armR.alive ? (Math.floor(bp * 2) === 1 ? 1 : 0) : 0;
    this.eyeOpenS = damp(this.eyeOpenS || 0, this.eyeOpen, 10, dt);
    this.eye.d = this.d - 3; this.eye.x = this.x; this.eye.y = this.y + 11;
    this.eye.invuln = this.eyeOpenS < 0.5;
    if (this.entering || this.dead || !P.alive) return;
    // attacks
    const phase2 = !this.armL.alive && !this.armR.alive;
    if (!phase2) {
      if (G.onBeat) {
        const beatN = G.beatIndex % 4;
        if (beatN === 1 || beatN === 3) for (const arm of [this.armL, this.armR]) if (arm.alive) this.aimed(arm.d, arm.x, arm.y, 40, 0.35, 3);
        if (G.barIndex % 4 === 2 && beatN === 0) this.startBeam();
      }
    } else {
      if (G.onBeat && (G.beatIndex % 2 === 0 || G.diff.fire > 1.2)) this.ring(this.eye.d, this.eye.x, this.eye.y, 10, 11, G.beatIndex * 0.3, 26);
      if (G.onBar && G.barIndex % 2 === 0) this.aimed(this.eye.d, this.eye.x, this.eye.y, 55, 0.5, 5);
    }
    this.updateBeam(dt);
  }
  startBeam() {
    const P = Game.player;
    this.beam = { t: 0, y: P.y, dir: Math.random() < 0.5 ? -1 : 1 };
    Game.say('oz', 'Beam incoming! Climb or dive, Lead!', true);
    SFX.charge();
  }
  updateBeam(dt) {
    const b = this.beam; if (!b) return;
    const beatDur = (Music.stepDur || 0.12) * 4;
    b.t += dt / beatDur;
    if (b.t > 2 && !b.fired) { b.fired = true; SFX.beam(); Game.shake(0.3); }
    if (b.t > 2 && b.t < 3.2) {
      const P = Game.player;
      b.x = b.dir * lerp(-22, 22, (b.t - 2) / 1.2);
      if (Math.abs(P.y - b.y) < 1.8 && Math.abs(P.x - b.x) < 4) P.hurt(18);
    }
    if (b.t > 3.3) this.beam = null;
  }
  onPart(p) { if (p === this.armL || p === this.armR) { Game.say('tobi', !this.armL.alive && !this.armR.alive ? "Both batons are down! Its eye is opening — hit it when it's open!" : 'One baton down! Keep it up!'); } }
  draw(r) {
    const G = Game;
    this.drawPart(r, BOSS_MODELS.conductorHull, this.hull, this.t * 0.2, 0, 0, 1, { flash: this.hull.flash });
    for (const [i, arm] of [[0, this.armL], [1, this.armR]]) {
      if (!arm.alive) continue;
      const s = i === 0 ? -1 : 1;
      // arm beam from shoulder to orb
      for (let k = 1; k < 5; k++) {
        const u = k / 5;
        drawAt(r, MODELS.shell, this.d - 2, lerp(this.x + s * 6, arm.x, u), lerp(this.y + 9, arm.y, u), 0, 0, 0, 1.1 - u * 0.3, { tint: [0.16, 0.12, 0.24, 1], flash: arm.flash });
      }
      this.drawPart(r, BOSS_MODELS.orb, arm, G.time, G.time * 0.7, 0, 1);
      const pts = _bpts; G.rail.world(pts[0], this.d - 2, this.x + s * 6, this.y + 9); G.rail.world(pts[1], arm.d, arm.x, arm.y);
      r.ribbon(pts, 2, 0.7, 1, 0.2, 0.6, 0.8, 0.8);
    }
    this.drawPart(r, BOSS_MODELS.eye, this.eye, PI, 0, 0, 1);
    const open = this.eyeOpenS || 0;
    for (const s of [-1, 1]) drawAt(r, BOSS_MODELS.shutter, this.eye.d - 0.3, this.eye.x, this.eye.y + s * (0.2 + open * 3.8), PI, s > 0 ? -PI / 2 : PI / 2, 0, 1.1, { flash: this.eye.flash * 0.5 });
    if (this.beam) {
      const b = this.beam, pts = _bpts;
      const src = this.armL.alive ? this.armL : this.armR.alive ? this.armR : this.eye;
      if (b.t < 2) {
        G.rail.world(pts[0], G.player.d + 2, -24, b.y); G.rail.world(pts[1], G.player.d + 2, 24, b.y);
        const a = 0.3 + 0.4 * Math.abs(Math.sin(G.time * 25));
        r.ribbon(pts, 2, 0.25, 1, 0.3, 0.3, a, a);
      } else if (b.x !== undefined) {
        G.rail.world(pts[0], src.d, src.x, src.y); G.rail.world(pts[1], G.player.d - 4, b.x, b.y);
        r.ribbon(pts, 2, 2.2, 1, 0.3, 0.7, 1, 1);
      }
    }
  }
}
const _bpts = [new V3(), new V3()];

// ---------------------------------------------------------------------------
// 2. THE GRINDER
// ---------------------------------------------------------------------------
class BossGrinder extends Boss {
  constructor() {
    super('THE GRINDER', 'Devourer of the Halo Belt');
    this.off = 85;
    this.teeth = [];
    for (let i = 0; i < 4; i++) this.teeth.push(this.part({ r: 2.6, hp: 12, name: 'tooth', i }));
    this.core = this.part({ r: 4.5, hp: 50, invuln: true, name: 'core' });
    this.body = this.part({ r: 12, hp: 1, weak: false, invuln: true });
    this.spin = 0; this.charge = null; this.open = 0;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.baseUpdate(dt);
    let off = this.curOff;
    if (this.charge) {
      this.charge.t += dt;
      const ct = this.charge.t;
      if (ct < 1.2) off = this.off + ct * 10; else if (ct < 2.2) off = lerp(this.off + 12, 26, easeInCubic((ct - 1.2) / 1.0)); else if (ct < 3.6) off = lerp(26, this.off, easeOutCubic((ct - 2.2) / 1.4)); else this.charge = null;
      if (ct > 1.8 && ct < 2.6 && Math.hypot(P.x - this.x, P.y - this.y) < 8) P.hurt(25);
    }
    this.d = P.d + off;
    const phase2 = this.teeth.every((t) => !t.alive);
    this.x = Math.sin(this.t * 0.4) * (phase2 ? 10 : 6); this.y = Math.cos(this.t * 0.55) * 4 - (this.dead ? this.dying * 5 : 0);
    this.spin += dt * (phase2 ? 1 : 5 + (this.charge ? 10 : 0));
    this.open = damp(this.open, phase2 ? 1 : 0, 3, dt);
    this.teeth.forEach((tp, i) => { const a = this.spin * 0.25 + (i / 4) * TAU; tp.d = this.d - 3; tp.x = this.x + Math.cos(a) * 9; tp.y = this.y + Math.sin(a) * 9; });
    this.core.d = this.d - 4 + this.open * 2; this.core.x = this.x; this.core.y = this.y; this.core.invuln = !phase2;
    this.body.d = this.d + 6; this.body.x = this.x; this.body.y = this.y;
    if (this.entering || this.dead || !P.alive) return;
    if (!phase2) {
      if (G.onBeat && G.beatIndex % 2 === 0) for (const tp of this.teeth) if (tp.alive) this.aimed(tp.d, tp.x, tp.y, 38);
      if (G.onBar && G.barIndex % 2 === 1) this.throwRocks(3);
      if (G.onBar && G.barIndex % 6 === 4 && !this.charge) { this.charge = { t: 0 }; Game.say('sable', "It's charging! Get clear of the drill!", true); SFX.roar(); }
    } else {
      if (G.on8th) this.ring(this.core.d, this.core.x, this.core.y, 3, 10, G.stepIndex * 0.45, 30);
      if (G.onBar) this.throwRocks(2);
      if (G.onBar && G.barIndex % 4 === 2 && !this.charge) { this.charge = { t: 0 }; SFX.roar(); }
    }
  }
  throwRocks(n) {
    const G = Game, P = G.player;
    for (let i = 0; i < n; i++) {
      const e = G.spawnEnemy('rock', 'rock', { off: this.d - P.d - 6, x: this.x + rr(-8, 8), y: this.y + rr(-6, 6), scale: rr(0.6, 1), vd: -rr(25, 40), vx: (P.x - this.x) * rr(0.2, 0.5), vy: (P.y - this.y) * rr(0.2, 0.5) });
      e.d = this.d - 6;
    }
  }
  onPart(p) { if (this.teeth.every((t) => !t.alive)) Game.say('tobi', "The drill's jammed! The core is exposed — let it have it!"); }
  draw(r) {
    const G = Game;
    this.drawPart(r, BOSS_MODELS.grinderBody, this.body, PI, 0, this.spin * 0.05, 1);
    drawAt(r, BOSS_MODELS.drill, this.d - 2 + this.open * 14, this.x, this.y + this.open * 10, 0, this.open * 0.6, this.spin, 1 - this.open * 0.3, { flash: this.body.flash });
    for (const tp of this.teeth) if (tp.alive) this.drawPart(r, BOSS_MODELS.tooth, tp, PI, 0, this.spin, 1);
    this.drawPart(r, BOSS_MODELS.core, this.core, G.time, G.time * 0.6, 0, 0.6 + this.open * 0.5);
    if (this.charge && this.charge.t < 1.8) {
      const w = this.wp(this.body); const a = Math.abs(Math.sin(G.time * 20));
      r.sprite(w[0], w[1], w[2] - 20, 30, 30, G.time * 3, SPR.RING, 1, 0.3, 0.2, a * 0.6);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. THE GLASS SERPENT
// ---------------------------------------------------------------------------
class BossSerpent extends Boss {
  constructor() {
    super('GLASS SERPENT', 'Frozen Choir of Frostline');
    this.off = 70;
    this.n = 14;
    this.segs = [];
    for (let i = 0; i < this.n; i++) this.segs.push(this.part({ r: 3, hp: 10, weak: [3, 6, 9, 12].includes(i), invuln: false, name: 'seg', i }));
    this.head = this.part({ r: 4.2, hp: 45, invuln: true, name: 'head' });
    this.hist = []; this.dive = null;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.baseUpdate(dt);
    const phase2 = this.segs.every((s) => !s.weak || !s.alive);
    let off = this.curOff;
    const t = this.t * (phase2 ? 1.25 : 1);
    let hx = Math.sin(t * 0.9) * 16, hy = Math.sin(t * 1.4) * 7 + 2;
    if (this.dive) {
      this.dive.t += dt;
      const k = this.dive.t / 2.6;
      off = lerp(this.off, -30, easeInOutCubic(Math.min(1, k * 1.2)));
      hx = lerp(hx, this.dive.x, Math.sin(Math.min(1, k) * PI)); hy = lerp(hy, this.dive.y, Math.sin(Math.min(1, k) * PI));
      if (k > 1) { this.dive = null; this.returning = 1; }
    }
    if (this.returning) { this.returning = Math.max(0, this.returning - dt / 1.5); off = lerp(this.off, -30, easeInOutCubic(this.returning)); }
    this.d = P.d + off; this.x = hx; this.y = hy - (this.dead ? this.dying * 4 : 0);
    this.head.d = this.d; this.head.x = this.x; this.head.y = this.y; this.head.invuln = !phase2;
    // body follows the head's history (relative to player so it keeps up)
    this.hist.unshift([off, hx, hy]);
    if (this.hist.length > 200) this.hist.pop();
    for (let i = 0; i < this.n; i++) {
      const h = this.hist[Math.min(this.hist.length - 1, (i + 1) * 5)];
      const s = this.segs[i];
      s.d = P.d + h[0] + (i + 1) * 5.5 * (this.dive ? -0.3 : 1); s.x = h[1]; s.y = h[2];
    }
    if (this.entering || this.dead || !P.alive) return;
    if (G.on8th && G.stepIndex % 4 === 2) { const s = pick(this.segs.filter((q) => q.alive)); if (s) this.aimed(s.d, s.x, s.y, 36, 0, 1, 'shard'); }
    if (G.onBar && G.barIndex % 4 === 3 && !this.dive && !this.returning) { this.dive = { t: 0, x: P.x, y: P.y }; Game.say('oz', 'Serpent diving! Roll out of the way!', true); SFX.roar(); }
    if (phase2 && G.onBeat && G.beatIndex % 2 === 0) this.ring(this.head.d, this.head.x, this.head.y, 8, 12, G.beatIndex * 0.4, 25, 'shard');
  }
  onPart(p) { if (this.segs.every((s) => !s.weak || !s.alive)) Game.say('tobi', 'All the resonant crystals shattered! Go for the head!'); }
  draw(r) {
    const G = Game;
    for (let i = this.n - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (!s.alive) continue;
      const nxt = i > 0 ? this.segs[i - 1] : this.head;
      const yaw = Math.atan2(-(nxt.x - s.x), (nxt.d - s.d)), pitch = Math.atan2(nxt.y - s.y, Math.abs(nxt.d - s.d) + 0.01);
      this.drawPart(r, s.weak ? BOSS_MODELS.segWeak : BOSS_MODELS.segment, s, yaw, pitch, G.time + i, 1 - i * 0.025, { chrome: 0.5 });
    }
    const yaw = this.dive ? 0 : PI;
    this.drawPart(r, BOSS_MODELS.head, this.head, yaw, 0, Math.sin(G.time) * 0.3, 1.2, { chrome: 0.5 });
  }
}

// ---------------------------------------------------------------------------
// 4. THE ANVIL
// ---------------------------------------------------------------------------
class BossAnvil extends Boss {
  constructor() {
    super('THE ANVIL', 'Hammer of the Forge');
    this.off = 88;
    this.fistL = this.part({ r: 5.5, hp: 28, name: 'fistL' });
    this.fistR = this.part({ r: 5.5, hp: 28, name: 'fistR' });
    this.visor = this.part({ r: 4, hp: 50, invuln: true, name: 'visor' });
    this.torso = this.part({ r: 11, hp: 1, weak: false, invuln: true });
    this.slam = [null, null]; this.headOpen = 0;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.baseUpdate(dt);
    this.d = P.d + this.curOff;
    this.x = Math.sin(this.t * 0.3) * 5; this.y = -8 + Math.sin(this.t * 0.8) * 1 - (this.dead ? this.dying * 8 : 0) + (this.entering ? (1 - this.enterT / 3.5) * -30 : 0);
    this.torso.d = this.d + 4; this.torso.x = this.x; this.torso.y = this.y;
    const phase2 = !this.fistL.alive && !this.fistR.alive;
    this.headOpen = damp(this.headOpen, phase2 ? 1 : 0, 2, dt);
    this.visor.d = this.d - 1; this.visor.x = this.x; this.visor.y = this.y + 16; this.visor.invuln = !phase2;
    [this.fistL, this.fistR].forEach((f, i) => {
      const s = i === 0 ? -1 : 1;
      const sl = this.slam[i];
      if (sl) {
        sl.t += dt / ((Music.stepDur || 0.1) * 4);
        const tx = sl.x, raise = sl.t < 2 ? easeOutCubic(sl.t / 2) : 0;
        if (sl.t < 2) { f.d = lerp(f.d, P.d + 30, dt * 3); f.x = lerp(f.x, tx, dt * 4); f.y = lerp(this.y + 6, 22, raise); }
        else if (sl.t < 2.25) { f.y = lerp(22, -14, (sl.t - 2) / 0.25); f.d = P.d + 30; if (!sl.hit && sl.t > 2.15) { sl.hit = true; this.onSlam(f); } }
        else if (sl.t < 3.5) { f.y = -14; }
        else { this.slam[i] = null; }
      } else {
        f.d = damp(f.d || this.d, this.d - 6, 3, dt); f.x = damp(f.x || this.x, this.x + s * 17, 3, dt); f.y = damp(f.y || this.y, this.y + 4 + Math.sin(this.t * 2 + i) * 2, 3, dt);
      }
      // hazard column while slamming down
      if (sl && sl.t > 2 && sl.t < 2.4 && Math.abs(P.x - f.x) < 6 && Math.abs(P.d - f.d) < 34 && P.y < f.y + 5) P.hurt(22);
    });
    if (this.entering || this.dead || !P.alive) return;
    if (!phase2) {
      if (G.onBar) { const i = G.barIndex % 2, f = i ? this.fistR : this.fistL; if (f.alive && !this.slam[i]) this.slam[i] = { t: 0, x: clamp(P.x, -14, 14), hit: false }; }
      if (G.onBeat && G.beatIndex % 2 === 1) this.aimed(this.torso.d - 6, this.x, this.y + 4, 40, 0.4, 3);
    } else {
      if (G.onBeat && (G.beatIndex % 2 === 0 || G.diff.fire > 1.2)) this.ring(this.visor.d, this.visor.x, this.visor.y, 12, 12, G.beatIndex * 0.25, 28);
      if (G.onBar && G.barIndex % 2 === 0) this.aimed(this.visor.d, this.visor.x, this.visor.y, 60, 0.6, 5);
    }
  }
  onSlam(f) {
    const G = Game;
    G.rail.world(_p, f.d, f.x, -14);
    FX.explode(_p.x, _p.y + 4, _p.z, 2.2, { notes: false, palette: [[1, 0.6, 0.2], [1, 0.3, 0.05]] });
    for (let i = 0; i < 20; i++) FX.spawn(_p.x + rr(-6, 6), _p.y, _p.z + rr(-6, 6), rr(-10, 10), rr(20, 45), rr(-10, 10), 1.2, 2, 0.5, 1, 0.5, 0.1, 1, SPR.GLOW, true, 0.5, -40);
    SFX.explode(2.5); G.shake(0.9); Haptics.impact('bigkill');
    // shockwave of embers along the ground
    this.ring(f.d, f.x, -10, 10, 9, 0, 20);
  }
  onPart(p) { if (!this.fistL.alive && !this.fistR.alive) Game.say('sable', "Its fists are scrap! The visor's cracking open — aim high!"); }
  draw(r) {
    const G = Game;
    this.drawPart(r, BOSS_MODELS.torso, this.torso, PI, 0, Math.sin(this.t * 0.8) * 0.05, 1);
    drawAt(r, BOSS_MODELS.anvilHead, this.visor.d + 1, this.x, this.y + 16 + this.headOpen * 1.5, PI + Math.sin(this.t) * 0.1, -this.headOpen * 0.35, 0, 1, { flash: this.visor.flash });
    if (this.visor.alive) this.drawPart(r, BOSS_MODELS.visor, this.visor, PI, -this.headOpen * 0.35, 0, 1, { emis: [this.headOpen * 0.8, this.headOpen * 0.2, 0] });
    [this.fistL, this.fistR].forEach((f, i) => {
      if (!f.alive) return;
      const s = i === 0 ? -1 : 1;
      this.drawPart(r, BOSS_MODELS.fist, f, PI, 0, 0, 1);
      // chunky arm segments from shoulder to fist
      for (let k = 1; k < 5; k++) {
        const u = k / 5;
        const d = lerp(this.d + 4, f.d, u), x = lerp(this.x + s * 14, f.x, u), y = lerp(this.y + 5, f.y, u);
        drawAt(r, MODELS.shell, d, x, y, 0, 0, 0, 2.2, { tint: [0.3, 0.24, 0.22, 1] });
      }
      const sl = this.slam[i];
      if (sl && sl.t < 2) {
        G.rail.world(_p, G.player.d + 30, sl.x, -14);
        const a = 0.4 + 0.4 * Math.abs(Math.sin(G.time * 16));
        r.sprite(_p.x, (G.env.water ? G.env.water.level : 0) + 0.5, _p.z, 12, 12, G.time, SPR.RING, 1, 0.3, 0.1, a);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 5. THE HUSH
// ---------------------------------------------------------------------------
class BossHush extends Boss {
  constructor() {
    super('THE HUSH', 'The Silence Between Stars');
    this.off = 95;
    this.petals = [];
    for (let i = 0; i < 8; i++) this.petals.push(this.part({ r: 4, hp: 14, name: 'petal', i }));
    this.mask = this.part({ r: 7, hp: 70, invuln: true, name: 'mask' });
    this.bloom = 0; this.silence = false; this.hitsInSilence = 0;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.baseUpdate(dt);
    this.d = P.d + this.curOff;
    const phase2 = this.petals.every((p) => !p.alive);
    this.x = Math.sin(this.t * 0.3) * (phase2 ? 12 : 5); this.y = 2 + Math.sin(this.t * 0.5) * (phase2 ? 5 : 2);
    this.bloom = damp(this.bloom, phase2 ? 1 : 0.35 + 0.15 * Math.sin(this.t), 2, dt);
    this.petals.forEach((p, i) => {
      const a = (i / 8) * TAU + this.t * 0.25;
      const rad = 10 + this.bloom * 8;
      p.d = this.d + 2; p.x = this.x + Math.cos(a) * rad; p.y = this.y + Math.sin(a) * rad; p.ang = a;
    });
    this.mask.d = this.d; this.mask.x = this.x; this.mask.y = this.y; this.mask.invuln = !phase2;
    if (phase2 && !this.silence && !this.dead) { this.silence = true; G.enterSilence(); }
    if (this.entering || this.dead || !P.alive) return;
    if (!phase2) {
      // each petal fires on its own sixteenth: a melody of bullets
      if (G.stepCrossed) {
        const k = G.stepIndex % 16;
        const p = this.petals[(k * 3) % 8];
        if (p.alive && k % 2 === 0) this.aimed(p.d, p.x, p.y, 30, 0, 1);
      }
      if (G.onBar && G.barIndex % 2 === 1) this.ring(this.d, this.x, this.y, 16, 10, G.time, 22);
    } else {
      // in silence the beat still exists — you just can't hear it
      if (G.onBeat && (G.beatIndex % 2 === 0 || G.diff.fire > 0.9)) this.ring(this.mask.d, this.mask.x, this.mask.y, 10, 12, G.beatIndex * 0.35, 26);
      if (G.onBar) this.aimed(this.mask.d, this.mask.x, this.mask.y, 55, 0.5, 5);
    }
  }
  hit(p, dmg, src) {
    const ok = super.hit(p, dmg, src);
    if (ok && p === this.mask && this.silence && !this.dead) G_restoreNote();
    return ok;
  }
  onPart(p) {
    if (this.petals.filter((q) => q.alive).length === 4) Game.say('hush', '...why do you sing... when silence is so much kinder...');
  }
  draw(r) {
    const G = Game;
    for (const p of this.petals) {
      if (!p.alive) continue;
      this.drawPart(r, BOSS_MODELS.petal, p, PI, -0.2 - this.bloom * 0.5, p.ang - PI / 2, 1, { chrome: 0.4 });
    }
    this.drawPart(r, BOSS_MODELS.mask, this.mask, PI + Math.sin(this.t * 0.7) * 0.2, Math.sin(this.t * 0.5) * 0.1, 0, 1, { chrome: 0.3 });
    drawAt(r, BOSS_MODELS.halo, this.d + 4, this.x, this.y, PI, 0, this.t * 0.3, 1 + this.bloom * 0.5, { tint: [1, 1, 1, 1] });
    G.rail.world(_p, this.d + 6, this.x, this.y);
    const b = 1 - Music.beatPhase();
    r.sprite(_p.x, _p.y, _p.z, 40 + b * 6, 40 + b * 6, 0, SPR.GLOW, 0.6, 0.6, 0.7, 0.3);
  }
}
// Each hit on the Hush's mask in the silence brings back a chord stab.
function G_restoreNote() {
  if (!SFX.ok()) return;
  const t = AudioSys.ctx.currentTime, chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const c = chords[Math.floor(Math.random() * chords.length)];
  const dest = AudioSys.route(AudioSys.sfxBus, 0.6, 0.3);
  for (const m of c) { INST.bell(t, m + 12, 0.3, 0.9, dest); INST.pad(t, m, 0.5, 1.4, dest); }
}

const BOSSES = { conductor: BossConductor, grinder: BossGrinder, serpent: BossSerpent, anvil: BossAnvil, hush: BossHush };
