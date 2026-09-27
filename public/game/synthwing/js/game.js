'use strict';
// =============================================================================
// SYNTHWING 64 — game.js
// Scene flow (boot → logo → title → briefing → stage → results → … → ending),
// the per-frame world update, collisions, scoring, Resonance, camera
// direction, dialogue and saving.
// =============================================================================

const DIFFS = [
  { name: 'CADET', dmg: 0.55, fire: 0.6, bullet: 0.8, hp: 0.8, dodge: 0.15 },
  { name: 'PILOT', dmg: 1, fire: 1, bullet: 1, hp: 1, dodge: 0.3 },
  { name: 'ACE', dmg: 1.45, fire: 1.45, bullet: 1.2, hp: 1.3, dodge: 0.55 },
];
// res: internal vertical resolution (0 = native display resolution).
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = { v: SETTINGS_VERSION, steer: 'stick', sens: 3, invertY: false, lefty: false, diff: 1, res: 0, crt: false, dither: true, shake: true, flash: true, music: 8, sfx: 9, voice: 8, haptics: 2, fps: false };
const SAVE_KEY = 'synthwing64.save.v1';
// Awards. Game Center achievement IDs are GC_PREFIX + id (see native.js).
const AWARDS = [
  { id: 'first_flight', name: 'FIRST FLIGHT', desc: 'Clear Corona Shores.' },
  { id: 'finale', name: 'STANDING OVATION', desc: 'Finish the campaign.' },
  { id: 'virtuoso', name: 'VIRTUOSO', desc: 'Clear a stage on ACE difficulty.' },
  { id: 'flawless', name: 'FLAWLESS', desc: 'Clear a stage without taking a hit.' },
  { id: 'medal', name: 'GOLD STANDARD', desc: 'Earn a stage medal.' },
  { id: 'all_medals', name: 'HALL OF FAME', desc: 'Earn all five stage medals.' },
  { id: 'fork', name: 'PERFECT PITCH', desc: 'Find a golden tuning fork.' },
  { id: 'all_forks', name: 'IN TUNE', desc: 'Find all five tuning forks.' },
  { id: 'rescue', name: 'WINGMATE', desc: 'Rescue a wingman in trouble.' },
  { id: 'squad', name: 'NO ONE LEFT BEHIND', desc: 'Clear a stage with all wingmen.' },
  { id: 'chain', name: 'PERFECT CHORD', desc: 'Destroy 8 targets in one volley.' },
  { id: 'resonance', name: 'FULL ORCHESTRA', desc: 'Reach Resonance MAX.' },
  { id: 'nova', name: 'SUPERNOVA', desc: 'Take out 10 foes with one Nova Bomb.' },
  { id: 'deflect', name: 'RETURN TO SENDER', desc: 'Deflect 25 shots with barrel rolls.' },
  { id: 'fortissimo', name: 'WRECKING BALL', desc: 'Ram 10 enemies in one Fortissimo.' },
  { id: 'full_kit', name: 'FULL KIT', desc: 'Collect every kind of power-up.' },
  { id: 'test_pilot', name: 'TEST PILOT', desc: 'Clear stages in 3 different ships.' },
  { id: 'kills', name: 'SOLD-OUT SHOW', desc: 'Destroy 2,000 enemies.' },
  { id: 'score', name: 'CHART TOPPER', desc: 'Score 500,000 points in one run.' },
  { id: 'maestro', name: 'MAESTRO', desc: 'Take the Maestro into battle.' },
];

const Game = {
  renderer: null, cam: new Camera(), frustum: new Frustum(),
  state: 'boot', stateT: 0, overlay: null, overlayT: 0,
  save: null, settings: null,
  time: 0, realTime: 0, timers: [],
  // dynamic resolution (native mode only): fraction of the display resolution
  quality: 1, perfT: 0, perfN: 0, perfSlow: 0, perfGood: 0,
  // world
  stage: null, stageIdx: 0, env: null, rail: null, terrain: null, speed: 58, railD: 0, stageTime: 0, bar: 0, barDur: 2,
  player: null, enemies: [], pbullets: [], homing: [], ebullets: [], pickups: [], props: [], wingmen: [], boss: null, bomb: null,
  scriptIdx: 0, phase: 'intro', phaseT: 0, checkpointHit: false,
  score: 0, stageStartScore: 0, stats: null, res: { level: 0, meter: 0, idle: 0 },
  diff: DIFFS[1], volleyId: 0,
  // feel
  trauma: 0, flashA: 0, flashCol: [1, 1, 1], aberration: 0, hitstopT: 0, slowmoT: 0, saturation: 1, glitch: 0,
  fovKick: 0, shocks: [], hotTarget: null,
  // beat flags (set each frame from the sequencer)
  onBeat: false, on8th: false, onBar: false, stepCrossed: false, beatIndex: 0, barIndex: 0, stepIndex: 0,
  // dialogue
  dialog: { queue: [], cur: null, last: null, clock: 0, lastEnd: -9, gap: 0, lastWho: '' }, ann: null, announced: false, said: new Set(), banners: [], warnT: 0, bossCard: 0,
  reticle: { nx: 0.5, ny: 0.5, ok: false },
  restore: 0, silence: false,

  // ---------------------------------------------------------------------------
  init(canvas) {
    this.renderer = new Renderer(canvas);
    this.renderer.env = TEX.env; this.renderer.atlas = TEX.atlas;
    this.loadSave();
    this.applySettings();
    this.player = new Player();
    this.setState('boot');
  },
  // Saves come from storage we don't control (old versions, other tabs, hand
  // edits), so every field is type-checked and clamped before the game sees it.
  loadSave() {
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const int = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? clamp(Math.round(v), lo, hi) : d);
    const scores = (o) => { const r = {}; for (const k in obj(o)) { const v = o[k]; if (typeof v === 'number' && isFinite(v) && v >= 0) r[k] = Math.round(v); } return r; };
    const flags = (o) => { const r = {}; for (const k in obj(o)) if (o[k]) r[k] = true; return r; };
    const s = obj(Store.get(SAVE_KEY, null));
    this.save = {
      unlocked: int(s.unlocked, 1, 5, 1), best: scores(s.best), medals: flags(s.medals), forks: flags(s.forks), awards: flags(s.awards),
      cleared: !!s.cleared, hiscore: int(s.hiscore, 0, 1e10, 0), gold: !!s.gold, plays: int(s.plays, 0, 1e9, 0),
      vehicle: typeof s.vehicle === 'string' ? s.vehicle : 'synthwing', tally: scores(s.tally),
    };
    let saved = s.settings && typeof s.settings === 'object' ? Object.assign({}, s.settings) : null;
    if (!saved) {
      saved = {};
      // first launch: honour the system "reduce motion" preference
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { saved.shake = false; saved.flash = false; }
    } else if ((saved.v || 1) < SETTINGS_VERSION) {
      // v2 made native HD (without scanlines) the default look
      saved.res = 0; saved.crt = false;
    }
    const S = this.settings = Object.assign({}, DEFAULT_SETTINGS, saved, { v: SETTINGS_VERSION });
    const oneOf = (v, list, d) => (list.includes(v) ? v : d);
    S.steer = oneOf(S.steer, ['stick', 'pad'], 'stick');
    S.res = oneOf(S.res, [0, 480, 360, 240], 0);
    S.sens = int(S.sens, 1, 5, 3); S.diff = int(S.diff, 0, DIFFS.length - 1, 1);
    S.music = int(S.music, 0, 10, 8); S.sfx = int(S.sfx, 0, 10, 9); S.voice = int(S.voice, 0, 10, 8);
    S.haptics = typeof S.haptics === 'boolean' ? (S.haptics ? 2 : 0) : int(S.haptics, 0, 2, 2); // was ON/OFF
    for (const k of ['invertY', 'lefty', 'crt', 'dither', 'shake', 'flash', 'fps']) S[k] = !!S[k];
  },
  // Last resort when a screen keeps throwing: drop back to a clean title screen.
  recover() {
    this.overlay = null; HUD.sub = null; Input.releaseAll();
    this.timers.length = 0; this.ann = null;
    AudioSys.resume(); AudioSys.setSilence(0, 0.05); AudioSys.setDuck(0);
    this.setState('title');
  },
  writeSave() { if (this.demo) return; this.save.settings = this.settings; Store.set(SAVE_KEY, this.save); },
  award(id) {
    const s = this.save, a = AWARDS.find((x) => x.id === id);
    if (!a || s.awards[id] || this.demo) return;
    s.awards[id] = true;
    this.writeSave();
    HUD.toast(a);
    SFX.ring(true);
    Native.achieve(id);
  },
  // Lifetime counters (saved with the next writeSave).
  tally(key, n = 1) { if (this.demo) return 0; const t = this.save.tally; t[key] = (t[key] || 0) + n; return t[key]; },

  // ---- attract demo ------------------------------------------------------------
  // Like an arcade cabinet: left alone on the title screen, the game plays
  // itself (random stage and ship, autopilot, can't die). Any touch or key
  // returns to the title. Nothing is saved or awarded. The iOS app starts it
  // straight away when launched with SYNTHWING_DEMO=1 (used by CI).
  startDemo() {
    this.demo = true; this.demoT = 0;
    this.demoVehicle = pick(VEHICLES.filter(vehicleUnlocked)).id;
    this.score = 0; this.player.reset(true); this.said.clear();
    this.stageIdx = Math.floor(Math.random() * this.save.unlocked);
    this.setState('play');
    console.log('[synthwing] demo: stage ' + (this.stageIdx + 1) + ', ' + this.demoVehicle);
  },
  endDemo() {
    this.demo = false; this.demoVehicle = null;
    this.player.reset(true);
    this.setState('title');
  },
  // Returns true when the demo just ended (the caller stops updating play).
  demoPilot(dt) {
    const P = this.player;
    this.demoT += dt;
    if (Input.anyPress || this.demoT > 75) { this.endDemo(); return true; }
    P.invuln = Math.max(P.invuln, 1);
    if (!P.alive || !P.control) return false;
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const off = e.d - P.d;
      if (off < 12 || off > 220) continue;
      const d = Math.hypot(e.x - P.x, e.y - P.y) + off * 0.05;
      if (d < bd) { bd = d; best = e; }
    }
    if (this.boss && !this.boss.dead && !this.boss.entering) for (const p of this.boss.parts) {
      if (!p.alive || !p.weak || p.invuln) continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < bd + 20) { bd = d; best = p; }
    }
    let mx = 0, my = Math.sin(this.demoT * 0.7) * 0.2;
    if (best) { mx = clamp((best.x - P.x) / 5, -1, 1); my = clamp((best.y - P.y) / 5, -1, 1); }
    Input.move.x = mx; Input.move.y = my;
    if (this.demoT % 1.6 < 1.3) { if (!Input.fire) Input.firePressed = true; Input.fire = true; } else if (Input.fire) { Input.fire = false; Input.fireReleased = true; }
    if (Math.random() < dt * 0.25) Input.rollPressed = true;
    if (Math.random() < dt * 0.03) Input.bombPressed = true;
    return false;
  },
  applySettings() {
    const s = this.settings;
    Input.settings.steer = s.steer; Input.settings.sens = s.sens; Input.settings.invertY = s.invertY;
    AudioSys.musicVol = s.music / 10; AudioSys.sfxVol = s.sfx / 10;
    AudioSys.voiceVol = s.voice / 10; AudioSys.applyVolumes();
    Haptics.level = s.haptics;
    this.renderer.dither = s.dither ? 1 : 0;
    this.diff = DIFFS[s.diff];
  },

  setState(s) {
    this.state = s; this.stateT = 0;
    // don't let the tap that changed screens also press a button on the next one
    Input.clicks.length = 0; Input.nav.ok = false; Input.firePressed = false;
    HUD.focus = 0;
    this.dialog.queue.length = 0; this.dialog.cur = null; this.dialog.last = null; this.dialog.lastWho = '';
    this.ann = null; AudioSys.setDuck(0);
    const fn = this['enter_' + s]; if (fn) fn.call(this);
  },

  // ---------------------------------------------------------------------------
  // World setup
  // ---------------------------------------------------------------------------
  setupWorld(envName, railX, railY, speed) {
    if (this.terrain) this.terrain.dispose(this.renderer);
    this.env = ENVS[envName];
    this.rail = new Rail(railX, railY);
    this.terrain = new Terrain(this.env, this.rail, 7);
    this.speed = speed;
    this.enemies.length = 0; this.pbullets.length = 0; this.homing.length = 0; this.ebullets.length = 0;
    this.pickups.length = 0; this.props.length = 0; this.boss = null; this.bomb = null;
    FX.clear(); FX.setWeather(this.env.particles); this.shocks.length = 0; this.fovKick = 0; this.timers.length = 0;
    this.saturation = 1; this.glitch = 0; this.silence = false; AudioSys.setSilence(0, 0.05);
  },
  terrainHeight(wx, wz) { return this.terrain ? this.terrain.height(wx, wz) : -9999; },
  // Highest surface at a world point and what it is made of (for debris & wrecks).
  groundInfo(wx, wz) {
    const t = this.terrainHeight(wx, wz), w = this.env && this.env.water;
    if (w && w.level >= t) return { h: w.level, kind: w.emissive ? 'lava' : w.tex === 'ice' ? 'ice' : 'water' };
    return { h: t, kind: this.env && this.env.name === 'frost' ? 'ice' : 'ground' };
  },
  // Screen-space refraction ring from a world position (post-process).
  shockwave(wx, wy, wz, str = 1) {
    if (this.shocks.length >= 3) this.shocks.shift();
    this.shocks.push({ x: wx, y: wy, z: wz, t: 0, max: 0.6, str: this.settings.flash ? str : str * 0.4 });
  },
  // Run fn after `sec` seconds of game time (stops while paused; cleared on scene change).
  later(sec, fn) { this.timers.push({ t: sec, fn }); },
  updateTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
  },
  entityWorldVel(e) { return { x: e.wvx || 0, y: e.wvy || 0, z: e.wvz !== undefined ? e.wvz : -this.speed }; },

  startStage(idx, fromCheckpoint) {
    const st = STAGES[idx];
    this.stage = st; this.stageIdx = idx;
    this.setupWorld(st.env, st.railX, st.railY, st.speed);
    const P = this.player;
    if (!fromCheckpoint) {
      this.stats = { kills: 0, rescues: 0, rings: 0, fork: false, shots: 0, time: 0, deaths: 0 };
      this.stageStartScore = this.score;
      this.checkpointHit = false;
      this.wingmen = ['oz', 'sable', 'tobi'].map((w) => { const prev = this.wingmen && this.wingmen.find((m) => m.who === w); const m = new Wingman(w); if (prev) m.hp = Math.max(prev.hp, 50); return m; });
    }
    this.barDur = (60 / SONGS[st.song].bpm) * 4;
    const startBar = fromCheckpoint && this.checkpointHit ? st.checkpointBar : 0;
    this.stageTime = startBar * this.barDur; this.bar = startBar;
    this.railD = 400 + this.stageTime * this.speed;
    this.scriptIdx = st.script.findIndex((e) => e[0] >= startBar);
    if (this.scriptIdx < 0) this.scriptIdx = st.script.length;
    P.reset(false); P.d = this.railD + PLAYER_AHEAD; P.control = false; P.invuln = 3;
    for (const w of this.wingmen) { w.setState(w.hp > 0 && startBar === 0 ? 'formation' : 'away'); w.d = P.d - 2; w.x = WING_SLOTS[w.who][0]; w.y = WING_SLOTS[w.who][1]; }
    this.res = { level: 0, meter: 0, idle: 0 };
    this.restore = st.restore ? (startBar ? 0.4 : 0) : 1;
    this.dialog.queue.length = 0; this.dialog.cur = null; this.banners.length = 0;
    this.phase = 'intro'; this.phaseT = 0; this.warnT = 0; this.bossCard = 0;
    this.slowmoT = 0; this.hitstopT = 0;
    this.terrain.prewarm(this.railD, 560, this.renderer);
    Music.play(SONGS[st.song], { layer: 1 });
    this.updateCamera(0, true);
  },

  // ---------------------------------------------------------------------------
  // Spawning API used by stage scripts & AI
  // ---------------------------------------------------------------------------
  spawnEnemy(type, ai, o = {}) {
    const P = this.player;
    const e = new Enemy(type, ai, o);
    const off = o.off !== undefined ? o.off : 170;
    e.off = off;
    e.d = P.d + off; e.x = o.x || 0; e.y = o.y || 0;
    if (ai === 'behind') e.d = P.d - 24;
    this.rail.world(_p, e.d, e.x, e.y); e.wx = _p.x; e.wy = _p.y; e.wz = _p.z;
    this.enemies.push(e);
    return e;
  },
  groundY(d, x) {
    const wx = this.rail.x(d) + x, wz = -d;
    let h = this.terrainHeight(wx, wz);
    if (this.env.water) h = Math.max(h, this.env.water.level);
    if (h < -900) h = this.rail.y(d) - 14;
    return h;
  },
  spawnGround(type, off, x) {
    const d = this.player.d + off;
    const gy = this.groundY(d, x);
    const e = this.spawnEnemy(type, type === 'turret' ? 'turret' : 'ground', { off, x, y: gy - this.rail.y(d) + (type === 'pylon' ? -2 : 0) });
    e.yaw = PI;
    return e;
  },
  spawnProp(kind, off, x, y, o = {}) {
    const d = this.player.d + off;
    const wx = this.rail.x(d) + x;
    let wy;
    if (y === 'water') wy = this.env.water ? this.env.water.level : this.rail.y(d) - 14;
    else if (y === 'ground') wy = this.groundY(d, x);
    else if (typeof y === 'string' && y.startsWith('rail')) wy = this.rail.y(d) + (parseFloat(y.slice(4)) || 0);
    else wy = y;
    const p = new Prop(kind, wx, wy, -d, o);
    this.props.push(p);
    return p;
  },
  spawnPickup(kind, d, x, y) { const p = new Pickup(kind, d, x, y); this.pickups.push(p); return p; },
  wing(who) { return this.wingmen.find((w) => w.who === who); },

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------
  // In flight, lines arrive over a thin comm channel: quicker, sparser chatter,
  // a squelch at each end, and stale chatter is dropped once its moment passes.
  // Everywhere else (briefings) the speaker owns the scene: full voice, music ducks.
  say(who, text, prio) {
    const D = this.dialog, radio = this.state === 'play', cps = radio ? 46 : 36;
    const m = { who, text, prio: !!prio, radio, cps, q: D.clock, t0: 0, t: 0, shown: 0, hold: 0, sylN: 0, sylT: -1,
      dur: text.length / cps + (radio ? 1.25 + text.length / 55 : 1.6 + text.length / 50) };
    if (prio) { D.queue.unshift(m); if (D.cur && D.cur.t > 0.6) this.endMessage(true); }
    else if (D.queue.length < (radio ? 3 : 6)) D.queue.push(m);
  },
  sayOnce(key) {
    if (this.said.has(key)) return;
    this.said.add(key);
    const L = { lowShield: ['oz', 'Your shield is low, Lead! Fly through a ring to patch it up!'], laser2: ['tobi', 'Twin lasers online! Double the song!'], laser3: ['tobi', 'HYPER LASERS! Those hit twice as hard!'] };
    const l = L[key] || (key.startsWith('pu_') && POWERS[key.slice(3)] && POWERS[key.slice(3)].line);
    if (l) this.say(l[0], l[1]);
  },
  // Weighted pick, skipping anything already running (and extra ships when you have plenty).
  randomPower() {
    const P = this.player;
    const opts = POWER_WEIGHTS.filter(([k]) => !(P.pow[k] > 3) && !(k === 'encore' && P.lives >= 5));
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
    for (const [k, w] of opts) if ((r -= w) <= 0) return k;
    return 'chord';
  },
  spawnPod(x, y, kind, o = {}) { return this.spawnEnemy('prism', 'prism', Object.assign({ x, y, off: 230, hold: 7, kind: kind || this.randomPower() }, o)); },
  banner(text, col = '#ffffff', big = false) { this.banners.push({ text, col, t: 0, big }); if (this.banners.length > 3) this.banners.shift(); },
  warning() { this.warnT = 3.2; SFX.alarm(); this.shake(0.2); Haptics.impact('warn'); },
  updateDialog(dt) {
    const D = this.dialog;
    D.clock += dt;
    if (D.gap > 0) D.gap -= dt;
    while (!D.cur && D.gap <= 0 && D.queue.length) {
      const m = D.queue.shift();
      if (m.radio && !m.prio && D.clock - m.q > 4.5) continue;
      m.t0 = D.clock;
      if (m.radio) { SFX.commOpen(); m.hold = 0.14; } // let the chirp land before the words
      else if (D.lastWho !== m.who) SFX.commChime();
      m.cont = D.clock - D.lastEnd < 0.5; // follows straight on from the previous line
      D.lastWho = m.who; D.cur = m;
    }
    const c = D.cur;
    if (c) {
      c.t += dt;
      if (c.hold > 0) c.hold -= dt;
      else if (c.shown < c.text.length) {
        const before = Math.floor(c.shown);
        c.shown = Math.min(c.text.length, c.shown + dt * c.cps);
        const after = Math.floor(c.shown);
        let voiced = 0; // on a long frame, voice at most two syllables rather than a burst
        for (let i = before; i < after; i++) {
          if (voiced < 2 && this.speak(c, i)) voiced++;
          const p = PAUSES[c.text[i]];
          if (p && i < c.text.length - 1 && c.text[i + 1] !== c.text[i] && !/[0-9]/.test(c.text[i + 1])) { c.shown = i + 1; c.hold = p * (c.radio ? 0.6 : 1); c.dur += c.hold; break; }
        }
      }
      if (c.t > c.dur) this.endMessage(false);
    }
    for (let i = this.banners.length - 1; i >= 0; i--) { this.banners[i].t += dt; if (this.banners[i].t > 1.8) this.banners.splice(i, 1); }
  },
  endMessage(cut) {
    const D = this.dialog, c = D.cur;
    if (!c) return;
    if (c.radio && !cut) SFX.commClose();
    D.last = c; D.lastEnd = D.clock; D.cur = null;
    D.gap = c.radio ? 0.35 : 0.12;
  },
  skipTyping() { const c = this.dialog.cur; if (c) { c.shown = c.text.length; c.hold = 0; } },
  // One revealed character of a line: voice it if it starts a syllable.
  speak(c, i) {
    const s = c.text, v = syllableAt(s, i);
    if (!v) return false;
    c.sylT = c.t; // mouth sync
    c.sylN++;
    if (c.radio && c.sylN % 2 === 0) return false; // radio chatter is sparser
    // intonation: fall across each sentence, rise into a question, lift on '!', stress ALL-CAPS words
    let a = i, b = i;
    while (a > 0 && !'.!?'.includes(s[a - 1])) a--;
    while (b < s.length - 1 && !'.!?'.includes(s[b])) b++;
    let pk = 1.07 - 0.14 * ((i - a) / Math.max(1, b - a)), loud = 1;
    if (s[b] === '?' && b - i < 8) pk *= 1.12 + (8 - (b - i)) * 0.03;
    if (s[b] === '!') { loud *= 1.15; pk *= 1.05; }
    let w0 = i, w1 = i;
    while (w0 > 0 && /[a-z']/i.test(s[w0 - 1])) w0--;
    while (w1 < s.length && /[a-z']/i.test(s[w1])) w1++;
    const word = s.slice(w0, w1);
    if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) { loud *= 1.25; pk *= 1.08; }
    const prev = (s[i - 1] || '').toLowerCase();
    SFX.syllable(c.who, v, /[a-z]/.test(prev) ? prev : '', pk, loud * (c.radio ? 0.85 : 1), c.radio);
    return true;
  },
  // The announcer: a big, slow, reverberant voice for title cards.
  announce(text, delay = 0) {
    const s = text.toLowerCase(), syl = [];
    let at = delay;
    for (let i = 0; i < s.length; i++) {
      if ('.,!?'.includes(s[i])) { at += 0.16; continue; }
      if (s[i] === ' ') { at += 0.03; continue; }
      const v = syllableAt(s, i);
      if (!v) continue;
      const prev = s[i - 1] || '';
      syl.push({ at, v, c: /[a-z]/.test(prev) ? prev : '' });
      at += 0.15;
    }
    syl.forEach((q, k) => { q.pk = 1.1 - 0.2 * (k / Math.max(1, syl.length - 1)); q.loud = k === 0 ? 1.25 : 1.05; });
    this.ann = { syl, t: 0, k: 0 };
  },
  updateAnnounce(dt) {
    const A = this.ann;
    if (!A) return;
    A.t += dt;
    while (A.k < A.syl.length && A.syl[A.k].at <= A.t) { const q = A.syl[A.k++]; SFX.syllable('announcer', q.v, q.c, q.pk, q.loud, false); }
    if (A.k >= A.syl.length) this.ann = null;
  },
  // Music steps back for whoever holds the scene; the radio barely nudges it.
  updateDuck() {
    const c = this.dialog.cur;
    AudioSys.setDuck(this.ann ? 0.4 : c ? (c.radio ? 0.08 : 0.3) : 0);
  },

  // ---------------------------------------------------------------------------
  // Feel
  // ---------------------------------------------------------------------------
  shake(a) { if (this.settings.shake) this.trauma = Math.min(1, this.trauma + a); },
  flash(col, a) { this.flashCol = col; this.flashA = Math.max(this.flashA, this.settings.flash ? a : a * 0.3); },
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); },

  // ---------------------------------------------------------------------------
  // Scoring & Resonance
  // ---------------------------------------------------------------------------
  mult() { return 1 + this.res.level; },
  addScore(base, at) {
    const pts = Math.round(base * this.mult());
    this.score += pts;
    return pts;
  },
  resonanceGain(v = 1) {
    const R = this.res;
    R.idle = 0;
    if (R.level >= 4) { R.meter = 1; return; }
    R.meter += 0.3 * v / (1 + R.level * 0.45);
    if (R.meter >= 1) {
      R.level++; R.meter = R.level >= 4 ? 1 : 0.05;
      if (R.level >= 4) { this.banner('RESONANCE MAX!', 'rainbow'); SFX.ring(true); this.flash([1, 1, 1], 0.15); this.award('resonance'); }
    }
    this.syncLayers();
  },
  resonanceHit() {
    const R = this.res;
    if (R.level > 0) R.level--;
    R.meter = 0;
    this.syncLayers();
  },
  syncLayers() {
    if (this.state !== 'play') return;
    let lv = 1 + this.res.level;
    if (this.stage && this.stage.restore && !this.boss) lv = Math.min(lv, 1 + Math.floor(this.restore * 4.99));
    if (this.player.pow.fortissimo > 0) lv = 5; // fortissimo plays the full arrangement
    Music.setLayer(lv);
  },
  onKill(e, src) {
    const G = this;
    this.stats.kills++;
    const pts = this.addScore(e.score, e);
    this.resonanceGain((e.T.res || 1) * this.player.V.res);
    if (this.stage && this.stage.restore) this.restore = Math.min(1, this.restore + 0.012 * (e.T.res || 1));
    // musical note in key, rising with the volley chain
    let noteK = e.T.big ? 0 : ri(0, 4);
    if (src && src.volley) { src.volley.kills++; noteK = src.volley.kills - 1; }
    SFX.note(noteK);
    FX.text(e.wx, e.wy + 2, e.wz, '+' + pts, e.T.big ? '#ffe14a' : '#ffffff', e.T.big);
    if (this.tally('kills') >= 2000) this.award('kills');
    if (src && src.volley && src.volley.kills >= 2 && src.volley.kills === src.volley.n) {
      const v = src.volley.kills, bonus = this.addScore(v * v * 40);
      if (v >= 8) this.award('chain');
      FX.text(e.wx, e.wy + 5, e.wz, 'CHAIN ×' + v + '  +' + bonus, '#ff9ad0', true);
      if (v >= 6) this.banner('PERFECT CHAIN ×' + v, 'rainbow');
    }
    // big enemies drop something; pods release the power-up they carry
    if (e.T.big && e.type !== 'bigrock') { const r = Math.random(); G.spawnPickup(r < 0.35 ? 'ring' : r < 0.6 ? 'bomb' : this.randomPower(), e.d, e.x, e.y); }
    if (e.type === 'prism') { G.spawnPickup(e.o.kind, e.d, e.x, e.y); SFX.ring(false); }
    Haptics.impact(e.T.big ? 'bigkill' : 'kill');
  },
  onFork() {
    this.stats.fork = true;
    this.addScore(2000);
    this.banner('TUNING FORK FOUND!', '#ffe14a', true);
    this.award('fork');
    this.say('tobi', "A golden tuning fork! Those are legendary — hang on to it!");
  },
  onCheckpoint(through) {
    this.checkpointHit = true;
    if (through) { this.player.heal(30); SFX.ring(true); }
    this.banner('CHECKPOINT', '#6ff6ff', true);
  },

  // ---------------------------------------------------------------------------
  // Boss flow
  // ---------------------------------------------------------------------------
  startBoss(key) {
    const Cls = BOSSES[key];
    this.boss = new Cls();
    this.phase = 'boss'; this.phaseT = 0;
    this.bossCard = 4;
    Music.queue(key === 'hush' ? SONGS.final : SONGS.boss, { layer: 1 + this.res.level });
    SFX.roar();
    const lines = { conductor: ['static', 'You call that noise MUSIC? I will conduct your silence!'], grinder: ['static', 'CRUNCH. Your little songs taste like gravel.'], serpent: ['static', 'Hush now... let the cold keep you quiet forever...'], anvil: ['static', 'I will hammer your song flat!'], hush: ['hush', '...then let there be nothing at all.'] };
    const l = lines[key]; if (l) this.later(1.5, () => this.say(l[0], l[1], true));
  },
  onBossDefeated(b) {
    this.slowmoT = 2.2;
    this.rail.world(_p, b.d, b.x, b.y); this.shockwave(_p.x, _p.y, _p.z, 2); this.fovKick = 8;
    this.shake(1); this.flash([1, 1, 1], 0.6);
    const bonus = this.addScore(10000);
    this.banner('BOSS DEFEATED  +' + bonus, 'rainbow', true);
    for (const eb of this.ebullets) { this.rail.world(_p, eb.d, eb.x, eb.y); FX.spawn(_p.x, _p.y, _p.z, 0, 4, 0, 0.6, 1.5, 0.2, 1, 0.9, 0.5, 1, SPR.SPARKLE); }
    this.ebullets.length = 0;
    for (const e of this.enemies) if (!e.dead) e.damage(99, null);
    SFX.bigBoom(); Haptics.impact('boss');
    if (this.silence) this.exitSilence();
    this.phase = 'bossDeath'; this.phaseT = 0;
  },
  enterSilence() {
    this.silence = true;
    AudioSys.setSilence(1, 0.6);
    this.say('hush', '...listen... to... nothing.', true);
    this.later(3.5, () => this.say('oz', "The music's gone! Keep shooting that mask — every hit brings a note back!", true));
  },
  exitSilence() {
    this.silence = false;
    AudioSys.setSilence(0, 0.1);
    Music.setLayer(5);
  },
  onPlayerDown() {
    this.stats.deaths++;
    this.phase = 'dead'; this.phaseT = 0;
    this.player.lives--;
    this.resonanceHit();
    Music.setLayer(0);
  },

  // ---------------------------------------------------------------------------
  // Main tick
  // ---------------------------------------------------------------------------
  frame(dt) {
    this.realTime += dt;
    this.overlayT = this.overlay ? this.overlayT + dt : 0;
    HUD.resize();
    Input.poll(dt);
    try { Music.update(); } catch (e) { reportError('music', e); } // audio trouble must never stall the game
    this.readBeats();
    const upd = this['update_' + this.state];
    if (upd && !this.overlay) { upd.call(this, dt); this.updateAnnounce(dt); this.updateDuck(); }
    this.stateT += dt;
    this.adaptQuality(dt);
    this.render(dt);
    HUD.draw(dt);
    Input.endFrame();
  },
  // Native mode renders at the full display resolution; if the device can't
  // hold ~50 fps there, step the internal resolution down (and back up later).
  adaptQuality(dt) {
    if (this.settings.res !== 0) { this.quality = 1; return; }
    this.perfT += dt; this.perfN++;
    if (dt > 1 / 45) this.perfSlow++;
    if (this.perfT < 2) return;
    const slowFrac = this.perfSlow / this.perfN;
    if (slowFrac > 0.5 && this.quality > 0.5) { this.quality = Math.max(0.5, this.quality - 0.125); this.perfGood = 0; }
    else if (slowFrac < 0.08 && this.quality < 1) { if (++this.perfGood >= 3) { this.quality = Math.min(1, this.quality + 0.125); this.perfGood = 0; } }
    else this.perfGood = 0;
    this.perfT = 0; this.perfN = 0; this.perfSlow = 0;
  },
  readBeats() {
    this.onBeat = this.on8th = this.onBar = this.stepCrossed = false;
    for (const s of Music.crossed) {
      this.stepCrossed = true; this.stepIndex = s;
      if (s % 2 === 0) this.on8th = true;
      if (s % 4 === 0) { this.onBeat = true; this.beatIndex = s / 4; }
      if (s % 16 === 0) { this.onBar = true; this.barIndex = s / 16; }
    }
  },

  // ---- boot / logo -------------------------------------------------------
  enter_boot() { Input.mode = 'menu'; },
  update_boot() {
    if (Input.clicks.length || Input.nav.ok || Input.firePressed) { AudioSys.unlock(); this.setState('logo'); }
  },
  enter_logo() {
    this.setupWorld('brief', () => 0, () => 0, 30);
    Music.play(SONGS.logo, { loop: false });
    this.logoMesh = this.logoMesh || buildLogoMesh('SYNTHWING', { colors: LOGO_COLORS });
    this.logo64 = this.logo64 || buildLogoMesh('64', { voxel: 1, depth: 2.4, colors: LOGO64_COLORS });
  },
  update_logo(dt) {
    if (this.stateT > 5.2 || (this.stateT > 0.6 && (Input.clicks.length || Input.nav.ok || Input.firePressed))) this.setState('title');
  },

  // ---- title -------------------------------------------------------------
  enter_title() {
    Input.mode = 'menu';
    const st = STAGES[0];
    this.setupWorld('title', st.railX, (d) => 10 + 3 * Math.sin(d * 0.004), 34);
    this.railD = 600 + Math.random() * 2000;
    const P = this.player; P.reset(true); P.d = this.railD + PLAYER_AHEAD; P.control = false; P.invuln = 0;
    this.wingmen = ['oz', 'sable', 'tobi'].map((w) => new Wingman(w));
    for (const w of this.wingmen) { w.d = P.d - 2; }
    this.terrain.prewarm(this.railD, 520, this.renderer);
    if (Music.name !== 'title') Music.play(SONGS.title, { layer: 5 });
    if (!this.announced) { this.announced = true; this.announce('Synthwing sixty-four!', 0.9); }
    this.camShot = 0; this.camShotT = 0;
    this.logoMesh = this.logoMesh || buildLogoMesh('SYNTHWING', { colors: LOGO_COLORS });
    this.logo64 = this.logo64 || buildLogoMesh('64', { voxel: 1, depth: 2.4, colors: LOGO64_COLORS });
  },
  update_title(dt) {
    this.attract(dt);
    this.idleT = Input.anyPress || HUD.sub ? 0 : (this.idleT || 0) + dt;
    if (window.SYNTHWING_DEMO && !this.demoAuto && this.stateT > 2) { this.demoAuto = true; this.startDemo(); }
    else if (this.idleT > 25) { this.idleT = 0; this.startDemo(); }
  },
  // Autopilot flight used by the title & results backdrops.
  attract(dt) {
    const P = this.player;
    this.time += dt;
    this.railD += this.speed * dt;
    P.d = this.railD + PLAYER_AHEAD;
    P.x = Math.sin(this.time * 0.35) * 6; P.y = Math.sin(this.time * 0.5) * 2.5;
    P.vx = Math.cos(this.time * 0.35) * 2.1;
    P.rollAngle = -P.vx * 0.12 + Math.sin(this.time * 0.8) * 0.05; P.aimX = 0; P.aimY = 0;
    P.visible = true;
    for (const w of this.wingmen) { if (w.state !== 'formation') w.setState('formation'); w.update(dt); }
    FX.update(dt, this.cam);
    this.terrain.update(this.railD, 520, this.renderer, 2);
    // cinematic camera shots, cut every 4 bars
    this.camShotT += dt;
    if (this.camShotT > 7.5) { this.camShotT = 0; this.camShot = (this.camShot + 1) % 4; }
    this.cinematicCamera(dt);
  },
  cinematicCamera(dt) {
    const P = this.player, cam = this.cam, t = this.camShotT;
    const shots = [
      () => [W3(P.d + 9 - t * 0.6, P.x + 7, P.y + 1.5), W3(P.d - 2, P.x, P.y)],
      () => [W3(P.d - 14, P.x - 3 + t * 0.4, P.y + 3.5), W3(P.d + 30, P.x, P.y + 1)],
      () => [W3(P.d + 2 + t * 0.3, P.x - 12, P.y - 2), W3(P.d, P.x, P.y + 0.5)],
      () => [W3(P.d + 26, P.x + 2 - t * 0.5, P.y + 8), W3(P.d - 6, P.x, P.y)],
    ];
    const [pos, tgt] = shots[this.camShot]();
    pos.y = Math.max(pos.y, this.groundY(-pos.z, pos.x - this.rail.x(-pos.z)) + 3);
    cam.pos.copy(pos); cam.target.copy(tgt); cam.up.set(0, 1, 0);
    cam.fov = 52 * DEG;
  },

  // ---- hangar (vehicle select) ------------------------------------------------
  enter_hangar() {
    Input.mode = 'menu';
    this.setupWorld('brief', () => 0, () => 0, 30);
    this.railD = 0;
    const i = VEHICLES.indexOf(currentVehicle());
    this.hangar = { sel: i, from: i, dir: 1, slide: 1, annT: 0.45 };
  },
  update_hangar(dt) {
    const H = this.hangar;
    this.time += dt;
    H.slide = Math.min(1, H.slide + dt * 3.2);
    if (H.annT > 0 && (H.annT -= dt) <= 0) { const v = VEHICLES[H.sel]; this.announce(vehicleUnlocked(v) ? v.name : 'Locked'); }
    if (Math.random() < dt * 14) { // sparks rising off the pad rim
      const a = Math.random() * TAU;
      FX.spawn(Math.cos(a) * 3.1, -1.15, Math.sin(a) * 3.1, 0, rr(2, 5), 0, rr(0.5, 1), 0.5, 0.1, 0.4, 0.9, 1, 1, SPR.GLOW);
    }
    FX.update(dt, this.cam);
  },
  hangarSelect(dir) {
    const H = this.hangar, n = VEHICLES.length;
    H.from = H.sel; H.sel = (H.sel + dir + n) % n; H.dir = dir; H.slide = 0; H.annT = 0.3;
    this.ann = null;
    SFX.roll(); Haptics.ui();
  },
  hangarLaunch() {
    const v = VEHICLES[this.hangar.sel];
    if (!vehicleUnlocked(v)) { SFX.menuBack(); return; }
    this.save.vehicle = v.id; this.writeSave();
    if (v.id === 'maestro') this.award('maestro');
    this.score = 0; this.player.reset(true); this.said.clear();
    this.setState('brief');
  },
  // Frame the ship left of centre in landscape (stats on the right), high in portrait.
  hangarCamera(r) {
    const cam = this.cam, aspect = r.sceneW / r.sceneH, land = aspect >= 1, t = this.realTime;
    cam.fov = 36 * DEG;
    const fov = land ? cam.fov : Math.min(100 * DEG, 2 * Math.atan(Math.tan(cam.fov / 2) * 1.55 / Math.max(0.5, aspect)));
    const D = land ? 13 : 10.5, halfH = Math.tan(fov / 2) * D, halfW = halfH * aspect;
    const ox = land ? 0.42 * halfW : 0, oy = land ? -0.08 * halfH : -0.34 * halfH;
    cam.pos.set(ox + Math.sin(t * 0.25) * 1.2, oy + (land ? 3.6 : 5), D);
    cam.target.set(ox, oy, 0); cam.up.set(0, 1, 0);
  },
  drawHangarScene(r) {
    const H = this.hangar, t = this.realTime, M = _M;
    m4euler(M, -26, 4, -70, t * 0.03, 0.4, 0.1, 26);
    r.draw(MODELS.planet, M, { tint: [0.35, 0.5, 1, 1], tex: TEX.detail, texMix: 0.5, uvScale: [2, 1], fog: 0 });
    m4euler(M, 0, -1.4, 0, t * 0.15, 0, 0, 1);
    r.draw(MODELS.pad, M, { chrome: 0.35 });
    r.sprite(0, -1.2, 0, 7, 7, 0, SPR.GLOW, 0.3, 0.7, 1, 0.35);
    const k = easeOutCubic(H.slide), bob = Math.sin(t * 1.6) * 0.12;
    const ship = (i, x, a) => {
      const v = VEHICLES[i], open = vehicleUnlocked(v);
      m4euler(M, x, bob, 0, t * 0.5 + (1 - k) * 2 * H.dir, 0.12, Math.sin(t * 1.1) * 0.06, 1.25);
      r.draw(MODELS[v.model], M, open ? { chrome: 0.35, tint: [1, 1, 1, a] } : { tint: [0.04, 0.04, 0.07, 1], chrome: 0, fog: 0 });
    };
    if (k < 1) ship(H.from, -k * 10 * H.dir, 1);
    ship(H.sel, (1 - k) * 10 * H.dir, 1);
  },

  // ---- briefing ------------------------------------------------------------
  enter_brief() {
    Input.mode = 'menu';
    const st = STAGES[this.stageIdx];
    this.setupWorld('brief', () => 0, () => 0, 30);
    this.railD = 0;
    this.briefLine = -1; this.briefT = 0; this.briefDone = false;
    Music.play(SONGS.brief, { layer: 5 });
    this.briefLines = st.brief.slice();
    this.announce('Stage ' + st.num + '. ' + st.name, 0.3);
  },
  update_brief(dt) {
    this.time += dt; this.briefT += dt;
    FX.update(dt, this.cam);
    const L = this.briefLines;
    if (this.briefLine < 0 && this.stateT > 1.2 && !this.ann) { this.briefLine = 0; this.dialog.queue.length = 0; this.dialog.cur = null; this.say(L[0][0], L[0][1]); }
    else if (this.briefLine >= 0 && !this.dialog.cur && !this.dialog.queue.length && !this.briefDone) {
      this.briefLine++;
      if (this.briefLine < L.length) this.say(L[this.briefLine][0], L[this.briefLine][1]); else this.briefDone = true;
    }
    this.updateDialog(dt);
    const tap = Input.clicks.length || Input.nav.ok || Input.firePressed;
    if (tap && this.stateT > 0.5) {
      if (this.briefDone) { SFX.menuOk(); this.launchStage(); }
      else if (this.dialog.cur && this.dialog.cur.shown < this.dialog.cur.text.length) this.skipTyping();
      else if (this.dialog.cur) this.endMessage(false);
      else if (this.ann) this.ann.syl.length = 0;
    }
    const cam = this.cam, a = this.time * 0.05;
    cam.pos.set(Math.sin(a) * 18, 4 + Math.sin(this.time * 0.2) * 2, 60 + Math.cos(a) * 10);
    cam.target.set(-10, 0, 0); cam.up.set(0, 1, 0); cam.fov = 50 * DEG;
  },
  launchStage() {
    this.setState('play');
  },

  // ---- play ------------------------------------------------------------------
  enter_play() {
    Input.mode = 'play';
    this.startStage(this.stageIdx, false);
    if (!this.demo) { this.save.plays++; this.writeSave(); }
  },
  update_play(dt) {
    const P = this.player;
    if (this.demo && this.demoPilot(dt)) return;
    // pause
    if (Input.pausePressed && this.phase !== 'clear') { this.pause(); return; }
    // time scaling
    let ts = 1;
    if (this.hitstopT > 0) { this.hitstopT -= dt; ts = 0.05; }
    if (this.slowmoT > 0) { this.slowmoT -= dt; ts = Math.min(ts, 0.3 + (1 - this.slowmoT / 2.2) * 0.4); }
    const gdt = dt * ts;
    this.time += gdt;
    this.phaseT += dt;
    // rail advance
    this.railD += this.speed * gdt;
    if (P.alive || this.phase === 'dead') P.d = this.railD + PLAYER_AHEAD;
    if (this.phase !== 'dead') this.stageTime += gdt;
    this.stats.time += gdt;
    this.bar = this.stageTime / this.barDur;
    // phases
    if (this.phase === 'intro') {
      if (this.phaseT > 3.2) { this.phase = 'main'; P.control = true; }
    }
    if ((this.phase === 'main' || this.phase === 'intro') && this.stage) {
      const S = this.stage.script;
      while (this.scriptIdx < S.length && S[this.scriptIdx][0] <= this.bar) { S[this.scriptIdx][1](this); this.scriptIdx++; }
      if (this.stage.ambient) this.stage.ambient(this, gdt);
    }
    if (this.phase === 'main') this.fillerCheck(gdt);
    if (this.phase === 'boss' && this.stage.ambient && !this.boss.entering) this.stage.ambient(this, gdt * 0.3);
    if (this.phase === 'bossDeath') {
      if (this.phaseT > 3.2) this.beginClear();
    }
    if (this.phase === 'clear') {
      P.control = false;
      P.x = damp(P.x, 0, 1.5, dt); P.y = damp(P.y, 2, 1.5, dt);
      if (this.phaseT > 3.5) P.d += (this.phaseT - 3.5) * (this.phaseT - 3.5) * 60 * dt * 4;
      if (this.phaseT > 5.5 && !this.resultsShown) { this.resultsShown = true; this.finishStage(); }
    }
    if (this.phase === 'dead') {
      if (this.phaseT > 3) {
        if (P.lives >= 0) { this.startStage(this.stageIdx, true); this.banner(this.checkpointHit ? 'RESUMING FROM CHECKPOINT' : 'TRY AGAIN!', '#ffffff'); }
        else { this.setState('gameover'); return; }
      }
    }
    // simulation
    P.update(gdt);
    for (const w of this.wingmen) w.update(gdt);
    this.hotTarget = P.alive && P.control ? this.findNearReticle(0.09) : null;
    for (const e of this.enemies) e.update(gdt);
    if (this.boss) { this.boss.update(gdt); this.boss.postUpdate(gdt); }
    for (const p of this.props) this.updateProp(p, gdt);
    for (const p of this.pickups) p.update(gdt);
    this.updateBullets(gdt);
    this.updateHoming(gdt);
    this.updateBomb(gdt);
    this.enemies = this.enemies.filter((e) => !e.dead && !e.gone);
    this.props = this.props.filter((p) => !p.gone);
    this.pickups = this.pickups.filter((p) => !p.gone);
    // resonance decay
    const R = this.res;
    R.idle += gdt;
    if (R.idle > 4 && R.level < 4) { R.meter -= gdt * 0.12; if (R.meter < 0) { if (R.level > 0) { R.level--; R.meter = 0.7; this.syncLayers(); } else R.meter = 0; } }
    if (R.level >= 4 && R.idle > 8) { R.level = 3; R.meter = 0.8; this.syncLayers(); }
    // restoration (final stage colour & music)
    if (this.stage.restore) {
      this.saturation = this.silence ? 0.05 : this.boss && this.boss.dead ? damp(this.saturation, 1, 1.5, dt) : 0.08 + this.restore * 0.92;
      this.glitch = this.silence ? 0.6 : (1 - this.restore) * 0.25;
    }
    this.updateTimers(gdt);
    FX.update(gdt, this.cam);
    this.terrain.update(this.railD, 560, this.renderer, 2);
    this.updateDialog(dt);
    this.updateCamera(dt);
    this.decayFeel(dt);
    if (this.warnT > 0) this.warnT -= dt;
    if (this.bossCard > 0) this.bossCard -= dt;
  },
  decayFeel(dt) {
    this.fovKick = Math.max(0, this.fovKick - dt * 9);
    for (let i = this.shocks.length - 1; i >= 0; i--) { this.shocks[i].t += dt; if (this.shocks[i].t > this.shocks[i].max) this.shocks.splice(i, 1); }
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    this.aberration = Math.max(0, this.aberration - dt * 0.03);
  },
  // Keep the action flowing: if the sky goes quiet between scripted events,
  // send in a small themed wave.
  fillerCheck(dt) {
    const busy = this.enemies.some((e) => !e.dead && !e.T.solid && e.type !== 'mine' && e.type !== 'prism');
    if (busy) { this.quietT = 0; return; }
    this.quietT = (this.quietT || 0) + dt;
    const next = this.stage.script[this.scriptIdx];
    if (this.quietT < this.barDur * 1.1 || (next && next[0] - this.bar < 1.2)) return;
    this.quietT = 0;
    const body = this.stage.id === 'hush' ? 'cube' : 'drone';
    const waves = [
      () => wave(body, 'hover', F.V(5, 5, rr(-6, 6), rr(-2, 5)), { hold: 4 }),
      () => wave(body, 'swoop', F.line(4, 5, rr(-4, 4), rr(-2, 5)), { side: chance(0.5) ? 1 : -1, hold: 3 }),
      () => wave('swooper', 'behind', F.line(3, 8, 0, rr(0, 5)), { hold: 4 }),
      () => wave(body, 'pass', F.grid(3, 2, 7, rr(-8, 8), rr(-3, 4)), { off: 230, stagger: 5 }),
      () => wave(body, 'charge', F.line(4, 8, 0, rr(-3, 3)), { off: 260, stagger: 14 }),
      () => chain(body, 7, { ax: rr(10, 16), ay: rr(3, 7), cy: rr(-2, 4) }),
      () => strafe(body, 5, { side: chance(0.5) ? 1 : -1, dist: rr(48, 62), y: rr(-2, 4) }),
      () => dive(body, [-8, 0, 8], { y: rr(-2, 3) }),
      () => loops('swooper', F.line(2, 12, 0, rr(1, 5))),
    ];
    pick(waves)()(this);
    if (Math.random() < 0.25) this.spawnPod(rr(-8, 8), rr(0, 5));
  },
  updateProp(p, dt) {
    if (p.kind === 'vent') {
      p.t += dt;
      if (this.onBar || (this.onBeat && this.beatIndex % 4 === 2)) { p.erupt = 1; SFX.explode(0.8); }
      if (p.erupt > 0) {
        p.erupt -= dt / ((Music.stepDur || 0.1) * 4);
        for (let i = 0; i < 3; i++) FX.spawn(p.x + rr(-2, 2), p.y + 4, p.z + rr(-2, 2), rr(-3, 3), rr(40, 70), rr(-3, 3), 0.8, 3, 1, 1, rr(0.3, 0.6), 0.05, 1, SPR.GLOW, true, 0.4, -30);
        const P = this.player; P.worldPos(_p);
        if (Math.hypot(_p.x - p.x, _p.z - p.z) < 5 && _p.y < p.y + 55) P.hurt(14);
      }
      if (-p.z < this.player.d - 60) p.gone = true;
      return;
    }
    p.update(dt);
    if (p.o.bonus && !p.bonusDone && -p.z < this.player.d) {
      p.bonusDone = true;
      const P = this.player; P.worldPos(_p);
      if (Math.abs(_p.x - p.x) < 13 * p.scale && _p.y < p.y + 13 * p.scale) { const pts = this.addScore(500); this.banner('NICE THREADING! +' + pts, '#9ff6ff'); SFX.ring(false); this.resonanceGain(1); }
    }
  },
  updateBullets(dt) {
    const P = this.player;
    // player lasers
    const pb = this.pbullets;
    for (let i = pb.length - 1; i >= 0; i--) {
      const b = pb[i];
      b.pd = b.d; b.px = b.x; b.py = b.y;
      b.d += b.vd * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (segSphere(b.pd, b.px, b.py, b.d, b.x, b.y, e.d, e.x, e.y, e.r + 0.4)) {
          if (e.damage(b.dmg, b) && b.pierce > 0) b.pierce--; // bass bolts punch through what they kill
          else hit = true;
          break;
        }
      }
      if (!hit && this.boss && !this.boss.dead) for (const part of this.boss.parts) {
        if (!part.alive && part.weak) continue;
        if (segSphere(b.pd, b.px, b.py, b.d, b.x, b.y, part.d, part.x, part.y, part.r + 0.4)) { this.boss.hit(part, b.dmg, b); hit = true; break; }
      }
      // terrain
      if (!hit && this.terrain && this.env.height && ((i + (this.frameN || 0)) & 3) === 0) {
        this.rail.world(_p, b.d, b.x, b.y);
        if (_p.y < this.terrainHeight(_p.x, _p.z)) { FX.hitSpark(_p.x, _p.y, _p.z, 0, 5, 0, [1, 0.8, 0.5]); hit = true; }
      }
      if (hit || b.life <= 0) { pb[i] = pb[pb.length - 1]; pb.pop(); }
    }
    // enemy bullets
    const eb = this.ebullets;
    for (let i = eb.length - 1; i >= 0; i--) {
      const b = eb[i];
      b.d += b.vd * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.d < P.d - 20;
      if (!dead && P.alive && P.notes > 0 && Math.abs(b.d - P.d) < b.r + 1.2) { // harmony notes block shots
        for (let n = 0; n < P.notes; n++) { const [nx, ny] = P.notePos(n); if (Math.hypot(b.x - nx, b.y - ny) < b.r + 1.1) { P.noteBlock(n); dead = true; break; } }
      }
      if (!dead && P.alive) {
        const dd = b.d - P.d, dx = b.x - P.x, dy = b.y - P.y, r = b.r + P.r * 0.75;
        if (dd * dd + dx * dx + dy * dy < r * r) {
          if (P.pow.fortissimo > 0) { this.rail.world(_p, b.d, b.x, b.y); FX.hitSpark(_p.x, _p.y, _p.z, 0, 0, -this.speed, [1, 0.9, 1]); dead = true; }
          else if (P.rolling) {
            // deflect it straight back — it becomes yours
            SFX.deflect(); if (this.tally('deflects') >= 25) this.award('deflect');
            this.rail.world(_p, b.d, b.x, b.y); FX.hitSpark(_p.x, _p.y, _p.z, 0, 0, -this.speed, [0.6, 0.9, 1]);
            this.pbullets.push({ d: b.d + 1, x: b.x, y: b.y, pd: b.d, px: b.x, py: b.y, vd: this.speed + LASER_REL * 0.8, vx: -b.vx * 0.3, vy: -b.vy * 0.3, life: 1, dmg: 2, lv: 3 });
            dead = true;
          } else if (P.hurt(b.dmg)) dead = true;
        }
      }
      if (dead) { eb[i] = eb[eb.length - 1]; eb.pop(); }
    }
    this.frameN = (this.frameN || 0) + 1;
  },
  updateHoming(dt) {
    const H = this.homing;
    for (let i = H.length - 1; i >= 0; i--) {
      const h = H[i];
      h.t += dt; h.life -= dt;
      if (h.t < 0) { // staggered launch, ride along with the ship
        const P = this.player; h.d = P.d + 1; h.x = P.x; h.y = P.y;
        if (h.t + dt >= 0) { // launching this frame: puff + kick
          this.rail.world(_p, h.d, h.x, h.y);
          FX.spawn(_p.x, _p.y, _p.z, h.vx * 0.2, h.vy * 0.2, -this.speed, 0.18, 2.2, 0.4, 0.7, 1, 0.9, 1, SPR.SPARKLE);
          this.fovKick = Math.max(this.fovKick, 1.2);
        }
        continue;
      }
      let tg = h.target;
      const tgAlive = tg && (tg.isPart ? tg.alive && !tg.boss.dead : !tg.dead && !tg.gone);
      if (!tgAlive) { tg = h.target = this.findNearReticle(0.5, false, true); if (!tg) h.life = Math.min(h.life, 0.2); }
      const sp = this.speed + 110 + h.t * 260;
      if (tg) {
        let dd = tg.d - h.d, dx = tg.x - h.x, dy = tg.y - h.y;
        const l = Math.hypot(dd, dx, dy) || 1;
        const turn = 3 + h.t * 14;
        const k = 1 - Math.exp(-turn * dt);
        h.vd = lerp(h.vd, this.speed + (dd / l) * (sp - this.speed), k);
        h.vx = lerp(h.vx, (dx / l) * (sp - this.speed), k);
        h.vy = lerp(h.vy, (dy / l) * (sp - this.speed), k);
        if (l < (tg.r || 2) + 1.2) {
          const hk = this.player.V.homing;
          if (tg.isPart) tg.boss.hit(tg, 2 * hk, { homing: true, volley: h.volley });
          else tg.damage((tg.T && tg.T.big ? 3 : 2) * hk, { homing: true, volley: h.volley });
          if (tg.lockCount) tg.lockCount = Math.max(0, tg.lockCount - 1);
          this.rail.world(_p, h.d, h.x, h.y);
          FX.spawn(_p.x, _p.y, _p.z, 0, 0, -this.speed, 0.25, 4, 1, 0.6, 1, 0.9, 1, SPR.SPARKLE);
          h.life = 0;
        }
      }
      h.d += h.vd * dt; h.x += h.vx * dt; h.y += h.vy * dt;
      this.rail.world(_p, h.d, h.x, h.y);
      const tp = h.trail.pts.length >= h.trail.maxPts ? h.trail.pts.pop() : new V3();
      h.trail.pts.unshift(tp.set(_p.x, _p.y, _p.z));
      if (h.life <= 0) { h.trail.alive = false; H[i] = H[H.length - 1]; H.pop(); }
    }
  },
  updateBomb(dt) {
    const b = this.bomb; if (!b) return;
    b.t += dt;
    b.d += b.vd * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let boom = b.t > 0.55;
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.d - b.d, e.x - b.x, e.y - b.y) < e.r + 2) boom = true;
    if (this.boss) for (const p of this.boss.parts) if (p.alive && Math.hypot(p.d - b.d, p.x - b.x, p.y - b.y) < p.r + 2) boom = true;
    if (!boom) return;
    this.bomb = null;
    this.rail.world(_p, b.d, b.x, b.y);
    FX.explode(_p.x, _p.y, _p.z, 5, { shell: [0.6, 0.8, 1], palette: [[0.6, 0.9, 1], [1, 1, 1], [0.8, 0.5, 1]] });
    this.flash([0.8, 0.9, 1], 0.7); this.shake(0.8);
    this.shockwave(_p.x, _p.y, _p.z, 1.6); this.fovKick = 9;
    let kills = 0;
    for (const e of this.enemies) if (!e.dead && Math.hypot(e.d - b.d, e.x - b.x, e.y - b.y) < 42 && e.damage(e.T.big ? 12 : 99, { bomb: true })) kills++;
    if (kills >= 10) this.award('nova');
    if (this.boss) for (const p of this.boss.parts) if (p.alive && p.weak && Math.hypot(p.d - b.d, p.x - b.x, p.y - b.y) < 45) this.boss.hit(p, 8, { bomb: true });
    for (const eb of this.ebullets) { this.rail.world(_p, eb.d, eb.x, eb.y); FX.spawn(_p.x, _p.y, _p.z, 0, 0, -this.speed, 0.4, 1.5, 0.2, 0.7, 0.9, 1, 1, SPR.SPARKLE); }
    this.ebullets.length = 0;
  },
  // Enemy (or boss part) nearest the far reticle in screen space.
  findNearReticle(radius, forLock, anyScreen) {
    const cam = this.cam, P = this.player;
    const ret = this.reticle;
    if (!ret.ok && !anyScreen) return null;
    const asp = cam.aspect || 1.6;
    let best = null, bd = radius;
    const test = (o, wx, wy, wz, locked, hp) => {
      if (o.d < P.d + 6) return;
      if (!cam.project(_q, wx, wy, wz)) return;
      if (_q.x < -0.02 || _q.x > 1.02 || _q.y < -0.02 || _q.y > 1.02) return;
      if (forLock && locked >= Math.max(1, Math.ceil(hp / 2))) return;
      const dx = (_q.x - (anyScreen ? 0.5 : ret.nx)) * asp, dy = _q.y - (anyScreen ? 0.5 : ret.ny);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = o; }
    };
    for (const e of this.enemies) { if (e.dead || e.d - P.d > 330) continue; test(e, e.wx, e.wy, e.wz, e.lockCount || 0, e.hp); }
    if (this.boss && !this.boss.dead && !this.boss.entering) for (const p of this.boss.parts) {
      if (!p.alive || p.invuln) continue;
      this.rail.world(_t, p.d, p.x, p.y);
      test(p, _t.x, _t.y, _t.z, p.lockCount || 0, 8);
    }
    return best;
  },

  beginClear() {
    this.phase = 'clear'; this.phaseT = 0; this.resultsShown = false;
    this.boss = null;
    Music.play(SONGS.clear, { loop: false });
    for (const w of this.wingmen) if (w.hp > 0) w.setState('join');
    this.announce('Mission accomplished!', 0.85);
    const line = ['Corona sings again! Outstanding work, Synthwing!', "The Halo Belt is humming! You're on a roll, squadron.", "Frostline's aurora is singing — I can hear it from here!", 'The Forge is cold and quiet. The good kind of quiet.', 'The Octave Cluster is singing again. Synthwing... thank you.'][this.stageIdx] || 'Mission complete!';
    this.dialog.queue.length = 0; this.endMessage(true);
    this.later(1.6, () => this.say('maren', line, true));
  },
  finishStage() {
    if (this.demo) { this.endDemo(); return; }
    const st = this.stage, s = this.save;
    const stageScore = this.score - this.stageStartScore;
    const allWings = this.wingmen.every((w) => w.hp > 0);
    const medal = stageScore >= st.medal && allWings;
    this.results = { stageScore, total: this.score, kills: this.stats.kills, rescues: this.stats.rescues, fork: this.stats.fork, medal, allWings, newBest: stageScore > (s.best[st.id] || 0), deaths: this.stats.deaths };
    if (this.results.newBest) s.best[st.id] = stageScore;
    if (medal) s.medals[st.id] = true;
    if (this.stats.fork) s.forks[st.id] = true;
    s.unlocked = Math.max(s.unlocked, Math.min(5, this.stageIdx + 2));
    if (Object.keys(s.forks).length >= 5) s.gold = true;
    if (this.score > s.hiscore) s.hiscore = this.score;
    this.writeSave();
    // awards & Game Center
    if (st.id === 'corona') this.award('first_flight');
    if (medal) this.award('medal');
    if (Object.keys(s.medals).length >= 5) this.award('all_medals');
    if (Object.keys(s.forks).length >= 5) this.award('all_forks');
    if (allWings) this.award('squad');
    if (!this.stats.hits) this.award('flawless');
    if (this.settings.diff === DIFFS.length - 1) this.award('virtuoso');
    this.tally('clr_' + this.player.V.id);
    if (['synthwing', 'bassline', 'arpeggio'].every((v) => s.tally['clr_' + v])) this.award('test_pilot');
    if (this.score >= 500000) this.award('score');
    Native.submitScore('stage.' + st.id, stageScore);
    Native.submitScore('highscore', this.score);
    this.setState('results');
  },

  pause() {
    this.overlay = 'pause';
    this.writeSave(); // keep lifetime tallies if the app is closed from here
    Input.mode = 'menu'; Input.releaseAll();
    AudioSys.suspend();
    SFX.menuBack();
  },
  resume() {
    this.overlay = null; Input.mode = this.state === 'play' ? 'play' : 'menu';
    AudioSys.resume();
    Music.nextT = AudioSys.time() + 0.05;
  },

  // ---- results ---------------------------------------------------------------
  enter_results() {
    Input.mode = 'menu';
    this.resultT = 0;
    this.player.alive = true; this.player.visible = true;
    const w = this.wingmen; for (const m of w) if (m.hp > 0) m.setState('formation');
    Music.play(SONGS.brief, { layer: 5 });
  },
  update_results(dt) {
    this.resultT += dt;
    this.camShot = 0; this.camShotT = 2;
    this.attract(dt);
    if (this.resultT > 1.5 && (Input.clicks.length || Input.nav.ok || Input.firePressed)) {
      SFX.menuOk();
      if (this.stageIdx >= STAGES.length - 1) this.setState('ending');
      else { this.stageIdx++; this.setState('brief'); }
    }
  },

  // ---- game over ---------------------------------------------------------------
  enter_gameover() {
    Input.mode = 'menu'; Music.play(SONGS.gameover, { loop: false }); this.announce('Game over.', 0.5);
    if (this.score > this.save.hiscore) this.save.hiscore = this.score;
    this.writeSave();
    Native.submitScore('highscore', this.score);
  },
  update_gameover(dt) { this.time += dt; FX.update(dt, this.cam); },
  continueGame() {
    this.score = this.stageStartScore;
    this.player.reset(true);
    this.setState('play');
  },

  // ---- ending ------------------------------------------------------------------
  enter_ending() {
    Input.mode = 'menu';
    this.save.cleared = true; this.writeSave();
    this.award('finale');
    Native.submitScore('highscore', this.score);
    const st = STAGES[0];
    this.setupWorld('title', st.railX, (d) => 12 + 3 * Math.sin(d * 0.004), 40);
    this.railD = 3000;
    const P = this.player; P.d = this.railD + PLAYER_AHEAD; P.control = false;
    for (const w of this.wingmen) { w.hp = Math.max(w.hp, 50); w.setState('formation'); w.d = P.d - 2; }
    this.terrain.prewarm(this.railD, 520, this.renderer);
    Music.play(SONGS.ending, { layer: 5 });
    this.camShot = 1; this.camShotT = 0; this.endingT = 0;
  },
  update_ending(dt) {
    this.endingT += dt;
    this.attract(dt);
    if (this.endingT > 12 && (Input.clicks.length || Input.nav.ok)) { this.setState('title'); }
  },

  // ---------------------------------------------------------------------------
  // Camera
  // ---------------------------------------------------------------------------
  updateCamera(dt, snap) {
    const P = this.player, cam = this.cam;
    let pos, tgt;
    if (this.phase === 'intro' && this.state === 'play') {
      const k = easeInOutCubic(Math.min(1, this.phaseT / 3.2));
      const a = lerp(0.2, PI, k);
      const rad = lerp(10, 12.5, k);
      pos = W3(P.d + Math.cos(a) * rad, P.x * 0.55 + Math.sin(a) * 7, P.y * 0.5 + lerp(0.8, 3.4, k));
      tgt = W3(lerp(P.d, P.d + 28, k), P.x * 0.75, P.y * 0.65 + 0.8 * k);
    } else if (this.phase === 'clear') {
      const a = this.phaseT * 0.5;
      pos = W3(P.d - 12 * Math.cos(a), P.x + 12 * Math.sin(a), P.y + 3);
      tgt = W3(P.d, P.x, P.y);
    } else if (this.phase === 'dead') {
      pos = W3(this.railD - 2, P.x * 0.5, 6); tgt = W3(P.d, P.x, P.y);
    } else {
      const camD = P.d - 12.5;
      pos = W3(camD, P.x * 0.55, P.y * 0.5 + 3.4);
      tgt = W3(P.d + 28, P.x * 0.75 + P.aimX * 8, P.y * 0.65 + 0.8 + P.aimY * 6);
      if (this.boss && this.boss.entering && this.boss.enterT < 2.5) {
        // glance toward the boss as it arrives
        const b = this.boss, k = Math.sin(clamp01(b.enterT / 2.5) * PI) * 0.45;
        const bt = W3(b.d, b.x, b.y + 8);
        tgt.lerp(bt, k);
      }
    }
    if (this.env && this.env.height) pos.y = Math.max(pos.y, this.terrainHeight(pos.x, pos.z) + 2.5);
    if (snap || !dt) { cam.pos.copy(pos); cam.target.copy(tgt); }
    else { cam.pos.lerp(pos, 1 - Math.exp(-12 * dt)); cam.target.lerp(tgt, 1 - Math.exp(-10 * dt)); }
    // shake
    const sh = this.trauma * this.trauma * 1.1;
    if (sh > 0) { const t = this.realTime * 30; cam.pos.x += (vnoise2(t, 1) - 0.5) * sh * 2; cam.pos.y += (vnoise2(t, 7) - 0.5) * sh * 2; }
    const roll = (P.bank || 0) * 0.18;
    cam.up.set(Math.sin(-roll), Math.cos(roll), 0);
    cam.fov = (54 + (this.phase === 'boss' ? 4 : 0) + this.fovKick) * DEG;
  },

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  render(dt) {
    const r = this.renderer;
    if (r.lost) return;
    // viewport + resolution
    r.resize(Screen.cssW, Screen.cssH, Screen.dpr, this.settings.res || 0, this.quality);
    const st = this.state;
    if (st === 'hangar') this.hangarCamera(r);
    const env = this.env || ENVS.brief;
    const cam = this.cam;
    // portrait: widen vertical fov so the playfield stays visible
    const aspect = r.sceneW / r.sceneH, baseFov = cam.fov;
    if (aspect < 1) cam.fov = Math.min(100 * DEG, 2 * Math.atan(Math.tan(cam.fov / 2) * 1.55 / Math.max(0.5, aspect)));
    r.begin(cam, env);
    cam.fov = baseFov;
    this.frustum.setFrom(cam.viewProj);
    r.drawSky(env.sky, this.realTime);
    // distant planets
    for (const b of env.bg || []) {
      const M = _M;
      const px = cam.pos.x + b.dir[0] * b.dist, py = cam.pos.y + b.dir[1] * b.dist, pz = cam.pos.z + b.dir[2] * b.dist;
      m4euler(M, px, py, pz, this.realTime * 0.01, b.tilt || 0, b.tilt || 0, b.scale);
      r.draw(MODELS.planet, M, { tint: [b.tint[0], b.tint[1], b.tint[2], 1], emis: b.emis, fog: 0, tex: TEX.detail, texMix: 0.45, uvScale: [2, 1] });
      if (b.ring) { m4euler(M, px, py, pz, 0.3, b.tilt || 0, 0.2, b.scale); r.draw(MODELS.planetRing, M, { fog: 0, tint: [0.9, 0.8, 0.7, 1] }); }
    }
    if (st === 'play' || st === 'title' || st === 'results' || st === 'ending' || st === 'gameover') {
      this.terrain.draw(r, cam, this.frustum);
      for (const p of this.props) if (this.frustum.sphere(p.x, p.y + 10, p.z, 40 * p.scale)) this.drawProp(r, p);
      for (const p of this.pickups) p.draw(r);
      for (const e of this.enemies) if (this.frustum.sphere(e.wx, e.wy, e.wz, e.r * 2 + 4)) e.draw(r);
      if (this.boss) this.boss.draw(r);
      for (const w of this.wingmen) w.draw(r);
      if (st !== 'gameover') this.player.draw(r);
      FX.drawMeshes(r);
      this.terrain.drawWater(r, cam, this.realTime);
      this.drawProjectiles(r);
    } else if (st === 'brief') {
      this.drawBriefScene(r);
    } else if (st === 'hangar') {
      this.drawHangarScene(r);
    } else if (st === 'logo') {
      FX.update(dt, cam);
    }
    FX.draw(r, dt, this.speed);
    r.flushTrails();
    r.flushSprites();
    // screen-anchored 3D (title logo etc.)
    if (st === 'title' || st === 'logo' || (st === 'ending' && this.endingT > 1)) this.drawLogo3D(r);
    // post
    const post = _post;
    post.scan = this.settings.crt ? 1 : 0;
    post.sat = this.saturation;
    post.vig = 0.35;
    post.ab = this.aberration;
    post.flashA = Math.min(this.flashA, this.settings.flash ? 1 : 0.25);
    post.flashCol = this.flashCol;
    post.glitch = this.glitch + (this.state === 'play' && this.player.shield < this.player.maxShield * 0.25 && this.player.alive ? 0.08 : 0);
    post.bright = st === 'boot' ? 0.25 : 1;
    const sh = post.shocks; sh.fill(0);
    this.shocks.forEach((w, i) => {
      if (!cam.project(_q, w.x, w.y, w.z)) return;
      const k = w.t / w.max;
      sh[i * 4] = _q.x; sh[i * 4 + 1] = 1 - _q.y; sh[i * 4 + 2] = easeOutCubic(k) * 0.55; sh[i * 4 + 3] = w.str * (1 - k) * (1 - k);
    });
    r.end(post, this.realTime);
  },
  drawProp(r, p) {
    if (p.kind === 'vent') {
      m4euler(_M, p.x, p.y, p.z, 0, 0, 0, 1); r.draw(MODELS.vent, _M);
      if (p.erupt > 0) { m4euler(_M, p.x, p.y + 4, p.z, this.realTime * 3, 0, 0, 1); _M[5] *= 55 * Math.min(1, p.erupt * 3); r.draw(MODELS.geyser, _M, { blend: 'add', tint: [1, 0.7, 0.4, 0.9], cull: false }); }
      else if (this.beatIndex % 4 === 1 || this.beatIndex % 4 === 3) { r.sprite(p.x, p.y + 5, p.z, 5, 5, 0, SPR.GLOW, 1, 0.4, 0.1, 0.6 * (1 - Music.beatPhase())); }
      return;
    }
    p.draw(r);
  },
  drawProjectiles(r) {
    const R = this.rail;
    for (const b of this.pbullets) {
      R.world(_p, b.d, b.x, b.y);
      const c = b.col || (b.lv >= 3 ? [0.4, 0.8, 1] : [0.45, 1, 0.5]), w = b.w || 0.45;
      const k = 0.014;
      r.streak(_p.x, _p.y, _p.z, -(R.slope(b.d)[0] * b.vd + b.vx) * k, -(b.vy) * k, b.vd * k, w, SPR.BOLT, c[0], c[1], c[2], 1);
      r.sprite(_p.x, _p.y, _p.z, 1.1 + w, 1.1 + w, 0, SPR.GLOW, c[0], c[1], c[2], 0.6);
    }
    const pulse = 0.8 + 0.2 * Math.sin(this.realTime * 20);
    for (const b of this.ebullets) {
      R.world(_p, b.d, b.x, b.y);
      if (b.kind === 'beam') { r.streak(_p.x, _p.y, _p.z, -b.vx * 0.03, -b.vy * 0.03, (b.vd - this.speed) * 0.03, 0.9, SPR.BOLT, 1, 0.25, 0.3, 1); continue; }
      if (b.kind === 'shard') { r.sprite(_p.x, _p.y, _p.z, 1.8, 1.8, this.realTime * 6, SPR.DIAMOND, 0.6, 0.95, 1, 1); r.sprite(_p.x, _p.y, _p.z, 2.6, 2.6, 0, SPR.GLOW, 0.4, 0.8, 1, 0.6); continue; }
      r.sprite(_p.x, _p.y, _p.z, 2.4 * pulse, 2.4 * pulse, 0, SPR.ORB, 1, 0.25, 0.65, 1);
      r.sprite(_p.x, _p.y, _p.z, 0.9, 0.9, 0, SPR.DOT, 1, 1, 1, 1);
    }
    for (const h of this.homing) {
      if (h.t < 0) continue;
      R.world(_p, h.d, h.x, h.y);
      r.sprite(_p.x, _p.y, _p.z, 1.8, 1.8, 0, SPR.GLOW, 0.7, 1, 0.9, 1);
    }
    FX.drawTrails(r);
    if (this.bomb) { const b = this.bomb; R.world(_p, b.d, b.x, b.y); r.sprite(_p.x, _p.y, _p.z, 3 + Math.sin(this.realTime * 30), 3, 0, SPR.GLOW, 0.7, 0.9, 1, 1); r.sprite(_p.x, _p.y, _p.z, 5, 5, this.realTime * 8, SPR.SPARKLE, 1, 1, 1, 0.8); }
  },
  drawBriefScene(r) {
    const st = STAGES[this.stageIdx], t = this.realTime, M = _M;
    const col = st.planet;
    m4euler(M, -14, -2, -10, t * 0.08, 0.35, 0.1, 22);
    r.draw(MODELS.planet, M, { tint: [col[0], col[1], col[2], 1], tex: TEX.detail, texMix: 0.5, uvScale: [2, 1], fog: 0 });
    if (st.id === 'halo') { m4euler(M, -14, -2, -10, 0.3, 0.35, 0.2, 22); r.draw(MODELS.planetRing, M, { fog: 0, tint: [0.9, 0.8, 0.7, 1] }); }
    // the Cadence cruising past
    m4euler(M, 16 + Math.sin(t * 0.1) * 2, 6 + Math.sin(t * 0.3), 20, -0.9 + Math.sin(t * 0.07) * 0.05, 0.08, Math.sin(t * 0.25) * 0.05, 0.35);
    r.draw(MODELS.cadence, M, { chrome: 0.2 });
    // squadron escort
    [this.player.V.model, 'oz', 'sable', 'tobi'].forEach((m, i) => {
      m4euler(M, 10 + i * 3 + Math.sin(t + i) * 0.4, 9 + (i % 2) * 2 + Math.cos(t * 1.3 + i) * 0.3, 26 - i * 2, -0.9, 0.05, Math.sin(t + i) * 0.2, 0.35);
      r.draw(MODELS[m], M, { chrome: 0.3 });
    });
  },
  drawLogo3D(r) {
    const cam2 = _logoCam;
    cam2.pos.set(0, 0, 60); cam2.target.set(0, 0, 0); cam2.up.set(0, 1, 0); cam2.fov = 30 * DEG;
    r.setOverlayCamera(cam2, LOGO_ENV);
    const st = this.state;
    const t = st === 'logo' ? this.stateT : 99;
    const halfH = 60 * Math.tan(15 * DEG), halfW = halfH * (r.sceneW / r.sceneH);
    const sc = Math.min(0.8, (halfW * 1.8) / 53);
    const portrait = r.sceneW < r.sceneH;
    const k = easeOutBack(clamp01((t - 0.3) / 1.4));
    const M = _M, tt = this.realTime;
    const restY = st === 'logo' ? 3 : portrait ? halfH * 0.5 : halfH * 0.62;
    const logoY = st === 'logo' ? lerp(40, restY, k) : restY;
    m4euler(M, 0, logoY, 0, Math.sin(tt * 0.6) * 0.16 + (1 - k) * 3, Math.sin(tt * 0.4) * 0.08, 0, sc);
    r.draw(this.logoMesh, M, { chrome: 0.35, fog: 0 });
    if (st === 'ending' && this.endingT > 30) return;
    const k2 = easeOutElastic(clamp01((t - 1.2) / 1.2));
    const s64 = Math.min(1.1, (halfW * 0.9) / 11);
    const spinT = (tt % 7) / 7, spin = spinT > 0.82 ? easeInOutCubic((spinT - 0.82) / 0.18) * TAU : 0;
    m4euler(M, 0, logoY - 4.3 * sc - 4.8 * s64, 1, Math.sin(tt * 0.9) * 0.4 + spin + (1 - k2) * 6, 0.22 + Math.sin(tt * 0.7) * 0.08, 0, s64 * k2);
    r.draw(this.logo64, M, { chrome: 0.45, fog: 0 });
  },
};

const PAUSES = { ',': 0.1, '.': 0.2, '!': 0.2, '?': 0.2, '—': 0.14, ':': 0.12 };
const VOWELS = 'aeiou';
const isVowel = (c, prev) => VOWELS.includes(c) || (c === 'y' && /[a-z]/.test(prev) && !VOWELS.includes(prev));
// The vowel that opens a syllable at s[i] ('' if none). Digits count as one
// syllable each; a silent final 'e' after a consonant is skipped.
function syllableAt(s, i) {
  const ch = s[i].toLowerCase(), prev = (s[i - 1] || ' ').toLowerCase();
  if (ch >= '0' && ch <= '9') return prev >= '0' && prev <= '9' ? '' : 'e';
  if (!isVowel(ch, prev) || isVowel(prev, (s[i - 2] || ' ').toLowerCase())) return '';
  if (ch === 'e' && !/[a-z]/i.test(s[i + 1] || ' ') && /[a-z]/.test(prev)) {
    let w = i - 1;
    while (w > 0 && /[a-z]/i.test(s[w - 1])) w--;
    for (let j = w; j < i - 1; j++) if (VOWELS.includes(s[j].toLowerCase())) return '';
  }
  return ch;
}
const _post = { scan: 1, sat: 1, vig: 0.35, ab: 0, flashA: 0, flashCol: [1, 1, 1], glitch: 0, bright: 1, shocks: new Float32Array(12) };
const _logoCam = new Camera();
const LOGO_ENV = { lightDir: new Float32Array([0.28, 0.5, 0.82]), lightCol: new Float32Array([1.0, 0.97, 0.9]), ambient: new Float32Array([0.5, 0.5, 0.62]), fog: new Float32Array([0, 0, 0]), fogNear: 1e4, fogFar: 2e4 };
const LOGO_COLORS = (x, y) => mixc(mixc([0.92, 1, 1], [0.35, 0.8, 1], clamp01(y / 3.5)), [0.3, 0.35, 1], clamp01((y - 3.5) / 3)).map((c, i) => c * (1 - 0.15 * Math.sin(x * 0.15 + i)));
const LOGO64_COLORS = (x, y) => [[1, 0.25, 0.3], [0.2, 0.85, 0.35], [0.25, 0.55, 1], [1, 0.8, 0.1]][(((Math.floor(x / 2) + Math.floor(y / 2)) % 4) + 4) % 4];
function W3(d, x, y) { return Game.rail.world(new V3(), d, x, y); }
