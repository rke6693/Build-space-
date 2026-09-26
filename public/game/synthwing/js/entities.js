'use strict';
// =============================================================================
// SYNTHWING 64 — entities.js
// Player ship, weapons (lasers, homing lock-on volley, nova bomb), enemies and
// their AI, enemy fire, pickups, obstacles and wingmen.
// Gameplay runs in rail space (d, x, y); see world.js.
// =============================================================================

const PLAYER_AHEAD = 13;
const BOUND_X = 17, BOUND_YMIN = -9, BOUND_YMAX = 11;
const MAX_LOCKS = 8;
const LASER_REL = 290;
const _p = new V3(), _q = new V3(), _t = new V3(), _R = new V3(), _U = new V3(), _M = m4();

// Rail frame (tangent + right + up) at d
function railFrame(rail, d, F, R, U) {
  rail.tangent(F, d);
  R.set(-F.z, 0, F.x).norm(); // cross(F, up)
  U.cross(R, F);
}

// Draw a mesh at rail coords with local rotation.
function drawAt(r, mesh, d, x, y, yaw, pitch, roll, scale, mat, rail, sy, sz) {
  rail = rail || Game.rail;
  railFrame(rail, d, _t, _R, _U);
  rail.world(_p, d, x, y);
  m4frame(_M, _p.x, _p.y, _p.z, _R, _U, _t, yaw, pitch, roll, scale, sy === undefined ? scale : sy, sz === undefined ? scale : sz);
  r.draw(mesh, _M, mat);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
class Player {
  constructor() { this.reset(true); }
  reset(full) {
    this.d = 0; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.bank = 0; this.aimX = 0; this.aimY = 0;
    this.maxShield = full ? 100 : this.maxShield || 100;
    this.shield = this.maxShield;
    if (full) { this.lives = 3; this.bombs = 3; this.laserLv = 1; this.golds = 0; }
    this.invuln = 2; this.rollT = 0; this.rollDir = 1; this.rollCD = 0;
    this.fireCD = 0; this.holdT = 0; this.locks = []; this.lockT = 0;
    this.alive = true; this.dying = 0; this.r = 1.2;
    this.scrapeT = 0; this.lowWarned = false;
    this.trailL = null; this.trailR = null;
    this.visible = true;
    this.hitFlash = 0;
    this.control = true;
  }
  get wx() { return Game.rail.x(this.d) + this.x; }

  update(dt) {
    const G = Game, In = Input;
    if (!this.alive) { this.updateDeath(dt); return; }
    this.invuln = Math.max(0, this.invuln - dt);
    this.rollCD = Math.max(0, this.rollCD - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    const sens = 0.7 + In.settings.sens * 0.15;
    let mx = this.control ? In.move.x : 0, my = this.control ? In.move.y : 0;
    const maxV = 26 * sens;
    if (this.control && In.settings.steer === 'pad' && In.stick.active) {
      // relative steering: finger movement maps directly to ship movement
      const k = 0.28 * sens;
      const tx = In.padDelta.x * k, ty = -In.padDelta.y * k * (In.settings.invertY ? -1 : 1);
      const nvx = dt > 0 ? tx / dt : 0, nvy = dt > 0 ? ty / dt : 0;
      this.vx = damp(this.vx, clamp(nvx, -80, 80), 18, dt);
      this.vy = damp(this.vy, clamp(nvy, -80, 80), 18, dt);
      this.x += tx; this.y += ty;
      mx = clamp(this.vx / 40, -1, 1); my = clamp(this.vy / 40, -1, 1);
    } else {
      this.vx = damp(this.vx, mx * maxV, 7, dt);
      this.vy = damp(this.vy, my * maxV * 0.85, 7, dt);
      this.x += this.vx * dt; this.y += this.vy * dt;
    }
    // barrel roll: quick lateral dodge
    if (this.rollT > 0) {
      this.rollT -= dt;
      this.x += this.rollDir * 22 * dt * (this.rollT / 0.55);
    }
    if (In.rollPressed && this.control && this.rollCD <= 0) this.startRoll(In.rollDir || (Math.abs(mx) > 0.2 ? Math.sign(mx) : 1));
    // bounds
    if (this.x < -BOUND_X) { this.x = -BOUND_X; this.vx = Math.max(0, this.vx); }
    if (this.x > BOUND_X) { this.x = BOUND_X; this.vx = Math.min(0, this.vx); }
    if (this.y > BOUND_YMAX) { this.y = BOUND_YMAX; this.vy = Math.min(0, this.vy); }
    if (this.y < BOUND_YMIN) { this.y = BOUND_YMIN; this.vy = Math.max(0, this.vy); }
    // terrain
    G.rail.world(_p, this.d, this.x, this.y);
    const th = G.terrainHeight(_p.x, _p.z);
    const floor = th + 1.3 - G.rail.y(this.d);
    if (this.y < floor) {
      this.y = floor; this.vy = Math.max(this.vy, 8);
      this.scrapeT += dt;
      if (this.scrapeT > 0.12) { this.scrapeT = 0; this.hurt(6, true); FX.hitSpark(_p.x, _p.y - 0.8, _p.z, 0, 6, -G.speed * 0.3, [1, 0.8, 0.4]); }
    }
    const wl = G.env.water ? G.env.water.level + 0.9 - G.rail.y(this.d) : -999;
    if (this.y < wl) { this.y = wl; if (Math.random() < 0.5) FX.spawn(_p.x + rr(-1, 1), G.env.water.level + 0.3, _p.z + 1, rr(-4, 4), rr(6, 12), 5, 0.6, 1.2, 0.3, 0.8, 0.9, 1, 0.9, SPR.DOT, false, 1, -25); }
    // bank & aim
    const rollAnim = this.rollT > 0 ? (1 - this.rollT / 0.55) * TAU * -this.rollDir : 0;
    this.bank = damp(this.bank, -this.vx * 0.028 - mx * 0.25, 8, dt);
    this.jolt = Math.max(0, (this.jolt || 0) - dt * 3);
    this.rollAngle = this.bank + rollAnim + Math.sin(this.t2 = (this.t2 || 0) + dt * 38) * this.jolt * 0.35;
    this.aimX = damp(this.aimX, mx * 0.3, 6, dt);
    this.aimY = damp(this.aimY, my * 0.24, 6, dt);
    // weapons
    this.fireCD -= dt;
    if (this.control) {
      if (In.firePressed) { this.shoot(); this.holdT = 0; }
      if (In.fire) {
        this.holdT += dt;
        if (this.fireCD <= 0 && this.holdT > 0.12) this.shoot();
        if (this.holdT > 0.2) this.paintLocks(dt);
      }
      if (In.fireReleased) { if (this.locks.length) this.releaseLocks(); this.holdT = 0; }
      if (In.bombPressed) this.fireBomb();
    }
    if (!In.fire && this.locks.length && !In.fireReleased) this.releaseLocks();
    // shield warning
    if (this.shield < this.maxShield * 0.3 && !this.lowWarned) { this.lowWarned = true; SFX.shieldLow(); G.sayOnce('lowShield'); }
    if (this.shield > this.maxShield * 0.5) this.lowWarned = false;
    // contrails when turning hard
    this.updateTrails();
    // damaged smoke
    if (this.shield < this.maxShield * 0.3 && Math.random() < dt * 25) FX.spawn(_p.x, _p.y, _p.z + 1.5, rr(-1, 1), 2, 8, 0.8, 0.6, 2.2, 0.25, 0.22, 0.25, 0.5, SPR.SMOKE, false, 1);
  }
  startRoll(dir) {
    this.rollT = 0.55; this.rollDir = dir || 1; this.rollCD = 0.75;
    SFX.roll(); Haptics.tap(0.5);
  }
  get rolling() { return this.rollT > 0.05; }
  worldPos(out) { return Game.rail.world(out, this.d, this.x, this.y); }
  shoot() {
    const G = Game;
    this.fireCD = 0.11;
    const lv = this.laserLv;
    let ax = this.aimX, ay = this.aimY;
    // gentle aim assist toward an enemy near the reticle
    const tgt = G.findNearReticle(0.075);
    if (tgt) { const dd = Math.max(8, tgt.d - this.d); ax = lerp(ax, (tgt.x - this.x) / dd, 0.65); ay = lerp(ay, (tgt.y - this.y) / dd, 0.65); }
    const offs = lv >= 2 ? [-0.7, 0.7] : [0];
    const [sx, sy] = G.rail.slope(this.d);
    for (const o of offs) {
      // muzzle flash that rides along with the ship
      G.rail.world(_p, this.d + 1.9, this.x + o, this.y - 0.1);
      FX.spawn(_p.x, _p.y, _p.z, sx * G.speed, sy * G.speed, -G.speed, 0.06, lv >= 3 ? 2.2 : 1.7, 0.6, lv >= 3 ? 0.5 : 0.55, lv >= 3 ? 0.85 : 1, lv >= 3 ? 1 : 0.6, 1, SPR.SPARKLE);
      G.pbullets.push({ d: this.d + 1.8, x: this.x + o, y: this.y - 0.1, pd: this.d, px: this.x, py: this.y, vd: G.speed + LASER_REL, vx: ax * LASER_REL, vy: ay * LASER_REL, life: 1.1, dmg: lv >= 3 ? 2 : 1, lv, deflected: false });
    }
    SFX.laser(lv);
  }
  paintLocks(dt) {
    const G = Game;
    this.lockT -= dt;
    if (this.lockT > 0 || this.locks.length >= MAX_LOCKS) return;
    const t = G.findNearReticle(0.14, true);
    if (t) {
      this.locks.push(t); t.lockCount = (t.lockCount || 0) + 1; t.lockPulse = 1;
      SFX.lock(this.locks.length - 1); Haptics.tap(0.3);
      this.lockT = 0.07;
    }
  }
  releaseLocks() {
    const G = Game;
    const n = this.locks.length;
    const volley = { kills: 0, n, id: G.volleyId++ };
    this.locks.forEach((t, i) => {
      const side = i % 2 ? 1 : -1;
      const h = {
        d: this.d + 1, x: this.x, y: this.y, vd: G.speed + rr(20, 50), vx: side * rr(30, 55), vy: rr(10, 40) * (i % 3 === 0 ? -0.5 : 1),
        target: t, t: -i * (Music.stepDur || 0.06) * 0.5, life: 2.2, idx: i, volley, trail: FX.trail(0.5, i % 2 ? [0.4, 1, 0.8] : [0.5, 0.8, 1], 11),
      };
      G.homing.push(h);
    });
    this.locks.length = 0;
    SFX.release();
  }
  fireBomb() {
    const G = Game;
    if (this.bombs <= 0 || G.bomb) return;
    this.bombs--;
    G.bomb = { d: this.d + 2, x: this.x, y: this.y, vd: G.speed + 140, vx: this.aimX * 140, vy: this.aimY * 140, t: 0 };
    SFX.bomb(); Haptics.tap(1);
  }
  hurt(amount, scrape) {
    const G = Game;
    if (!this.alive || this.invuln > 0 || G.invincible) return false;
    this.shield -= amount * G.diff.dmg;
    this.hitFlash = 1; this.jolt = scrape ? 0.4 : 1;
    if (!scrape) { this.invuln = 0.9; SFX.playerHit(); G.shake(0.6); G.flash([1, 0.2, 0.2], 0.35); G.resonanceHit(); Haptics.tap(1); G.aberration = 0.012; }
    else { G.shake(0.25); Haptics.tap(0.4); }
    if (this.shield <= 0) { this.shield = 0; this.die(); }
    return true;
  }
  heal(a) { this.shield = Math.min(this.maxShield, this.shield + a); }
  die() {
    const G = Game;
    this.alive = false; this.dying = 0; this.control = false;
    this.locks.forEach((t) => { t.lockCount = 0; }); this.locks.length = 0;
    G.onPlayerDown();
  }
  updateDeath(dt) {
    this.dying += dt;
    this.y -= dt * (6 + this.dying * 14);
    this.x += dt * 6;
    this.rollAngle += dt * 9;
    this.worldPos(_p);
    if (Math.random() < dt * 30) FX.explode(_p.x + rr(-1, 1), _p.y, _p.z, 0.6, { notes: false });
    if (this.dying > 1.1 && this.visible) { this.visible = false; FX.explode(_p.x, _p.y, _p.z, 3, { notes: false }); SFX.bigBoom(); Game.shake(1); Game.shockwave(_p.x, _p.y, _p.z, 1.4); }
  }
  updateTrails() {
    const hard = Math.abs(this.vx) > 16 || this.rolling;
    if (hard && !this.trailL) { this.trailL = FX.trail(0.18, [0.8, 0.9, 1], 14); this.trailR = FX.trail(0.18, [0.8, 0.9, 1], 14); }
    if (!hard && this.trailL) { this.trailL.alive = false; this.trailR.alive = false; this.trailL = this.trailR = null; }
    if (this.trailL) {
      railFrame(Game.rail, this.d, _t, _R, _U);
      this.worldPos(_p);
      const c = Math.cos(this.rollAngle), s = Math.sin(this.rollAngle);
      for (const [tr, side] of [[this.trailL, -1], [this.trailR, 1]]) {
        const ox = side * 2.5 * c, oy = side * 2.5 * -s;
        tr.pts.unshift(new V3(_p.x + _R.x * ox + _U.x * oy, _p.y + _R.y * ox + _U.y * oy + 0.1, _p.z + 1.2));
        if (tr.pts.length > tr.maxPts) tr.pts.pop();
      }
    }
    // age trail points backwards with the world (they stay put in world space)
  }
  draw(r) {
    if (!this.visible) return;
    const G = Game;
    const blink = this.invuln > 0 && this.alive && Math.floor(this.invuln * 16) % 2 === 0 && this.invuln < 0.85;
    if (blink) return;
    const mesh = G.save && G.save.gold ? MODELS.gold : MODELS.player;
    drawAt(r, mesh, this.d, this.x, this.y, -this.aimX * 0.9, this.aimY * 0.9, this.rollAngle, 1, { chrome: 0.3, flash: this.hitFlash * 0.8 });
    // engine glow + flame (pulses with the beat)
    this.worldPos(_p);
    railFrame(G.rail, this.d, _t, _R, _U);
    const pulse = 1 + (1 - Music.beatPhase()) * 0.25;
    const bx = _p.x - _t.x * 1.5, by = _p.y - _t.y * 1.5, bz = _p.z - _t.z * 1.5;
    r.sprite(bx, by, bz, 1.4 * pulse, 1.4 * pulse, 0, SPR.GLOW, 0.4, 0.9, 1, 0.9);
    r.streak(bx - _t.x * 1.2, by - _t.y * 1.2, bz - _t.z * 1.2, -_t.x * 1.4, -_t.y * 1.4, -_t.z * 1.4, 0.55, SPR.STREAK, 0.5, 0.95, 1, 0.8);
    if (this.rolling) r.sprite(_p.x, _p.y, _p.z, 4.2, 4.2, G.time * 12, SPR.RING, 0.4, 0.8, 1, 0.55);
    // blob shadow
    const th = G.terrainHeight(_p.x, _p.z), wl = G.env.water ? G.env.water.level : -1e9;
    const gy = Math.max(th, wl);
    const hgt = _p.y - gy;
    if (hgt < 40 && hgt > 0) {
      m4euler(_M, _p.x, gy + 0.25, _p.z, 0, 0, 0, 1);
      _M[0] = _M[10] = 2.2 * (1 - hgt / 50); _M[5] = 1;
      r.draw(MODELS.shadow, _M, { tint: [0, 0, 0, 0.35 * (1 - hgt / 40)], blend: 'alpha', fog: 1 });
    }
  }
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
const ETYPES = {
  drone: { mesh: 'drone', hp: 1, r: 1.7, score: 100, res: 1, fire: 0.18 },
  swooper: { mesh: 'swooper', hp: 2, r: 2.4, score: 150, res: 1, fire: 0.22 },
  turret: { mesh: 'turret', hp: 3, r: 2.4, score: 200, res: 1, fire: 0.35, ground: true },
  carrier: { mesh: 'carrier', hp: 26, r: 5.5, score: 1500, res: 3, fire: 0.3, big: true },
  spinner: { mesh: 'spinnerCore', hp: 5, r: 1.9, score: 400, res: 2, fire: 0.25 },
  mine: { mesh: 'mine', hp: 1, r: 1.8, score: 50, res: 0.5, fire: 0 },
  sniper: { mesh: 'sniper', hp: 4, r: 2.2, score: 300, res: 1.5, fire: 0 },
  rock: { mesh: 'asteroid', hp: 3, r: 3, score: 60, res: 0.5, fire: 0, solid: true },
  bigrock: { mesh: 'asteroid', hp: 12, r: 8, score: 300, res: 1, fire: 0, solid: true, big: true },
  pylon: { mesh: 'pylon', hp: 14, r: 3.5, score: 800, res: 2, fire: 0, solid: true, ground: true, big: true },
  cube: { mesh: 'cube', hp: 2, r: 2, score: 120, res: 1, fire: 0.2 },
  chaser: { mesh: 'drone', hp: 5, r: 2, score: 500, res: 2, fire: 0 },
  crystal: { mesh: 'crystal', hp: 3, r: 3.2, score: 300, res: 1.5, fire: 0, ground: true },
};

// Enemies that can juke out of the reticle, and ones that spin out and crash
// when destroyed instead of popping in place.
const DODGERS = new Set(['drone', 'swooper', 'cube', 'sniper']);
const WRECKERS = new Set(['swooper', 'sniper', 'carrier', 'spinner', 'chaser', 'cube']);
// Semi-implicit damped spring on o[x] with velocity o[v].
function spring(o, x, v, k, c, dt) { o[v] += (-k * o[x] - c * o[v]) * dt; o[x] += o[v] * dt; }

class Enemy {
  constructor(type, ai, o = {}) {
    const T = ETYPES[type];
    this.type = type; this.ai = ai; this.T = T;
    this.mesh = T.mesh === 'asteroid' ? pick(MODELS.asteroids) : MODELS[T.mesh];
    this.hp = (o.hp || T.hp) * (T.big ? Game.diff.hp : 1); this.maxHp = this.hp;
    this.r = (o.scale || 1) * T.r; this.scale = o.scale || 1;
    this.d = o.d || 0; this.x = o.x || 0; this.y = o.y || 0;
    this.vd = 0; this.vx = 0; this.vy = 0;
    this.yaw = PI; this.pitch = 0; this.roll = 0;
    this.t = 0; this.flash = 0; this.dead = false; this.gone = false;
    this.lockCount = 0; this.lockPulse = 0;
    this.o = o;
    this.slotX = o.x || 0; this.slotY = o.y || 0;
    this.off = o.off !== undefined ? o.off : 150;
    this.hold = o.hold || 5;
    this.phase = o.phase || 0;
    this.fireRate = (o.fire !== undefined ? o.fire : T.fire) * Game.diff.fire;
    this.spin = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1));
    this.shielded = false;
    this.tele = 0;
    this.wx = 0; this.wy = 0; this.wz = 0;
    this.score = T.score;
    this.onKill = o.onKill || null;
    // Reaction layer: springs that are added on top of the AI's motion.
    this.kd = 0; this.kx = 0; this.ky = 0; this.kvd = 0; this.kvx = 0; this.kvy = 0; // knockback
    this.sRoll = 0; this.sYaw = 0; this.sPitch = 0; this.sRollV = 0; this.sYawV = 0; this.sPitchV = 0; // spin kick
    this.sq = 0; this.sqv = 0; // squash & stretch
    this.bank = 0; this.bpitch = 0; this.autoBank = 1; // lean into the motion
    this.beatPop = 0; this.armed = false; this.aggro = 0; this.aimedT = 0; this.dodgeCD = rr(1, 2);
    this.smokeT = 0; this.muzzle = 0; this.gunKick = 0; this.clang = 0;
  }
  get P() { return Game.player; }
  update(dt) {
    const G = Game, P = G.player;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 8);
    this.lockPulse = Math.max(0, this.lockPulse - dt * 3);
    this.muzzle = Math.max(0, this.muzzle - dt * 9);
    this.gunKick = Math.max(0, this.gunKick - dt * 5);
    this.clang = Math.max(0, this.clang - dt * 4);
    this.aggro = Math.max(0, this.aggro - dt);
    this.dodgeCD -= dt;
    // The AI steers the undisturbed "base" position; reactions are layered on top.
    this.d -= this.kd; this.x -= this.kx; this.y -= this.ky;
    const bx = this.x, by = this.y;
    const AI = ENEMY_AI[this.ai];
    if (AI) AI(this, dt, G, P);
    if (dt > 0) {
      const vx = (this.x - bx) / dt, vy = (this.y - by) / dt;
      const face = -Math.cos(this.yaw); // +1 facing the player, -1 facing away
      this.bank = damp(this.bank, clamp(face * vx * 0.045, -0.9, 0.9) * this.autoBank, 6, dt);
      this.bpitch = damp(this.bpitch, clamp(vy * 0.025, -0.5, 0.5) * this.autoBank, 6, dt);
    }
    spring(this, 'kd', 'kvd', 45, 9, dt); spring(this, 'kx', 'kvx', 45, 9, dt); spring(this, 'ky', 'kvy', 45, 9, dt);
    spring(this, 'sRoll', 'sRollV', 30, 6.5, dt); spring(this, 'sYaw', 'sYawV', 30, 6.5, dt); spring(this, 'sPitch', 'sPitchV', 30, 6.5, dt);
    spring(this, 'sq', 'sqv', 140, 11, dt);
    this.d += this.kd; this.x += this.kx; this.y += this.ky;
    // everybody dances on the beat
    if (G.onBeat) this.beatPop = 1;
    this.beatPop = Math.max(0, this.beatPop - dt * 4);
    // world cache
    G.rail.world(_p, this.d, this.x, this.y);
    if (dt > 0 && this.t > dt) { this.wvx = (_p.x - this.wx) / dt; this.wvy = (_p.y - this.wy) / dt; this.wvz = (_p.z - this.wz) / dt; }
    this.wx = _p.x; this.wy = _p.y; this.wz = _p.z;
    // passed behind the camera?
    if (this.d < P.d - 26 && this.ai !== 'behind' && this.ai !== 'chaser' && this.ai !== 'loop') this.gone = true;
    if (this.d > P.d + 900) this.gone = true;
    // linger on a dodger with the reticle and it may barrel-roll out of the way
    if (G.hotTarget === this) this.aimedT += dt; else this.aimedT = Math.max(0, this.aimedT - dt * 2);
    if (this.aimedT > 0.35 && this.dodgeCD <= 0 && DODGERS.has(this.type) && this.t > 1.2 && Math.random() < G.diff.dodge * dt * 4) this.dodge(this.x >= P.x ? 1 : -1);
    // damaged units trail smoke and embers
    if (this.maxHp > 1 && this.hp < this.maxHp * 0.55 && !this.T.solid && !this.dead) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.05;
        const vx = (this.wvx || 0) * 0.85, vy = (this.wvy || 0) * 0.85, vz = (this.wvz || 0) * 0.85;
        FX.spawn(this.wx + rr(-0.5, 0.5), this.wy + 0.3, this.wz + this.r * 0.5, vx + rr(-1, 1), vy + rr(1, 3), vz, rr(0.6, 1), this.r * 0.4, this.r * 1.2, 0.2, 0.18, 0.22, 0.6, SPR.SMOKE, false, 1.2);
        if (Math.random() < 0.35) FX.spawn(this.wx, this.wy, this.wz, vx + rr(-4, 4), vy + rr(0, 5), vz + rr(-4, 4), 0.35, 0.5, 0.1, 1, 0.55, 0.15, 1, SPR.GLOW, true, 1, -12);
      }
    }
    // collide with player
    if (P.alive && !this.dead) {
      const dd = this.d - P.d, dx = this.x - P.x, dy = this.y - P.y;
      const rr2 = this.r + P.r;
      if (dd * dd + dx * dx + dy * dy < rr2 * rr2) {
        if (P.hurt(this.T.big ? 25 : 15)) { G.shake(0.8); }
        if (!this.T.big && this.type !== 'pylon') this.damage(99, null);
      }
    }
    // beat-synced fire with a one-beat wind-up telegraph (the core swells, then shoots on the beat)
    if (G.onBeat) {
      if (this.armed) { this.armed = false; if (this.inRange()) this.fire(); }
      else if (this.fireRate > 0 && this.inRange() && Math.random() < this.fireRate * (this.aggro > 0 ? 2 : 1)) this.armed = true;
    }
  }
  inRange() { const off = this.d - Game.player.d; return off > 22 && off < 230 && Game.player.alive && !Game.clearing; }
  fire(speed, spread = 0) {
    const G = Game, P = G.player;
    const s = (speed || 42) * G.diff.bullet;
    const lead = 6;
    let dd = (P.d + lead) - this.d, dx = P.x + P.vx * 0.3 - this.x, dy = P.y + P.vy * 0.3 - this.y;
    const l = Math.hypot(dd, dx, dy) || 1;
    dd /= l; dx /= l; dy /= l;
    if (spread) { dx += rr(-spread, spread); dy += rr(-spread, spread); }
    G.ebullets.push({ d: this.d - this.r * 0.6, x: this.x, y: this.y, vd: G.speed + dd * s, vx: dx * s, vy: dy * s, r: 0.9, life: 6, dmg: 10, kind: 'orb', born: 0 });
    // recoil + muzzle flash
    this.muzzle = 1; this.gunKick = 1; this.kvd += 6; this.sqv -= 4;
    SFX.enemyShot();
  }
  // Physical reaction to a hit: knockback along the shot, a spin kick and a squash.
  react(src, m = 1) {
    const G = Game;
    let hd = 1, hx = 0, hy = 0;
    if (src && src.vd !== undefined) { hd = src.vd - G.speed; hx = src.vx || 0; hy = src.vy || 0; const l = Math.hypot(hd, hx, hy) || 1; hd /= l; hx /= l; hy /= l; }
    const mass = this.T.big ? 5 : this.T.solid ? 2.5 : 1;
    const push = (10 * m) / mass;
    this.kvd += hd * push; this.kvx += hx * push + rr(-2, 2) / mass; this.kvy += hy * push + rr(-1, 2.5) / mass;
    this.sRollV += rr(-12, 12) / mass; this.sYawV += rr(-5, 5) / mass; this.sPitchV += rr(-5, 5) / mass;
    this.sqv += 8 / Math.sqrt(mass);
  }
  dodge(dir) {
    const G = Game;
    this.dodgeCD = 2.8; this.aimedT = 0;
    this.kvx += dir * 36; this.kvy += rr(-8, 8);
    this.sRoll = -dir * TAU * -Math.cos(this.yaw); // spring unwinds it: a full barrel roll
    for (let i = 0; i < 4; i++) FX.spawn(this.wx, this.wy, this.wz, (this.wvx || 0) - dir * (4 + i * 3), this.wvy || 0, this.wvz || 0, 0.3, this.r * 1.3, 0.3, 1, 0.3, 0.7, 0.45, SPR.GLOW);
    if (Math.random() < 0.3 && G.state === 'play') FX.text(this.wx, this.wy + 2, this.wz, 'DODGE!', '#ff9ad0');
  }
  damage(n, src) {
    if (this.dead) return false;
    if (this.shielded && !(src && src.homing)) { FX.hitSpark(this.wx, this.wy, this.wz + 1, 0, 0, 0, [0.7, 0.7, 1]); SFX.deflect(); this.sqv += 3; this.clang = 1; this.sRollV += rr(-4, 4); return false; }
    this.hp -= n; this.flash = 1;
    this.react(src, this.hp <= 0 ? 1.6 : 1);
    if (this.hp <= 0) { this.kill(src); return true; }
    SFX.hit();
    FX.hitSpark(this.wx, this.wy, this.wz + this.r * 0.5);
    // it hurt — now it's angry: shoot back on the next beat, maybe juke
    this.aggro = 3;
    if (this.fireRate > 0) this.armed = true;
    if (DODGERS.has(this.type) && this.dodgeCD <= 0 && Math.random() < Game.diff.dodge * 0.6) this.dodge(Math.random() < 0.5 ? -1 : 1);
    return false;
  }
  kill(src) {
    const G = Game;
    this.dead = true;
    G.rail.world(_p, this.d, this.x, this.y);
    const wv = G.entityWorldVel(this);
    const size = this.T.big ? 2.6 : this.type === 'mine' ? 2 : 1;
    const hue = (G.time * 0.1) % 1;
    if (WRECKERS.has(this.type) && !(src && src.bomb)) {
      // spin out of control, trailing fire, then blow up
      FX.explode(_p.x, _p.y, _p.z, size * 0.45 * this.scale, { vx: wv.x * 0.7, vy: wv.y * 0.7, vz: wv.z * 0.7, hue });
      FX.wreck(this.wreckMesh(), _p.x, _p.y, _p.z, wv.x * 0.9 + rr(-5, 5), wv.y * 0.9 + rr(3, 9), wv.z * 0.9, this.yaw, this.pitch + this.bpitch, this.roll + this.bank, this.scale, size);
      SFX.explode(size * 0.5);
    } else {
      const rock = this.type === 'rock' || this.type === 'bigrock';
      FX.explode(_p.x, _p.y, _p.z, size * this.scale, { vx: wv.x * 0.7, vy: wv.y * 0.7, vz: wv.z * 0.7, hue, debris: rock ? [0.45, 0.4, 0.35] : undefined, notes: !rock || Math.random() < 0.4 });
      if (rock) FX.crumble(_p.x, _p.y, _p.z, this.r, wv);
      SFX.explode(size);
    }
    if (size >= 2) { G.shake(0.5); G.hitstop(0.06); G.shockwave(_p.x, _p.y, _p.z, 0.8); G.fovKick = Math.max(G.fovKick, 2.5); }
    G.onKill(this, src);
    if (this.type === 'mine') {
      // chain reaction
      for (const e of G.enemies) if (e !== this && !e.dead && Math.hypot(e.d - this.d, e.x - this.x, e.y - this.y) < 14) setTimeout(() => e.damage(5, { chain: true }), 80);
      const P = G.player; if (Math.hypot(P.d - this.d, P.x - this.x, P.y - this.y) < 8) P.hurt(15);
    }
    if (this.onKill) this.onKill(this);
  }
  wreckMesh() { return this.type === 'swooper' ? MODELS.swooper : this.type === 'chaser' ? MODELS.drone : this.mesh; }
  draw(r) {
    const G = Game;
    let jit = 0;
    if (this.hp < this.maxHp * 0.4 && this.T.big) jit = (Math.random() - 0.5) * 0.3;
    const mat = _emat;
    const charge = this.armed ? Music.beatPhase() : 0;
    const lp = this.lockPulse;
    mat.flash = this.flash;
    mat.emis = lp > 0 || charge > 0 ? [lp * 0.6 + charge * 0.5, lp * 0.2 + charge * 0.06, lp * 0.4 + charge * 0.38]
      : this.aggro > 0 && Math.floor(this.t * 12) % 3 === 0 ? [0.3, 0, 0.12] : null;
    mat.tex = this.type === 'rock' || this.type === 'bigrock' ? TEX.rock : null; mat.texMix = 0.8; mat.uvScale = [1, 1];
    const dances = !this.T.solid && !this.T.ground;
    const pop = 1 + (dances ? this.beatPop * 0.07 : 0);
    const sxy = this.scale * pop * (1 + this.sq * 0.45), sz = this.scale * pop * (1 - this.sq * 0.5);
    const yaw = this.yaw + this.sYaw, pitch = this.pitch + this.bpitch + this.sPitch, roll = this.roll + this.bank + this.sRoll;
    const d = this.d, x = this.x + jit, y = this.y + (dances ? this.beatPop * 0.35 : 0);
    switch (this.type) {
      case 'drone': case 'chaser':
        drawAt(r, MODELS.droneBody, d, x, y, yaw, pitch, roll, sxy, mat, null, sxy, sz);
        drawAt(r, MODELS.droneFins, d, x, y, yaw, pitch, roll + this.t * (3 + this.aggro * 3) + this.phase, sxy, mat, null, sxy, sz);
        break;
      case 'swooper': {
        const flap = Math.sin(this.t * (9 + this.aggro * 5) + this.phase * 3) * 0.55;
        drawAt(r, MODELS.swooperBody, d, x, y, yaw, pitch, roll, sxy, mat, null, sxy, sz);
        drawAt(r, MODELS.swooperWingR, d, x, y, yaw, pitch, roll + flap, sxy, mat, null, sxy, sz);
        drawAt(r, MODELS.swooperWingL, d, x, y, yaw, pitch, roll - flap, sxy, mat, null, sxy, sz);
        break;
      }
      case 'turret': {
        const P = G.player, s = this.scale;
        drawAt(r, MODELS.turretBase, d, x, this.y, yaw, 0, 0, s * (1 + this.sq * 0.2), mat, null, s * (1 - this.sq * 0.3), s * (1 + this.sq * 0.2));
        const aim = clamp(Math.atan2(P.y - this.y - 1, Math.abs(this.d - P.d) + 1), -0.25, 1.1);
        drawAt(r, MODELS.turretGun, d + this.gunKick * 0.7, x, this.y + 1.1 * s, yaw, aim + this.sPitch * 0.5 + this.gunKick * 0.35, this.sRoll * 0.3, s * (1 + this.sq * 0.3), mat);
        break;
      }
      default:
        drawAt(r, this.mesh, d, x, y, yaw, pitch, roll, sxy, mat, null, sxy, sz);
    }
    if (this.type === 'spinner') {
      for (let i = 0; i < 3; i++) {
        const a = this.t * (this.shielded ? 7 : 2) + (i / 3) * TAU;
        const rad = (this.shielded ? 1.9 : 3.2) + this.clang * 0.9 * Math.sin(this.t * 40 + i);
        drawAt(r, MODELS.plate, this.d - (this.shielded ? 1 : 0), this.x + Math.cos(a) * rad, this.y + Math.sin(a) * rad, PI, 0, a + PI / 2, 1, { flash: Math.max(this.flash, this.clang) });
      }
    }
    if (this.type === 'sniper' && this.tele > 0) {
      // telegraph beam
      const pts = _telePts;
      G.rail.world(pts[0], this.d - 2, this.x, this.y);
      G.rail.world(pts[1], this.teleD, this.teleX, this.teleY);
      const a = 0.25 + 0.5 * Math.abs(Math.sin(G.time * 30));
      r.ribbon(pts, 2, 0.12 + this.tele * 0.25, 1, 0.2, 0.3, a, a);
    }
    if (this.T.fire > 0 && this.type !== 'turret') {
      // glowing core pulses with the beat and swells white as it winds up to fire
      G.rail.world(_p, this.d - this.r * 0.55, this.x, y + 0.1);
      const b = 1 - Music.beatPhase(), sz2 = 1.2 + b * 0.8 + charge * 2.4;
      r.sprite(_p.x, _p.y, _p.z, sz2, sz2, 0, SPR.GLOW, 1, 0.2 + charge * 0.7, 0.6 + charge * 0.4, 0.7 + charge * 0.3);
      if (charge > 0.5) r.sprite(_p.x, _p.y, _p.z, sz2 * 1.4, sz2 * 1.4, G.time * 8, SPR.SPARKLE, 1, 0.6, 0.9, (charge - 0.5) * 1.6);
    }
    if (this.muzzle > 0) {
      const off = this.type === 'turret' ? 0 : this.r * 0.8;
      G.rail.world(_p, this.d - off, this.x, this.type === 'turret' ? this.y + 1.6 * this.scale : y);
      r.sprite(_p.x, _p.y, _p.z, 3.2 * this.muzzle, 3.2 * this.muzzle, G.time * 20, SPR.SPARKLE, 1, 0.5, 0.85, 1);
    }
  }
}
const _emat = { flash: 0 };
const _telePts = [new V3(), new V3()];

// Formation-slot helpers for AI
function exitOut(e, dt) { e.x += Math.sign(e.x || 1) * dt * 30; e.y += dt * 12; }

const ENEMY_AI = {
  // Arrive from far ahead, hover at a distance while firing, then fly past.
  hover(e, dt, G, P) {
    const hold = e.hold, arr = 1.8;
    const tgt = e.o.dist || 60;
    if (e.t < arr) {
      const k = easeOutCubic(e.t / arr);
      e.d = P.d + lerp(e.off, tgt, k);
      e.x = lerp(e.slotX * 2.2, e.slotX, k); e.y = lerp(e.slotY + 25, e.slotY, k);
      e.roll = (1 - k) * 2 * Math.sign(e.slotX || 1);
    } else if (e.t < arr + hold) {
      const tt = e.t - arr;
      e.d = P.d + tgt + Math.sin(tt * 1.3 + e.phase) * 4;
      e.x = e.slotX + Math.sin(tt * 1.7 + e.phase) * 3;
      e.y = e.slotY + Math.sin(tt * 2.1 + e.phase * 2) * 2;
      e.roll = Math.sin(tt * 1.7 + e.phase) * 0.4;
    } else {
      const tt = e.t - arr - hold;
      e.d = P.d + tgt - tt * tt * 30;
      e.x += Math.sign(e.slotX || (e.phase > 3 ? 1 : -1)) * dt * (10 + tt * 30);
      e.roll = -Math.sign(e.slotX || 1) * Math.min(1.2, tt * 2);
      e.pitch = Math.min(0.6, tt);
    }
  },
  // Sits in the world; the squadron flies past it.
  pass(e, dt, G, P) {
    if (e.t < dt * 1.5) { e.d0 = e.d; }
    e.x = e.slotX + Math.sin(e.t * 1.6 + e.phase) * (e.o.sway !== undefined ? e.o.sway : 3);
    e.y = e.slotY + Math.cos(e.t * 1.2 + e.phase) * 1.5;
    e.roll = Math.sin(e.t * 1.6 + e.phase) * 0.5;
  },
  // Fly straight at the player's lane.
  charge(e, dt, G, P) {
    e.d -= (e.o.speed || 40) * dt;
    if (e.t < 1.5) { e.x = damp(e.x, P.x * 0.7 + e.slotX * 0.3, 1.2, dt); e.y = damp(e.y, P.y * 0.7 + e.slotY * 0.3, 1.2, dt); }
    e.roll += dt * 3;
  },
  // Overtake from behind the camera, turn around, harass, then leave.
  behind(e, dt, G, P) {
    const T1 = 2.4, tgt = e.o.dist || 55;
    if (e.t < T1) {
      const k = easeInOutCubic(e.t / T1);
      e.d = P.d + lerp(-24, tgt, k);
      e.x = e.slotX; e.y = e.slotY + Math.sin(k * PI) * 7;
      e.yaw = k < 0.7 ? 0 : lerp(0, PI, (k - 0.7) / 0.3);
      e.roll = Math.sin(k * PI) * 1.2 * Math.sign(e.slotX || 1);
    } else if (e.t < T1 + e.hold) {
      const tt = e.t - T1;
      e.yaw = PI; e.roll = Math.sin(tt * 2 + e.phase) * 0.3;
      e.d = P.d + tgt + Math.sin(tt) * 5;
      e.x = e.slotX + Math.sin(tt * 1.4 + e.phase) * 5; e.y = e.slotY + Math.cos(tt * 1.1) * 3;
    } else {
      const tt = e.t - T1 - e.hold;
      e.d = P.d + tgt + tt * tt * 25; e.y += dt * (8 + tt * 20); e.pitch = 0.5;
    }
  },
  // Sweep in from the side in an arc.
  swoop(e, dt, G, P) {
    const T1 = 2.0, tgt = e.o.dist || 50, side = e.o.side || Math.sign(e.slotX || 1);
    if (e.t < T1) {
      const k = easeOutCubic(e.t / T1);
      e.d = P.d + lerp(e.off, tgt, k);
      e.x = lerp(side * 55, e.slotX, k); e.y = e.slotY + Math.sin(k * PI) * 6;
      e.roll = side * (1 - k) * 1.4; e.yaw = PI + side * (1 - k) * 0.8;
    } else if (e.t < T1 + e.hold) {
      const tt = e.t - T1;
      e.yaw = PI; e.d = P.d + tgt; e.x = e.slotX + Math.sin(tt * 2 + e.phase) * 2; e.y = e.slotY + Math.sin(tt * 1.5) * 1.5;
      e.roll = Math.sin(tt * 2 + e.phase) * 0.3;
    } else {
      const tt = e.t - T1 - e.hold;
      e.d = P.d + tgt - tt * 40; e.x -= side * dt * (20 + tt * 40); e.roll = -side * 1.2;
    }
  },
  // Rotating ring formation that hangs ahead.
  circle(e, dt, G, P) {
    const k = Math.min(1, e.t / 1.6), tgt = e.o.dist || 70;
    e.d = P.d + lerp(e.off, tgt, easeOutCubic(k));
    const a = e.phase + e.t * (e.o.spinSpeed || 1.2), R = (e.o.radius || 8) * easeOutBack(k);
    e.x = (e.o.cx || 0) + Math.cos(a) * R; e.y = (e.o.cy || 0) + Math.sin(a) * R;
    e.roll = a;
    if (e.t > e.hold + 1.6) e.d -= (e.t - e.hold - 1.6) * 60 * dt * 20;
  },
  // Follow-the-leader chain that weaves toward you (members share one path, offset in time).
  snake(e, dt, G, P) {
    const u = Math.max(0, e.t - (e.o.delay || 0));
    e.d = P.d + e.off - u * (e.o.speed || 30);
    const A = e.o.ax !== undefined ? e.o.ax : 12, B = e.o.ay !== undefined ? e.o.ay : 5, ph = e.o.ph || 0;
    e.x = (e.o.cx || 0) + Math.sin(u * 1.5 + ph) * A;
    e.y = (e.o.cy || 0) + Math.sin(u * 2.1 + ph) * B;
    e.yaw = PI + Math.cos(u * 1.5 + ph) * A * 0.02;
  },
  // Overtake from behind, pull a vertical loop-the-loop right in front of you, then turn and fight.
  loop(e, dt, G, P) {
    const R = e.o.radius || 11, T1 = 1.2, T2 = 2.2, cd = e.o.dist || 45;
    if (e.t < T1) {
      const k = easeOutCubic(e.t / T1);
      e.d = P.d + lerp(-22, cd, k); e.x = e.slotX; e.y = e.slotY - R;
      e.yaw = 0; e.pitch = 0; e.roll = Math.sin(k * PI) * 0.8; e.autoBank = 0;
    } else if (e.t < T1 + T2) {
      const a = ((e.t - T1) / T2) * TAU;
      e.d = P.d + cd + Math.sin(a) * R; e.y = e.slotY - Math.cos(a) * R; e.x = e.slotX;
      e.yaw = 0; e.pitch = a; e.roll = 0; e.autoBank = 0;
    } else if (e.t < T1 + T2 + 0.7) {
      const k = easeInOutCubic((e.t - T1 - T2) / 0.7);
      e.d = P.d + cd + k * 12; e.y = e.slotY - R + k * R; e.x = e.slotX;
      e.yaw = lerp(0, PI, k); e.pitch = 0; e.roll = Math.sin(k * PI) * 1.4 * Math.sign(e.slotX || 1); e.autoBank = 0;
    } else if (e.t < T1 + T2 + 0.7 + e.hold) {
      const tt = e.t - T1 - T2 - 0.7;
      e.autoBank = 1; e.yaw = PI; e.pitch = 0; e.roll = 0;
      e.d = P.d + cd + 12 + Math.sin(tt * 1.2) * 4; e.x = e.slotX + Math.sin(tt * 1.6 + e.phase) * 4; e.y = e.slotY + Math.cos(tt * 1.3) * 2;
    } else {
      const tt = e.t - T1 - T2 - 0.7 - e.hold;
      e.d = P.d + cd + 12 + tt * tt * 30; e.y += dt * (10 + tt * 25); e.pitch = 0.6;
      if (tt > 3) e.gone = true;
    }
  },
  // Cross the screen side to side at a fixed distance, guns blazing.
  strafe(e, dt, G, P) {
    const side = e.o.side || 1, dur = e.o.dur || 3.4;
    const k = Math.max(0, e.t - (e.o.delay || 0)) / dur;
    e.d = P.d + (e.o.dist || 55) - Math.sin(clamp01(k) * PI) * 12;
    e.x = lerp(-side * 58, side * 58, k) + e.slotX * 0.3;
    e.y = e.slotY + Math.sin(clamp01(k) * PI) * 5;
    e.yaw = -side * (PI / 2 + 0.55 * Math.sin(clamp01(k) * PI));
    if (k >= 1) e.gone = true;
  },
  // Plunge from high above, level out in your lane, then pull up past you.
  dive(e, dt, G, P) {
    const T = 2.3, tt = Math.max(0, e.t - (e.o.delay || 0)), k = Math.min(1, tt / T);
    e.d = P.d + lerp(e.off, 22, easeInOutCubic(k)) - Math.max(0, tt - T) * 40;
    const drop = 1 - easeOutCubic(Math.min(1, k * 1.5));
    e.x = e.slotX + Math.sin(tt * 2 + e.phase) * 1.5;
    e.y = e.slotY + drop * 42 + Math.max(0, tt - T) * Math.max(0, tt - T) * 10;
    e.yaw = PI;
    e.pitch = -drop * 1.1 + Math.max(0, tt - T) * 0.8;
    e.autoBank = tt < T ? 0.3 : 1;
  },
  turret(e, dt, G, P) {
    const dd = P.d - e.d, dx = P.x - e.x;
    e.yaw += wrapAngle(Math.atan2(-dx, dd) - e.yaw) * (1 - Math.exp(-4 * dt)); // face the player
  },
  ground() {},
  static(e, dt) { e.yaw += dt * e.spin.x * 0.5; e.pitch += dt * e.spin.y * 0.5; e.roll += dt * e.spin.z * 0.5; },
  rock(e, dt) {
    e.x += (e.o.vx || 0) * dt; e.y += (e.o.vy || 0) * dt; e.d += (e.o.vd || 0) * dt;
    e.yaw += dt * e.spin.x * 0.8; e.pitch += dt * e.spin.y * 0.8; e.roll += dt * e.spin.z * 0.8;
  },
  mine(e, dt, G, P) {
    e.y = e.slotY + Math.sin(e.t * 2 + e.phase) * 0.8; e.yaw += dt; e.roll += dt * 0.7;
    if (P.alive && Math.hypot(P.d - e.d, P.x - e.x, P.y - e.y) < 5.5) e.damage(99, { proximity: true });
  },
  carrier(e, dt, G, P) {
    const k = Math.min(1, e.t / 3);
    e.d = P.d + lerp(e.off, 95, easeOutCubic(k)) + (e.t > e.hold + 3 ? (e.t - e.hold - 3) * 40 : 0);
    e.x = e.slotX + Math.sin(e.t * 0.5) * 8; e.y = e.slotY + Math.sin(e.t * 0.8) * 2;
    e.roll = Math.sin(e.t * 0.5) * 0.15;
    if (G.onBar && e.t > 2 && e.t < e.hold + 3 && G.enemies.length < 40) {
      for (const s of [-1, 1]) G.spawnEnemy('drone', 'hover', { off: e.d - P.d, x: e.x + s * 4, y: e.y - 1, dist: rr(40, 55), hold: 3, phase: rand() * 6 });
    }
  },
  spinner(e, dt, G, P) {
    const k = Math.min(1, e.t / 1.8), tgt = e.o.dist || 60;
    e.d = P.d + lerp(e.off, tgt, easeOutCubic(k));
    e.x = e.slotX + Math.sin(e.t * 0.9 + e.phase) * 5; e.y = e.slotY + Math.cos(e.t * 0.7) * 2;
    e.shielded = Math.floor(Music.barPhase() * 2) === 0; // shield up for the first half of every bar
    if (e.t > e.hold + 1.8) { e.d -= dt * 60; e.shielded = false; }
    e.yaw = PI;
  },
  sniper(e, dt, G, P) {
    const k = Math.min(1, e.t / 2), tgt = e.o.dist || 110;
    e.d = P.d + lerp(e.off, tgt, easeOutCubic(k));
    e.x = e.slotX + Math.sin(e.t * 0.6 + e.phase) * 6; e.y = e.slotY + Math.sin(e.t * 0.9) * 2;
    e.yaw = Math.atan2(-(P.x - e.x), P.d - e.d); e.pitch = Math.atan2(P.y - e.y, e.d - P.d) * 0.6;
    if (e.t > 2 && e.t < e.hold + 2 && P.alive) {
      if (e.tele <= 0 && G.onBar) { e.tele = 0.001; e.teleD = P.d; e.teleX = P.x; e.teleY = P.y; }
      if (e.tele > 0) {
        e.tele += dt / (Music.stepDur * 16 || 1.8);
        if (e.tele < 0.6) { e.teleD = P.d; e.teleX = damp(e.teleX, P.x, 4, dt); e.teleY = damp(e.teleY, P.y, 4, dt); }
        if (e.tele >= 1) {
          e.tele = 0;
          const s = 150 * Game.diff.bullet;
          let dd = e.teleD - e.d, dx = e.teleX - e.x, dy = e.teleY - e.y; const l = Math.hypot(dd, dx, dy);
          G.ebullets.push({ d: e.d - 2, x: e.x, y: e.y, vd: G.speed + (dd / l) * s, vx: (dx / l) * s, vy: (dy / l) * s, r: 1.1, life: 3, dmg: 18, kind: 'beam' });
          SFX.beam();
        }
      }
    } else e.tele = 0;
    if (e.t > e.hold + 2) { e.d -= dt * 50; e.y += dt * 10; }
  },
  chaser(e, dt, G, P) {
    const w = e.o.wing;
    if (!w || w.state !== 'trouble') { e.d += dt * 60; e.y += dt * 20; if (e.t > 3) e.gone = true; return; }
    e.d = w.d - 9; e.x = damp(e.x, w.x + Math.sin(e.t * 2) * 1.5, 3, dt); e.y = damp(e.y, w.y + 1, 3, dt);
    e.yaw = 0; e.roll = w.roll * 0.8;
    if (G.onBeat && Math.random() < 0.5) {
      FX.spawn(e.wx, e.wy, e.wz - 2, 0, 0, -G.speed - 60, 0.3, 0.6, 0.3, 1, 0.3, 0.5, 1, SPR.BOLT);
    }
  },
};

// ---------------------------------------------------------------------------
// Static obstacles & scenery with collision (world space)
// ---------------------------------------------------------------------------
class Prop {
  constructor(kind, wx, wy, wz, o = {}) {
    this.kind = kind; this.x = wx; this.y = wy; this.z = wz; this.o = o;
    this.yaw = o.yaw || 0; this.scale = o.scale || 1;
    this.mesh = MODELS[kind];
    this.t = 0; this.gone = false; this.passed = false;
    this.tex = o.tex ? TEX[o.tex] : kind === 'arch' ? TEX.rock : kind === 'house' ? TEX.windows : kind === 'station' || kind === 'panel' ? TEX.metal : null;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.t += dt;
    if (-this.z < P.d - 60) this.gone = true;
    if (this.kind === 'gate' && !this.passed && -this.z < P.d) {
      this.passed = true;
      P.worldPos(_p);
      if (Math.hypot(_p.x - this.x, _p.y - this.y) < 9 * this.scale) G.onCheckpoint(this);
    }
    if (!P.alive) return;
    P.worldPos(_p);
    for (const c of this.colliders()) {
      if (c.t === 'cyl') {
        if (_p.y < c.y0 || _p.y > c.y1) continue;
        const dx = _p.x - c.x, dz = _p.z - c.z;
        if (dx * dx + dz * dz < (c.r + 1) * (c.r + 1)) { this.bump(P, dx); }
      } else if (c.t === 'box') {
        if (Math.abs(_p.x - c.x) < c.hx + 0.8 && Math.abs(_p.y - c.y) < c.hy + 0.6 && Math.abs(_p.z - c.z) < c.hz + 0.8) this.bump(P, _p.x - c.x);
      }
    }
  }
  bump(P, dx) {
    if (P.hurt(12)) { P.vx = Math.sign(dx || 1) * 30; P.x += Math.sign(dx || 1) * 1.5; FX.hitSpark(_p.x, _p.y, _p.z, 0, 0, 0, [1, 0.8, 0.5]); }
  }
  colliders() {
    const s = this.scale, x = this.x, y = this.y, z = this.z;
    switch (this.kind) {
      case 'arch': return [{ t: 'cyl', x: x - 13 * s, z, r: 3.6 * s, y0: y - 30, y1: y + 2 }, { t: 'cyl', x: x + 13 * s, z, r: 3.6 * s, y0: y - 30, y1: y + 2 }, { t: 'box', x, y: y + 14 * s, z, hx: 16 * s, hy: 3 * s, hz: 3 * s }];
      case 'lighthouse': return [{ t: 'cyl', x, z, r: 3.8 * s, y0: y - 5, y1: y + 33 * s }];
      case 'house': return [{ t: 'box', x, y: y + 6.5 * s, z, hx: 4 * s, hy: 7 * s, hz: 4 * s }];
      case 'chimney': return [{ t: 'cyl', x, z, r: 3.8 * s, y0: y - 5, y1: y + 28 * s }];
      case 'pipeArch': return [{ t: 'box', x, y, z, hx: 26 * s, hy: 1.8 * s, hz: 1.8 * s }, { t: 'cyl', x: x - 26 * s, z, r: 2.5 * s, y0: y - 40, y1: y }, { t: 'cyl', x: x + 26 * s, z, r: 2.5 * s, y0: y - 40, y1: y }];
      case 'monolith': return [{ t: 'box', x, y: y + 12 * s, z, hx: 2.6 * s, hy: 12 * s, hz: 1.4 * s }];
      case 'station': return [{ t: 'box', x, y, z, hx: 10 * s, hy: 4.2 * s, hz: 4.2 * s }];
      case 'panel': return [{ t: 'box', x, y, z, hx: 16 * s, hy: 0.6 * s, hz: 7 * s }];
      default: return [];
    }
  }
  draw(r) {
    const m = _M;
    m4euler(m, this.x, this.y, this.z, this.yaw + (this.o.spin ? this.t * this.o.spin : 0), 0, this.o.roll || 0, this.scale);
    r.draw(this.mesh, m, { tex: this.tex, texMix: 0.7, uvScale: [1, 1], chrome: this.kind === 'gate' ? 0.5 : 0 });
    if (this.kind === 'gate') {
      const pulse = 1 - Music.beatPhase();
      r.sprite(this.x, this.y, this.z, 20 * this.scale, 20 * this.scale, this.t, SPR.RING, 0.3 * pulse, 0.8 * pulse, 1 * pulse, 0.5);
    }
    if (this.kind === 'lighthouse') {
      const a = this.t * 2;
      r.sprite(this.x + Math.cos(a) * 4, this.y + 28.5 * this.scale, this.z + Math.sin(a) * 4, 7, 7, 0, SPR.GLOW, 1, 0.9, 0.5, 0.9);
    }
    if (this.kind === 'chimney') {
      if (Math.random() < 0.3) FX.spawn(this.x + rr(-2, 2), this.y + 28 * this.scale, this.z + rr(-2, 2), rr(-1, 1), rr(8, 14), 0, 2.5, 4, 12, 0.2, 0.15, 0.14, 0.6, SPR.SMOKE, false, 0.3);
    }
  }
}

// ---------------------------------------------------------------------------
// Pickups (rail space)
// ---------------------------------------------------------------------------
class Pickup {
  constructor(kind, d, x, y) { this.kind = kind; this.d = d; this.x = x; this.y = y; this.t = rand() * 10; this.gone = false; this.taken = false; }
  update(dt) {
    const G = Game, P = G.player;
    this.t += dt;
    if (this.d < P.d - 20) this.gone = true;
    if (!P.alive || this.taken) return;
    const isRing = this.kind === 'ring' || this.kind === 'gold';
    const dd = this.d - P.d, dx = this.x - P.x, dy = this.y - P.y;
    if (isRing) {
      if (Math.abs(dd) < 2.2 && Math.hypot(dx, dy) < 3.2) this.take();
    } else if (dd * dd + dx * dx + dy * dy < 12) this.take();
    // magnet for non-ring items when close
    if (!isRing && Math.abs(dd) < 25 && Math.hypot(dx, dy) < 10) { this.x = damp(this.x, P.x, 3, dt); this.y = damp(this.y, P.y, 3, dt); }
  }
  take() {
    const G = Game, P = G.player;
    this.taken = true; this.gone = true;
    G.rail.world(_p, this.d, this.x, this.y);
    const wv = G.entityWorldVel(P);
    switch (this.kind) {
      case 'ring': P.heal(25); SFX.ring(false); FX.ringBurst(_p.x, _p.y, _p.z, [0.8, 0.9, 1], wv.x, wv.y, wv.z); G.addScore(100, this); break;
      case 'gold': P.heal(50); P.golds++; if (P.golds % 3 === 0) { P.maxShield += 25; P.shield = P.maxShield; G.banner('SHIELD UP!', '#ffe14a'); } SFX.ring(true); FX.ringBurst(_p.x, _p.y, _p.z, [1, 0.85, 0.3], wv.x, wv.y, wv.z); G.addScore(500, this); break;
      case 'bomb': P.bombs = Math.min(9, P.bombs + 1); SFX.pickup(); G.banner('+1 NOVA BOMB', '#ff7a7a'); break;
      case 'laser': P.laserLv = Math.min(3, P.laserLv + 1); SFX.pickup(); G.banner(P.laserLv >= 3 ? 'HYPER LASER!' : 'TWIN LASER!', '#6dff8a'); G.sayOnce('laser' + P.laserLv); break;
      case 'fork': G.onFork(); SFX.ring(true); FX.ringBurst(_p.x, _p.y, _p.z, [1, 0.9, 0.3], wv.x, wv.y, wv.z); break;
    }
    Haptics.tap(0.6);
  }
  draw(r) {
    const s = this.kind === 'fork' ? 1.3 : 1;
    const mesh = this.kind === 'gold' || this.kind === 'ring' ? MODELS.ring : this.kind === 'bomb' ? MODELS.bomb : this.kind === 'laser' ? MODELS.laserUp : MODELS.fork;
    const tint = this.kind === 'gold' ? [1.2, 0.9, 0.3, 1] : this.kind === 'ring' ? [0.95, 1, 1.1, 1] : [1, 1, 1, 1];
    const spinY = this.kind === 'ring' || this.kind === 'gold' ? Math.sin(this.t * 1.5) * 0.4 : this.t * 2;
    drawAt(r, mesh, this.d, this.x, this.y, spinY, 0, 0, s, { tint, chrome: 0.7, emis: this.kind === 'fork' ? [0.3, 0.25, 0.05] : null });
    Game.rail.world(_p, this.d, this.x, this.y);
    const b = 1 - Music.beatPhase();
    if (this.kind !== 'ring' && this.kind !== 'gold') r.sprite(_p.x, _p.y, _p.z, 4 + b, 4 + b, this.t, SPR.SPARKLE, 1, 0.9, 0.6, 0.7);
  }
}

// ---------------------------------------------------------------------------
// Wingmen
// ---------------------------------------------------------------------------
const WING_SLOTS = { oz: [-7, 1.5], sable: [7, 1.5], tobi: [0, 5] };
class Wingman {
  constructor(who) {
    this.who = who; this.mesh = MODELS[who];
    this.hp = 100; this.state = 'formation';
    this.d = 0; this.x = WING_SLOTS[who][0]; this.y = WING_SLOTS[who][1];
    this.roll = 0; this.t = 0; this.troubleT = 0; this.chaser = null; this.stateT = 0;
    this.vis = true;
  }
  update(dt) {
    const G = Game, P = G.player;
    this.t += dt; this.stateT += dt;
    const [sx, sy] = WING_SLOTS[this.who];
    if (this.state === 'formation') {
      this.vis = true;
      const tx = P.x * 0.5 + sx, ty = P.y * 0.5 + sy;
      this.d = damp(this.d || P.d - 2, P.d - 2 + Math.sin(this.t * 0.7 + sx) * 1.5, 3, dt);
      const px = this.x;
      this.x = damp(this.x, tx, 2, dt); this.y = damp(this.y, ty, 2, dt);
      this.roll = damp(this.roll, -(this.x - px) / dt * 0.03, 5, dt);
    } else if (this.state === 'leave') {
      this.d += dt * (20 + this.stateT * 80); this.y += dt * 10 * this.stateT; this.x += Math.sign(sx || 1) * dt * 12;
      this.roll = damp(this.roll, Math.sign(sx || 1) * -0.8, 3, dt);
      if (this.stateT > 2.5) { this.state = 'away'; this.vis = false; }
    } else if (this.state === 'join') {
      const k = Math.min(1, this.stateT / 2);
      this.d = P.d + lerp(-30, -2, easeOutCubic(k)); this.x = lerp(sx * 3, P.x * 0.5 + sx, k); this.y = lerp(sy + 10, P.y * 0.5 + sy, k);
      this.vis = true;
      if (k >= 1) { this.state = 'formation'; }
    } else if (this.state === 'trouble') {
      this.vis = true;
      this.troubleT += dt;
      const k = Math.min(1, this.stateT / 1.5);
      this.d = P.d + lerp(-20, 42, easeOutCubic(k));
      this.x = Math.sin(this.t * 1.3) * 10; this.y = 2 + Math.sin(this.t * 0.9) * 5;
      this.roll = -Math.cos(this.t * 1.3) * 0.9;
      if (this.chaser && this.chaser.dead) { this.rescued(); }
      else if (this.troubleT > 13) this.failed();
      else if (this.troubleT > 5 && G.onBar) { FX.hitSpark(...this.wpos(), 0, 0, -G.speed, [1, 0.6, 0.3]); }
    } else if (this.state === 'thanks') {
      this.d = P.d + 42 + this.stateT * 20; this.x = damp(this.x, 0, 1, dt); this.y += dt * 4;
      this.roll = damp(this.roll, Math.sin(this.stateT * 6) * 1.5, 4, dt);
      if (this.stateT > 2.5) { this.state = 'away'; this.vis = false; }
    } else { this.vis = false; this.d = P.d - 40; }
  }
  wpos() { Game.rail.world(_p, this.d, this.x, this.y); return [_p.x, _p.y, _p.z]; }
  setState(s) { this.state = s; this.stateT = 0; }
  trouble() {
    const G = Game;
    if (this.hp <= 0) return false;
    this.setState('trouble'); this.troubleT = 0;
    this.chaser = G.spawnEnemy('chaser', 'chaser', { wing: this, off: -30, x: 0, y: 0 });
    this.chaser.score = 500;
    return true;
  }
  rescued() {
    const G = Game;
    this.setState('thanks');
    G.say(this.who, WING_LINES[this.who].thanks);
    G.spawnPickup(this.who === 'tobi' ? 'bomb' : this.who === 'oz' ? 'gold' : 'ring', G.player.d + 60, this.x, this.y);
    G.stats.rescues++;
  }
  failed() {
    const G = Game;
    this.hp -= 50; this.setState('leave');
    if (this.chaser) { this.chaser.o.wing = null; }
    G.say(this.who, this.hp > 0 ? WING_LINES[this.who].hit : WING_LINES[this.who].down);
  }
  draw(r) {
    if (!this.vis) return;
    drawAt(r, this.mesh, this.d, this.x, this.y, 0, 0, this.roll, 1, { chrome: 0.3 });
    const [x, y, z] = this.wpos();
    railFrame(Game.rail, this.d, _t, _R, _U);
    r.sprite(x - _t.x * 1.6, y - _t.y * 1.6, z - _t.z * 1.6, 1.3, 1.3, 0, SPR.GLOW, 0.4, 0.9, 1, 0.8);
  }
}
const WING_LINES = {
  oz: { thanks: "Much obliged, Lead! These old fins still have some song left in 'em.", hit: "Blast! My tail's hit — I'm heading back to the Cadence!", down: "I'm out of the fight, kid. Give 'em a verse for me!" },
  sable: { thanks: "I had him the whole time. ...Thanks, though.", hit: "Tch — took a hit. Falling back to repair!", down: "Sable's grounded. Don't you dare lose, Lead." },
  tobi: { thanks: "W-wow! You saved me! I owe you a nova bomb — here!", hit: "Eek! My engine's sputtering! Going back to fix it!", down: "Tobi's out... I'll keep the comms running from the ship!" },
};
