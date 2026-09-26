'use strict';
// =============================================================================
// SYNTHWING 64 — hud.js
// Everything 2D: a pixel-perfect HUD on a low-res canvas scaled up with
// nearest-neighbour filtering. Immediate-mode UI for menus (touch, keyboard,
// gamepad), the comm window with talking portraits, lock-on markers, lens
// flare, touch controls, results, credits.
// =============================================================================

const Screen = { cssW: 1, cssH: 1, dpr: 1, safe: { t: 0, r: 0, b: 0, l: 0 } };

const HUD = {
  canvas: null, g: null, W: 320, H: 240, scale: 1, cssPerPx: 1,
  safe: { t: 0, r: 0, b: 0, l: 0 },
  btns: [], focus: 0, sub: null, gridNav: false,
  bands: new Float32Array(6), bandsS: new Float32Array(6),
  fps: 60, fpsAcc: 0, fpsN: 0, t: 0,
  confirmReset: false, dispScore: undefined, scoreBump: 0, ghost: undefined,

  init(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.probe = document.getElementById('safe-probe');
  },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    Screen.cssW = w; Screen.cssH = h; Screen.dpr = dpr;
    const devW = Math.round(w * dpr), devH = Math.round(h * dpr);
    const short = Math.min(devW, devH);
    const scale = Math.max(1, Math.floor(short / 250));
    const W = Math.ceil(devW / scale), H = Math.ceil(devH / scale);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.canvas.style.width = (W * scale / dpr) + 'px';
    this.canvas.style.height = (H * scale / dpr) + 'px';
    this.W = W; this.H = H; this.scale = scale;
    this.cssPerPx = scale / dpr;
    if (this.probe) {
      const cs = getComputedStyle(this.probe);
      const px = (v) => (parseFloat(v) || 0) / this.cssPerPx;
      this.safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
    }
    Input.toHud = (cx, cy) => [cx / this.cssPerPx, cy / this.cssPerPx];
  },

  // ---- primitives ------------------------------------------------------------
  text(s, x, y, o) { return Font.draw(this.g, s, x, y, o); },
  panel(x, y, w, h, o = {}) {
    const g = this.g;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, o.top || 'rgba(28,34,86,0.86)'); gr.addColorStop(1, o.bot || 'rgba(10,12,40,0.86)');
    g.fillStyle = gr;
    g.fillRect(x + 1, y, w - 2, h); g.fillRect(x, y + 1, w, h - 2);
    g.fillStyle = o.edge || 'rgba(140,200,255,0.9)';
    g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
    g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
    if (o.glow) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, y + 2, w - 4, Math.max(1, Math.floor(h / 3))); }
  },
  rect(x, y, w, h, c) { this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  circle(x, y, r, c, fill = true, lw = 1) {
    const g = this.g; g.beginPath(); g.arc(Math.round(x), Math.round(y), r, 0, TAU);
    if (fill) { g.fillStyle = c; g.fill(); } else { g.strokeStyle = c; g.lineWidth = lw; g.stroke(); }
  },
  // Immediate-mode button. Returns true when activated.
  button(label, x, y, w, h, o = {}) {
    const idx = this.btns.length;
    const r = { x, y, w, h };
    this.btns.push(r);
    const focused = idx === this.focus && Input.lastDevice !== 'touch';
    let hit = false;
    for (const c of Input.clicks) if (c.x >= x && c.y >= y && c.x <= x + w && c.y <= y + h) { hit = true; this.focus = idx; }
    for (const p of Input.pointers.values()) if (p.role === 'ui' && p.x >= x && p.y >= y && p.x <= x + w && p.y <= y + h) r.pressed = true;
    if (focused && Input.nav.ok) hit = true;
    const dis = o.disabled;
    const pulse = focused ? 0.5 + 0.5 * Math.sin(this.t * 8) : 0;
    this.panel(x, y, w, h, {
      top: dis ? 'rgba(40,40,60,0.8)' : r.pressed ? 'rgba(90,140,255,0.95)' : focused ? `rgba(${60 + pulse * 40},${90 + pulse * 40},200,0.95)` : o.top || 'rgba(34,44,110,0.9)',
      bot: dis ? 'rgba(20,20,30,0.8)' : o.bot || 'rgba(14,16,52,0.9)',
      edge: dis ? 'rgba(90,90,110,0.9)' : focused ? '#ffe14a' : o.edge || 'rgba(140,200,255,0.9)', glow: true,
    });
    let s = o.scale || (h >= 20 ? 2 : 1);
    if (s > 1 && Font.width(label, s) > w - 20) s = 1;
    this.text(label, x + w / 2, y + Math.round((h - 7 * s) / 2), { scale: s, align: 'center', color: dis ? '#6a6a80' : o.color || ['#ffffff', '#bfe0ff'], outline: '#0a0a20' });
    if (focused) { this.text('▶', x - 8, y + Math.round((h - 7) / 2), { color: '#ffe14a' }); }
    if (hit && !dis) { SFX.menuOk(); Haptics.ui(); return true; }
    if (hit && dis) SFX.menuBack();
    return false;
  },
  navigate() {
    const n = this.btns.length;
    if (!n) return;
    if (Input.nav.down || Input.nav.right && this.gridNav) { this.focus = (this.focus + 1) % n; SFX.menuMove(); }
    if (Input.nav.up || Input.nav.left && this.gridNav) { this.focus = (this.focus - 1 + n) % n; SFX.menuMove(); }
    if (this.focus >= n) this.focus = n - 1;
  },
  beginMenu() { this.btns = []; this.gridNav = false; },
  endMenu() { this.navigate(); },

  // ---- main draw ---------------------------------------------------------------
  draw(dt) {
    this.t += dt;
    const g = this.g, G = Game;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, this.W, this.H);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.layout();
    const st = G.state;
    this.beginMenu();
    if (st === 'boot') this.drawBoot();
    else if (st === 'logo') this.drawLogo();
    else if (st === 'title') { if (this.sub) this.drawSub(); else this.drawTitle(); }
    else if (st === 'brief') this.drawBrief();
    else if (st === 'play') { this.drawPlay(dt); if (G.overlay) { if (this.sub) this.drawSub(); else this.drawPause(); } }
    else if (st === 'results') this.drawResults();
    else if (st === 'gameover') this.drawGameOver();
    else if (st === 'ending') this.drawEnding();
    this.endMenu();
    if (G.settings.fps) this.text(Math.round(this.fps) + ' FPS  ' + G.renderer.stats.draws + ' DC  ' + G.renderer.sceneW + 'x' + G.renderer.sceneH, this.safe.l + 2, this.H - 9 - this.safe.b, { color: '#9f9', outline: '#000' });
  },

  // Touch-control layout, shared with Input.
  layout() {
    const W = this.W, H = this.H, s = this.safe;
    const land = W > H;
    const lefty = Game.settings.lefty;
    const fx = land ? W - s.r - 40 : W - s.r - 38;
    const fy = H - s.b - (land ? 40 : 58);
    const mx = (x) => (lefty ? W - x : x);
    const L = {
      W, H, leftHanded: lefty, stickR: 26,
      fire: { x: mx(fx), y: fy, r: 25 },
      bomb: { x: mx(fx - 12), y: fy - 50, r: 14 },
      roll: { x: mx(fx - 50), y: fy + 8, r: 14 },
      pause: { x: lefty ? s.l + 4 : W - s.r - 22, y: s.t + 4, w: 18, h: 18 },
    };
    Input.layout = L;
    this.L = L;
  },

  // ---- boot / logo -------------------------------------------------------------
  drawBoot() {
    const W = this.W, H = this.H, cx = W / 2;
    this.rect(0, 0, W, H, '#05040c');
    for (let i = 0; i < 60; i++) { const x = (hash2i(i, 3) * W) | 0, y = (hash2i(i, 9) * H) | 0; this.rect(x, y, 1, 1, `rgba(200,220,255,${0.3 + 0.5 * Math.abs(Math.sin(this.t + i))})`); }
    this.text('SYNTHWING', cx, H * 0.26, { scale: 3, align: 'center', color: ['#c9f4ff', '#5fa8ff', '#3a4fd8'], outline: '#0a0a20', thick: true });
    this.text('64', cx, H * 0.26 + 26, { scale: 3, align: 'center', color: ['#ffe14a', '#ff5a3c'], outline: '#0a0a20', thick: true });
    const verb = Input.lastDevice === 'keyboard' || Input.lastDevice === 'mouse' ? 'PRESS ENTER OR CLICK' : 'TAP TO START';
    this.g.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(this.t * 4));
    this.text(verb, cx, H * 0.62, { scale: 2, align: 'center', color: '#ffffff', outline: '#000' });
    this.g.globalAlpha = 1;
    if (W < H) this.text('Best played in landscape', cx, H - this.safe.b - 12, { align: 'center', color: '#ffe14a' });
    else if (this.canInstall()) this.text('Share ▶ Add to Home Screen to play fullscreen', cx, H - this.safe.b - 12, { align: 'center', color: '#7a8aa0' });
  },
  // iOS Safari, top-level page, not already installed: fullscreen is one step away.
  canInstall() {
    if (this._canInstall !== undefined) return this._canInstall;
    let top = false;
    try { top = window.top === window.self; } catch (e) { top = false; }
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    this._canInstall = !!(top && isIOS && !standalone);
    return this._canInstall;
  },
  drawLogo() {
    const t = Game.stateT, cx = this.W / 2;
    if (t > 2.2) {
      const a = clamp01((t - 2.2) * 2);
      this.g.globalAlpha = a;
      this.text('A SQUADRON OF SOUND', cx, this.H * 0.88, { scale: 1, align: 'center', color: '#bfe0ff', outline: '#000', spacing: 1 });
      this.g.globalAlpha = 1;
    }
  },

  // ---- title -------------------------------------------------------------------
  drawTitle() {
    const G = Game, W = this.W, H = this.H, s = this.safe, land = W > H;
    this.lensFlare();
    const items = [
      ['START GAME', () => this.newGame()],
      ['STAGE SELECT', () => { this.sub = 'stages'; this.focus = 0; }],
      ['SETTINGS', () => { this.sub = 'settings'; this.focus = 0; }],
      ['HOW TO PLAY', () => { this.sub = 'howto'; this.focus = 0; }],
      ['CREDITS', () => { this.sub = 'credits'; this.focus = 0; }],
    ];
    if (land) {
      // compact grid under the logo: one hero button, then two rows of two
      const bw = 154, gap = 6, y0 = H - s.b - 80;
      if (this.button(items[0][0], W / 2 - 88, y0, 176, 24, { top: 'rgba(60,70,170,0.95)', edge: '#ffe14a' })) items[0][1]();
      for (let i = 1; i < 5; i++) {
        const c = (i - 1) % 2, r = Math.floor((i - 1) / 2);
        if (this.button(items[i][0], W / 2 + (c ? gap / 2 : -bw - gap / 2), y0 + 30 + r * 25, bw, 20)) items[i][1]();
      }
    } else {
      const bw = Math.min(180, W - 40), bh = 24, gap = 6, y0 = H * 0.6;
      items.forEach(([label, fn], i) => { if (this.button(label, W / 2 - bw / 2, y0 + i * (bh + gap), bw, bh, i ? {} : { top: 'rgba(60,70,170,0.95)', edge: '#ffe14a' })) fn(); });
    }
    if (G.save.hiscore) this.text('HI-SCORE ' + String(G.save.hiscore).padStart(7, '0'), W - s.r - 6, s.t + 6, { align: 'right', color: ['#fff6c0', '#ffc040'], outline: '#201000' });
    const medals = Object.keys(G.save.medals).length, forks = Object.keys(G.save.forks).length;
    if (medals || forks) this.text('★' + medals + '/5   ♪' + forks + '/5', s.l + 6, s.t + 6, { color: '#ffe14a', outline: '#201000' });
  },
  newGame() {
    const G = Game;
    G.score = 0; G.player.reset(true); G.wingmen = []; G.stageIdx = 0; G.said.clear();
    G.setState('brief');
  },
  playStage(i) {
    const G = Game;
    G.score = 0; G.player.reset(true); G.wingmen = []; G.stageIdx = i; G.said.clear();
    this.sub = null;
    G.setState('brief');
  },

  // ---- sub screens (title & pause) -------------------------------------------------
  drawSub() {
    this.rect(0, 0, this.W, this.H, 'rgba(4,6,20,0.72)');
    if (this.sub === 'settings') this.drawSettings();
    else if (this.sub === 'stages') this.drawStages();
    else if (this.sub === 'howto') this.drawHowTo();
    else if (this.sub === 'credits') this.drawCredits(false);
    if (Input.nav.back) { this.sub = null; this.focus = 0; SFX.menuBack(); }
  },
  backButton() {
    const s = this.safe;
    if (this.button('◀ BACK', s.l + 6, s.t + 6, 64, 20)) { this.sub = null; this.focus = 0; this.confirmReset = false; }
  },
  header(t) { this.text(t, this.W / 2, this.safe.t + 10, { scale: 2, align: 'center', color: ['#ffffff', '#9fd0ff'], outline: '#0a0a20', thick: true }); },
  drawSettings() {
    const G = Game, S = G.settings, W = this.W, H = this.H, s = this.safe, land = W > H;
    this.header('SETTINGS');
    this.backButton();
    const opts = [
      ['STEERING', S.steer === 'stick' ? 'ANALOG STICK' : 'TOUCHPAD', () => { S.steer = S.steer === 'stick' ? 'pad' : 'stick'; }],
      ['SENSITIVITY', '●'.repeat(S.sens) + '-'.repeat(5 - S.sens), (d) => { S.sens = clamp(S.sens + d, 1, 5); }],
      ['INVERT Y', S.invertY ? 'ON' : 'OFF', () => { S.invertY = !S.invertY; }],
      ['FIRE BUTTON', S.lefty ? 'LEFT HAND' : 'RIGHT HAND', () => { S.lefty = !S.lefty; }],
      ['DIFFICULTY', DIFFS[S.diff].name, (d) => { S.diff = (S.diff + d + 3) % 3; }],
      ['RESOLUTION', S.res === 240 ? '240p RETRO' : S.res === 360 ? '360p' : S.res === 480 ? '480p' : 'NATIVE HD', (d) => { const L = [0, 480, 360, 240]; S.res = L[(Math.max(0, L.indexOf(S.res)) + d + 4) % 4]; }],
      ['CRT SCANLINES', S.crt ? 'ON' : 'OFF', () => { S.crt = !S.crt; }],
      ['16-BIT DITHER', S.dither ? 'ON' : 'OFF', () => { S.dither = !S.dither; }],
      ['SCREEN SHAKE', S.shake ? 'ON' : 'OFF', () => { S.shake = !S.shake; }],
      ['FLASHES', S.flash ? 'FULL' : 'REDUCED', () => { S.flash = !S.flash; }],
      ['MUSIC', String(S.music), (d) => { S.music = clamp(S.music + d, 0, 10); }],
      ['SOUND FX', String(S.sfx), (d) => { S.sfx = clamp(S.sfx + d, 0, 10); }],
      ['VOICES', String(S.voice), (d) => { S.voice = clamp(S.voice + d, 0, 10); }],
      ['HAPTICS', ['OFF', 'LIGHT', 'FULL'][S.haptics], (d) => { S.haptics = (S.haptics + d + 3) % 3; }],
      ['SHOW FPS', S.fps ? 'ON' : 'OFF', () => { S.fps = !S.fps; }],
    ];
    const cols = land ? 2 : 1;
    const colW = land ? Math.min(210, (W - s.l - s.r - 24) / 2) : Math.min(230, W - 24);
    const rows = Math.ceil(opts.length / cols);
    const x0 = W / 2 - (colW * cols + (cols - 1) * 8) / 2, y0 = s.t + 34;
    // squeeze the rows (down to 17px) rather than lose any on short screens
    const room = H - s.b - (G.state === 'title' ? 28 : 4) - y0;
    const pitch = clamp(Math.floor(room / rows), 20, 24), rowH = pitch - 3, gapY = 3;
    opts.forEach(([label, val, fn], i) => {
      const c = land ? Math.floor(i / rows) : 0, rI = land ? i % rows : i;
      const x = x0 + c * (colW + 8), y = y0 + rI * (rowH + gapY);
      if (y + rowH > H - s.b - (G.state === 'title' ? 28 : 4)) return;
      const idx = this.btns.length;
      const focused = idx === this.focus && Input.lastDevice !== 'touch';
      this.btns.push({ x, y, w: colW, h: rowH });
      this.panel(x, y, colW, rowH, { edge: focused ? '#ffe14a' : 'rgba(120,170,255,0.8)', top: 'rgba(30,38,96,0.9)', bot: 'rgba(12,14,44,0.9)' });
      const ty = y + Math.round((rowH - 7) / 2);
      this.text(label, x + 6, ty, { color: '#bfe0ff' });
      this.text('◀ ' + val + ' ▶', x + colW - 6, ty, { align: 'right', color: '#ffffff' });
      let d = 0;
      for (const cl of Input.clicks) if (cl.x >= x && cl.y >= y && cl.x <= x + colW && cl.y <= y + rowH) { this.focus = idx; d = cl.x < x + colW * 0.62 ? -1 : 1; }
      if (focused && (Input.nav.left)) d = -1;
      if (focused && (Input.nav.right || Input.nav.ok)) d = 1;
      if (d) { fn(d); G.applySettings(); G.writeSave(); SFX.menuMove(); Haptics.ui(); }
    });
    if (G.state === 'title') {
      const by = H - s.b - 24;
      if (this.button(this.confirmReset ? 'TAP AGAIN TO ERASE SAVE' : 'RESET PROGRESS', W / 2 - 90, by, 180, 20, { top: 'rgba(110,20,40,0.9)', bot: 'rgba(50,8,20,0.9)', edge: '#ff7a7a' })) {
        if (this.confirmReset) { const keep = G.settings; G.save = { unlocked: 1, best: {}, medals: {}, forks: {}, cleared: false, hiscore: 0, gold: false, plays: 0 }; G.settings = keep; G.writeSave(); this.confirmReset = false; G.banner('PROGRESS ERASED', '#ff7a7a'); }
        else this.confirmReset = true;
      }
    }
  },
  drawStages() {
    const G = Game, W = this.W, H = this.H, s = this.safe, land = W > H;
    this.header('STAGE SELECT');
    this.backButton();
    const n = STAGES.length;
    const cw = land ? Math.min(96, (W - s.l - s.r - 30) / n - 6) : Math.min(260, W - 30), ch = land ? 118 : 44;
    this.gridNav = true;
    STAGES.forEach((st, i) => {
      const unlocked = i < G.save.unlocked;
      const x = land ? W / 2 - (n * (cw + 6) - 6) / 2 + i * (cw + 6) : W / 2 - cw / 2;
      const y = land ? s.t + 40 : s.t + 36 + i * (ch + 6);
      const idx = this.btns.length, focused = idx === this.focus && Input.lastDevice !== 'touch';
      this.btns.push({ x, y, w: cw, h: ch });
      this.panel(x, y, cw, ch, { edge: focused ? '#ffe14a' : unlocked ? 'rgba(140,200,255,0.9)' : 'rgba(80,80,100,0.9)', glow: true });
      const pc = st.planet, px = land ? x + cw / 2 : x + 22, py = land ? y + 30 : y + ch / 2;
      if (unlocked) {
        this.pixelPlanet(px, py, land ? 18 : 15, pc, i);
        const tx = land ? x + cw / 2 : x + 46, al = land ? 'center' : 'left';
        this.text('STAGE ' + (i + 1), tx, land ? y + 56 : y + 6, { align: al, color: '#9fd0ff' });
        const nm = st.name.replace('THE ', '');
        this.text(nm, tx, land ? y + 68 : y + 17, { align: al, color: '#ffffff', outline: '#0a0a20' });
        const best = G.save.best[st.id] || 0;
        this.text(best ? String(best) : '------', tx, land ? y + 84 : y + 29, { align: al, color: '#ffe14a' });
        const badges = (G.save.medals[st.id] ? '★' : '·') + ' ' + (G.save.forks[st.id] ? '♪' : '·');
        this.text(badges, land ? x + cw / 2 : x + cw - 8, land ? y + 100 : y + 17, { align: land ? 'center' : 'right', color: G.save.medals[st.id] ? '#ffe14a' : '#667' });
      } else {
        this.circle(px, py, land ? 18 : 15, '#222236');
        this.text('?', px, py - 3, { align: 'center', color: '#667' });
        this.text('LOCKED', land ? x + cw / 2 : x + 46, land ? y + 68 : y + 17, { align: land ? 'center' : 'left', color: '#667' });
      }
      let hit = false;
      for (const cl of Input.clicks) if (cl.x >= x && cl.y >= y && cl.x <= x + cw && cl.y <= y + ch) { hit = true; this.focus = idx; }
      if (focused && Input.nav.ok) hit = true;
      if (hit) { if (unlocked) { SFX.menuOk(); this.playStage(i); } else SFX.menuBack(); }
    });
  },
  pixelPlanet(x, y, r, c, seed) {
    const g = this.g;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j); if (d > r) continue;
      const n = vnoise2((i + this.t * 3) * 0.25 + seed * 10, j * 0.25);
      const light = clamp01(1.1 - Math.hypot(i + r * 0.4, j + r * 0.4) / (r * 1.6));
      const k = 0.35 + light * 0.75 + (n > 0.55 ? 0.12 : 0);
      g.fillStyle = cssColor([c[0] * k, c[1] * k, c[2] * k]);
      g.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
    }
  },
  drawHowTo() {
    const W = this.W, H = this.H, s = this.safe, land = W > H;
    this.header('HOW TO PLAY');
    this.backButton();
    const touch = Input.lastDevice === 'touch' || Input.touchSeen;
    const lines = touch ? [
      ['STEER', 'Drag anywhere on the left half of the screen.'],
      ['FIRE', 'Tap FIRE, or anywhere on the right half, to shoot.'],
      ['LOCK-ON', 'HOLD FIRE and sweep the reticle over enemies to paint up to 8 targets. Let go to launch a homing volley!'],
      ['ROLL', 'Tap ROLL, double-tap or flick the left side. A barrel roll deflects enemy shots back at them.'],
      ['BOMB', 'Tap BOMB to detonate a Nova Bomb.'],
    ] : [
      ['STEER', 'WASD / arrow keys, or a gamepad stick.'],
      ['FIRE', 'SPACE / J (gamepad A). Hold to lock on, release to launch a volley.'],
      ['ROLL', 'SHIFT / L, or Q and E for a direction (gamepad LB / RB).'],
      ['BOMB', 'K / X (gamepad B).   PAUSE: ESC / P'],
    ];
    const tips = [
      ['RESONANCE', 'Every kill builds Resonance. Each level adds a layer to the music and raises your multiplier, up to ×5. Getting hit drops a level.'],
      ['RINGS', 'Silver rings repair your shield. Every 3 gold rings make it bigger.'],
      ['SECRETS', 'Each world hides a golden tuning fork. Find all five!'],
    ];
    let y = s.t + 34;
    const colW = land ? 64 : 58;
    const x = Math.max(s.l + 10, W / 2 - (land ? 200 : 125));
    const textW = Math.min(land ? 330 : 250, W - x - colW - s.r - 8);
    for (const [k, v] of lines.concat([['', '']], tips)) {
      if (y > H - s.b - 10) break;
      if (k) this.text(k, x, y, { color: '#ffe14a', outline: '#000' });
      const wrapped = Font.wrap(v, textW);
      for (const ln of wrapped) { this.text(ln, x + colW, y, { color: '#ffffff', outline: '#000' }); y += 9; }
      y += wrapped.length ? 3 : 2;
    }
  },
  drawCredits(ending) {
    const W = this.W, H = this.H, s = this.safe;
    if (!ending) { this.header('CREDITS'); this.backButton(); }
    const L = CREDITS;
    const scroll = ending ? Math.max(0, (Game.endingT - 3) * 14) : 0;
    let y = ending ? H + 10 - scroll : s.t + 40;
    for (const [style, str] of L) {
      if (y > -20 && y < H + 20) {
        if (style === 'h') this.text(str, W / 2, y, { scale: 2, align: 'center', color: ['#ffffff', '#9fd0ff'], outline: '#0a0a20', thick: true });
        else if (style === 'y') this.text(str, W / 2, y, { align: 'center', color: '#ffe14a', outline: '#000' });
        else this.text(str, W / 2, y, { align: 'center', color: '#ffffff', outline: '#000' });
      }
      y += style === 'h' ? 22 : style === 's' ? 6 : 11;
      if (!ending && y > H - s.b - 8) break;
    }
    return y;
  },

  // ---- briefing ----------------------------------------------------------------
  drawBrief() {
    const G = Game, st = STAGES[G.stageIdx], W = this.W, H = this.H, s = this.safe;
    const k = easeOutCubic(clamp01(G.stateT / 0.8));
    const x = lerp(-200, s.l + 12, k);
    this.text('STAGE ' + st.num, x, s.t + 10, { scale: 2, color: ['#9fd0ff', '#4a7aff'], outline: '#0a0a20', thick: true });
    this.text(st.name, x, s.t + 28, { scale: 3, color: ['#ffffff', '#ffe14a', '#ff8a2a'], outline: '#1a0a00', thick: true });
    this.text(st.sub, x, s.t + 52, { color: '#bfe0ff', outline: '#000' });
    const best = G.save.best[st.id];
    if (best) this.text('BEST ' + best + (G.save.medals[st.id] ? '  ★' : ''), x, s.t + 64, { color: '#ffe14a', outline: '#000' });
    this.text('★ MEDAL  ' + st.medal + ' PTS · NO WINGMAN LOST', x, s.t + 76, { color: 'rgba(200,220,255,0.7)', outline: '#000' });
    this.drawDialog();
    if (G.briefDone && Math.floor(this.t * 2.5) % 2 === 0) this.text(Input.lastDevice === 'touch' ? 'TAP TO LAUNCH' : 'PRESS ENTER TO LAUNCH', W / 2, H - s.b - 20, { scale: 2, align: 'center', color: ['#ffffff', '#ffe14a'], outline: '#1a0a00', thick: true });
  },

  // ---- gameplay HUD ------------------------------------------------------------------
  drawPlay(dt) {
    const G = Game, P = G.player, W = this.W, H = this.H, s = this.safe, g = this.g;
    const cam = G.cam;
    this.lensFlare();
    // reticle (projected 3D points along the aim)
    if (P.alive && G.phase !== 'clear' && G.phase !== 'intro') {
      const near = W3(P.d + 18, P.x + P.aimX * 18, P.y + P.aimY * 18);
      const far = W3(P.d + 45, P.x + P.aimX * 45, P.y + P.aimY * 45);
      const hot = G.findNearReticle(0.075);
      const col = hot ? '#ff4a6a' : '#6dff8a';
      if (cam.project(_q, far.x, far.y, far.z)) {
        G.reticle.nx = _q.x; G.reticle.ny = _q.y; G.reticle.ok = true;
        const x = _q.x * W, y = _q.y * H;
        this.bracket(x, y, 7, col);
        if (Input.fire && P.holdT > 0.2) { this.circle(x, y, 14 + Math.sin(this.t * 12) * 1.5, 'rgba(255,120,200,0.8)', false); this.text(P.locks.length + '/8', x + 12, y + 8, { color: '#ff9ad0', outline: '#000' }); }
      } else G.reticle.ok = false;
      if (cam.project(_q, near.x, near.y, near.z)) this.bracket(_q.x * W, _q.y * H, 11, col, true);
    }
    // lock-on markers
    const lockables = G.enemies.concat(G.boss ? G.boss.parts : []);
    for (const e of lockables) {
      if (!e.lockCount) continue;
      let wx = e.wx, wy = e.wy, wz = e.wz;
      if (e.isPart) { const w = W3(e.d, e.x, e.y); wx = w.x; wy = w.y; wz = w.z; }
      if (!cam.project(_q, wx, wy, wz)) continue;
      const x = _q.x * W, y = _q.y * H, a = this.t * 4, r = 8 + e.lockPulse * 6;
      g.strokeStyle = '#ff5ad0'; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 4; i++) { const aa = a + (i / 4) * TAU; g.moveTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); g.lineTo(x + Math.cos(aa + 0.5) * (r + 3), y + Math.sin(aa + 0.5) * (r + 3)); }
      g.stroke();
      if (e.lockCount > 1) this.text('×' + e.lockCount, x + r + 2, y - 3, { color: '#ff9ad0', outline: '#000' });
    }
    // wingman help tags & big-enemy health
    for (const w of G.wingmen) {
      if (w.state !== 'trouble' || !w.vis) continue;
      const p = W3(w.d, w.x, w.y);
      if (cam.project(_q, p.x, p.y, p.z)) {
        const x = _q.x * W, y = _q.y * H;
        if (Math.floor(this.t * 4) % 2) this.text('HELP!', x, y - 16, { align: 'center', color: '#ffe14a', outline: '#000' });
        g.drawImage(Portraits.get(w.who, false, false), Math.round(x - 10), Math.round(y - 42), 20, 20);
      }
    }
    for (const e of G.enemies) {
      if (!e.T.big || e.dead || e.hp >= e.maxHp || e.type === 'bigrock') continue;
      if (!cam.project(_q, e.wx, e.wy + e.r, e.wz)) continue;
      const x = _q.x * W - 15, y = _q.y * H - 8;
      this.rect(x - 1, y - 1, 32, 4, '#000'); this.rect(x, y, 30 * e.hp / e.maxHp, 2, '#ff5a8a');
    }
    // floating score text
    for (const t of FX.texts) {
      if (!cam.project(_q, t.x, t.y, t.z)) continue;
      const a = 1 - t.t / t.max;
      g.globalAlpha = clamp01(a * 2);
      const popped = t.t < 0.1; // pop in one size bigger, then settle
      this.text(t.str, _q.x * W, _q.y * H - (popped ? 4 : 0), { align: 'center', color: t.col, outline: '#000', scale: (t.big ? 2 : 1) + (popped ? 1 : 0) });
      g.globalAlpha = 1;
    }
    // --- top-left: shield, lives, bombs
    const x0 = s.l + (G.settings.lefty ? 28 : 6), y0 = s.t + 5; // the pause button sits top-left in the left-handed layout
    this.text('SHIELD', x0, y0, { color: '#bfe0ff', outline: '#0a0a20' });
    const bw = Math.round(60 * P.maxShield / 100), frac = P.shield / P.maxShield;
    this.ghost = Math.max(frac, (this.ghost === undefined ? frac : this.ghost) - dt * 0.35);
    this.rect(x0 - 1, y0 + 9, bw + 2, 7, '#0a0a20');
    if (this.ghost > frac) this.rect(x0 + Math.round(bw * frac), y0 + 10, Math.round(bw * (this.ghost - frac)), 5, Math.floor(this.t * 12) % 2 ? '#ffd0e0' : '#ff6a8a');
    const low = frac < 0.3;
    const fill = low ? (Math.floor(this.t * 6) % 2 ? '#ff3a4a' : '#ff9a4a') : null;
    const gr = g.createLinearGradient(0, y0 + 10, 0, y0 + 15); gr.addColorStop(0, '#9ff6ff'); gr.addColorStop(1, '#2a7aff');
    g.fillStyle = fill || gr; g.fillRect(x0, y0 + 10, Math.round(bw * frac), 5);
    for (let i = 1; i < P.maxShield / 25; i++) this.rect(x0 + Math.round(i * 25 * bw / P.maxShield), y0 + 10, 1, 5, 'rgba(0,0,30,0.6)');
    let lx = x0;
    for (let i = 0; i < Math.max(0, P.lives); i++) { this.shipIcon(lx, y0 + 20); lx += 12; }
    for (let i = 0; i < P.bombs; i++) this.bombIcon(x0 + i * 9, y0 + 30);
    if (P.golds % 3) for (let i = 0; i < 3; i++) this.circle(x0 + bw + 8 + i * 6, y0 + 12, 2, i < P.golds % 3 ? '#ffd23f' : 'rgba(255,210,63,0.25)');
    // --- top-right: score
    const rx = W - s.r - (Game.settings.lefty ? 6 : 28);
    this.text('SCORE', rx, y0, { align: 'right', color: '#bfe0ff', outline: '#0a0a20' });
    if (this.dispScore === undefined || G.score < this.dispScore) this.dispScore = G.score;
    const before = this.dispScore;
    this.dispScore = Math.min(G.score, this.dispScore + Math.max(1, Math.ceil((G.score - this.dispScore) * Math.min(1, dt * 10))));
    if (this.dispScore > before) this.scoreBump = 1;
    this.scoreBump = Math.max(0, (this.scoreBump || 0) - dt * 6);
    this.text(String(this.dispScore).padStart(7, '0'), rx, y0 + 9 - Math.round(this.scoreBump * 2), { align: 'right', scale: 2, color: this.scoreBump > 0.5 ? ['#ffffff', '#ffffff'] : ['#ffffff', '#ffe14a'], outline: '#1a0a00' });
    const m = G.mult();
    if (m > 1) this.text('×' + m, rx, y0 + 26, { align: 'right', scale: m >= 5 ? 2 : 1, color: m >= 5 ? this.rainbow() : '#9ff6ff', outline: '#000' });
    // pause button
    if (Input.lastDevice === 'touch' || Input.touchSeen) {
      const pb = this.L.pause;
      this.panel(pb.x, pb.y, pb.w, pb.h, { top: 'rgba(30,40,100,0.7)', bot: 'rgba(10,12,40,0.7)' });
      this.rect(pb.x + 6, pb.y + 5, 2, 8, '#fff'); this.rect(pb.x + 10, pb.y + 5, 2, 8, '#fff');
    }
    // --- bottom-center: resonance EQ
    this.drawResonance();
    // --- boss health
    if (G.boss && !G.boss.entering && !G.boss.dead) {
      const bwid = Math.min(180, W * 0.42), bx = W / 2 - bwid / 2, by = H - s.b - 48;
      this.text(G.boss.name, W / 2, by - 10, { align: 'center', color: '#ff9ad0', outline: '#000' });
      this.rect(bx - 1, by - 1, bwid + 2, 6, '#000');
      const hp = G.boss.health;
      const grb = g.createLinearGradient(bx, 0, bx + bwid, 0); grb.addColorStop(0, '#ff2fa0'); grb.addColorStop(1, '#ff9a4a');
      g.fillStyle = grb; g.fillRect(bx, by, Math.round(bwid * hp), 4);
    }
    this.drawComm(dt);
    // banners
    G.banners.forEach((b, i) => {
      const a = b.t < 0.2 ? b.t / 0.2 : b.t > 1.4 ? 1 - (b.t - 1.4) / 0.4 : 1;
      g.globalAlpha = clamp01(a);
      const col = b.col === 'rainbow' ? this.rainbow() : b.col;
      this.text(b.text, W / 2, H * 0.3 + i * 14 - (b.t < 0.2 ? (1 - b.t / 0.2) * 6 : 0), { align: 'center', scale: b.big ? 2 : 1, color: col, outline: '#000', thick: b.big });
      g.globalAlpha = 1;
    });
    // stage intro card
    if (G.phase === 'intro') {
      const st = G.stage, t = G.phaseT;
      const k = t < 0.5 ? easeOutCubic(t / 0.5) : t > 2.7 ? 1 - easeInCubic((t - 2.7) / 0.5) : 1;
      g.globalAlpha = clamp01(k);
      this.rect(0, H * 0.36, W, 44, 'rgba(0,0,20,0.55)');
      this.text('STAGE ' + st.num, lerp(-100, W / 2, k), H * 0.36 + 5, { align: 'center', scale: 1, color: '#9fd0ff', outline: '#000' });
      this.text(st.name, lerp(W + 200, W / 2, k), H * 0.36 + 16, { align: 'center', scale: 3, color: ['#ffffff', '#ffe14a', '#ff8a2a'], outline: '#1a0a00', thick: true });
      g.globalAlpha = 1;
    }
    // warning
    if (G.warnT > 0) {
      const on = Math.floor(G.warnT * 4) % 2 === 0;
      if (on) {
        this.rect(0, H * 0.4, W, 30, 'rgba(120,0,20,0.55)');
        for (let x = -((this.t * 40) % 16); x < W; x += 16) { this.rect(x, H * 0.4, 8, 3, '#ffcc00'); this.rect(x + 8, H * 0.4 + 27, 8, 3, '#ffcc00'); }
        this.text('WARNING', W / 2, H * 0.4 + 8, { align: 'center', scale: 2, color: ['#ffffff', '#ff4a4a'], outline: '#200000', thick: true });
      }
    }
    if (G.boss && G.bossCard > 0 && G.bossCard < 3.6) {
      const k = clamp01(Math.min((3.6 - G.bossCard) * 3, G.bossCard * 2));
      g.globalAlpha = k;
      this.text(G.boss.name, W / 2, H * 0.6, { align: 'center', scale: 3, color: ['#ffffff', '#ff9ad0', '#ff2fa0'], outline: '#200010', thick: true });
      this.text(G.boss.sub.toUpperCase(), W / 2, H * 0.6 + 26, { align: 'center', color: '#ffd0e8', outline: '#000' });
      g.globalAlpha = 1;
    }
    if (G.phase === 'clear' && G.phaseT > 0.8) {
      const k = easeOutBack(clamp01((G.phaseT - 0.8) / 0.6));
      this.text('MISSION', W / 2, H * 0.3, { align: 'center', scale: Math.max(1, Math.round(3 * k)), color: ['#ffffff', '#9fd0ff'], outline: '#0a0a20', thick: true });
      this.text('ACCOMPLISHED', W / 2, H * 0.3 + 26, { align: 'center', scale: Math.max(1, Math.round(3 * k)), color: ['#ffffff', '#ffe14a', '#ff8a2a'], outline: '#1a0a00', thick: true });
    }
    if (G.phase === 'dead' && G.phaseT > 1.2) {
      this.text(P.lives >= 0 ? 'SHIP DOWN' : '', W / 2, H * 0.4, { align: 'center', scale: 2, color: ['#ffffff', '#ff7a7a'], outline: '#200000', thick: true });
      if (P.lives >= 0) this.text('SHIPS LEFT: ' + P.lives, W / 2, H * 0.4 + 20, { align: 'center', color: '#fff', outline: '#000' });
    }
    // touch controls
    if ((Input.lastDevice === 'touch' || Input.touchSeen) && !G.overlay) this.drawTouch();
  },
  bracket(x, y, r, col, thin) {
    const g = this.g; g.fillStyle = col;
    x = Math.round(x); y = Math.round(y);
    const L = thin ? 3 : 4;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.fillRect(x + sx * r - (sx > 0 ? L - 1 : 0), y + sy * r, L, 1);
      g.fillRect(x + sx * r, y + sy * r - (sy > 0 ? L - 1 : 0), 1, L);
    }
    if (!thin) g.fillRect(x, y, 1, 1);
  },
  shipIcon(x, y) {
    const g = this.g; g.fillStyle = '#9fd0ff';
    g.fillRect(x + 4, y, 2, 6); g.fillRect(x, y + 3, 10, 2); g.fillRect(x + 2, y + 6, 6, 1);
    g.fillStyle = '#2f6bff'; g.fillRect(x + 1, y + 3, 2, 1); g.fillRect(x + 7, y + 3, 2, 1);
  },
  bombIcon(x, y) { this.circle(x + 3, y + 3, 3, '#ff4a4a'); this.rect(x + 2, y - 1, 2, 2, '#ccc'); this.rect(x + 2, y + 2, 1, 1, '#fff'); },
  rainbow() { return cssColor(hsl((this.t * 0.6) % 1, 0.9, 0.65)); },
  drawResonance() {
    const G = Game, W = this.W, H = this.H, s = this.safe;
    AudioSys.bands(this.bands);
    const lvl = G.res.level, beat = 1 - Music.beatPhase();
    const n = 5, bw = 6, gap = 3, maxH = 16;
    const tw = n * bw + (n - 1) * gap;
    const x0 = Math.round(W / 2 - tw / 2), y0 = H - s.b - 8;
    for (let i = 0; i < n; i++) {
      this.bandsS[i] = Math.max(this.bands[i] * 1.3, this.bandsS[i] - 0.03);
      const on = i <= lvl;
      const h = Math.max(2, Math.round((on ? 0.35 + this.bandsS[i] * 0.65 : 0.15) * maxH * (on ? 0.8 + beat * 0.2 : 1)));
      const col = on ? (lvl >= 4 ? cssColor(hsl((this.t * 0.5 + i * 0.12) % 1, 0.9, 0.62)) : cssColor(hsl(0.5 - i * 0.05, 0.9, 0.62))) : 'rgba(120,140,200,0.35)';
      this.rect(x0 + i * (bw + gap), y0 - h, bw, h, col);
      if (on) this.rect(x0 + i * (bw + gap), y0 - h, bw, 1, 'rgba(255,255,255,0.8)');
    }
    // meter toward next level
    const mw = tw;
    this.rect(x0, y0 + 2, mw, 2, 'rgba(0,0,30,0.7)');
    this.rect(x0, y0 + 2, Math.round(mw * (lvl >= 4 ? 1 : G.res.meter)), 2, lvl >= 4 ? this.rainbow() : '#9ff6ff');
    this.text(lvl >= 4 ? 'MAX' : 'RES', x0 - 4, y0 - 7, { align: 'right', color: lvl >= 4 ? this.rainbow() : 'rgba(190,230,255,0.8)', outline: '#000' });
  },
  drawTouch() {
    const L = this.L, P = Game.player;
    const st = Input.stick;
    const beat = 1 - Music.beatPhase();
    if (st.active) {
      this.circle(st.ox, st.oy, L.stickR, 'rgba(255,255,255,0.18)', false, 2);
      this.circle(st.ox, st.oy, L.stickR - 1, 'rgba(120,180,255,0.08)');
      const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy), k = l > L.stickR ? L.stickR / l : 1;
      this.circle(st.ox + dx * k, st.oy + dy * k, 10, 'rgba(160,210,255,0.55)');
      this.circle(st.ox + dx * k, st.oy + dy * k, 10, 'rgba(255,255,255,0.7)', false);
    } else {
      const hx = L.leftHanded ? this.W - this.safe.r - 50 : this.safe.l + 50, hy = this.H - this.safe.b - 46;
      this.circle(hx, hy, L.stickR, 'rgba(255,255,255,0.12)', false, 2);
      this.circle(hx, hy, 3, 'rgba(255,255,255,0.18)');
    }
    const btn = (c, label, active, col, sub) => {
      this.circle(c.x, c.y, c.r, active ? col.replace('0.35', '0.65') : col);
      this.circle(c.x, c.y, c.r, active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', false, 1);
      this.text(label, c.x, c.y - (sub ? 6 : 3), { align: 'center', color: '#ffffff', outline: '#000' });
      if (sub) this.text(sub, c.x, c.y + 4, { align: 'center', color: '#ffe14a', outline: '#000' });
    };
    const firing = Input.fire;
    const locking = firing && P.holdT > 0.2;
    btn({ x: L.fire.x, y: L.fire.y, r: L.fire.r + (firing ? 0 : beat * 1.5) }, locking ? 'LOCK' : 'FIRE', firing, locking ? 'rgba(255,90,200,0.35)' : 'rgba(255,80,80,0.35)');
    btn(L.bomb, 'BOMB', false, P.bombs ? 'rgba(255,160,40,0.35)' : 'rgba(80,80,80,0.35)', '×' + P.bombs);
    btn(L.roll, 'ROLL', P.rolling, 'rgba(80,160,255,0.35)');
  },
  lensFlare() {
    const G = Game, env = G.env; if (!env || !env.sky || env.sky.sun < 0.8) return;
    const cam = G.cam, sd = env.sky.sunDir;
    if (!cam.project(_q, cam.pos.x + sd[0] * 1000, cam.pos.y + sd[1] * 1000, cam.pos.z + sd[2] * 1000)) return;
    if (_q.x < -0.1 || _q.x > 1.1 || _q.y < -0.1 || _q.y > 1.1) return;
    const W = this.W, H = this.H, g = this.g;
    const sx = _q.x * W, sy = _q.y * H, cx = W / 2, cy = H / 2;
    // occluded by terrain?
    for (let i = 1; i < 12; i++) { const d = i * i * 5; if (cam.pos.y + sd[1] * d < G.terrainHeight(cam.pos.x + sd[0] * d, cam.pos.z + sd[2] * d)) return; }
    const edge = 1 - clamp01((Math.hypot(_q.x - 0.5, _q.y - 0.5) - 0.3) * 2.5);
    g.globalCompositeOperation = 'lighter';
    const els = [[0.35, 6, '255,210,160', 0.18], [0.6, 10, '160,200,255', 0.12], [0.85, 4, '255,160,220', 0.2], [1.25, 14, '140,255,200', 0.08], [1.55, 7, '255,240,180', 0.14], [1.9, 20, '120,160,255', 0.07]];
    for (const [t, r, c, a] of els) {
      const x = sx + (cx - sx) * t * 1.2, y = sy + (cy - sy) * t * 1.2;
      g.fillStyle = `rgba(${c},${a * edge})`;
      g.beginPath(); for (let i = 0; i < 6; i++) { const aa = (i / 6) * TAU; g.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r); } g.closePath(); g.fill();
    }
    const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 40);
    gr.addColorStop(0, `rgba(255,250,230,${0.45 * edge})`); gr.addColorStop(1, 'rgba(255,200,150,0)');
    g.fillStyle = gr; g.fillRect(sx - 40, sy - 40, 80, 80);
    g.globalCompositeOperation = 'source-over';
  },
  // Briefing comms: the speaker owns the scene, so a big panel with a full
  // 40px portrait, pinned above the bottom edge.
  drawDialog() {
    const G = Game, D = G.dialog;
    let c = D.cur;
    if (!c) { if (D.last && D.clock - D.lastEnd < 0.2) c = D.last; else return; } // no flicker between lines
    const W = this.W, s = this.safe, g = this.g;
    const land = W > this.H;
    const w = Math.min(land ? 300 : W - 16, W - s.l - s.r - (land ? 150 : 16)), h = 50;
    const x = Math.round(W / 2 - w / 2), y = this.H - s.b - h - 30;
    const k = c.cont ? 1 : clamp01(c.t * 6);
    const hh = Math.round(h * k);
    const col = DIALOG_COL[c.who] || '#9fd0ff';
    this.panel(x, y + Math.round((h - hh) / 2), w, hh, { top: 'rgba(12,30,60,0.9)', bot: 'rgba(4,10,24,0.9)', edge: col });
    if (k < 1) return;
    const px = x + 5, py = y + 5;
    this.rect(px - 1, py - 1, 42, 42, '#000');
    const bg = g.createLinearGradient(0, py, 0, py + 40); bg.addColorStop(0, '#1a3a6a'); bg.addColorStop(1, '#0a1428');
    g.fillStyle = bg; g.fillRect(px, py, 40, 40);
    g.drawImage(Portraits.get(c.who, this.mouthOpen(c), this.blinking(c)), px, py);
    for (let i = 0; i < 40; i += 2) this.rect(px, py + i, 40, 1, 'rgba(0,0,0,0.18)');
    if (c.t < 0.3) this.staticNoise(px, py, 40, 40, 120);
    const tx = px + 46;
    this.text(DIALOG_NAME[c.who] || c.who.toUpperCase(), tx, py, { color: col, outline: '#000' });
    this.typed(c, Font.wrap(c.text, w - 56), tx, py + 11, 9, 3);
  },
  // In-flight comms: a compact, see-through strip in the bottom-left corner
  // (bottom-right with the left-handed layout; just above the thumb controls
  // in portrait), anchored to its bottom edge so it grows upward. It stays out
  // of the centre of the screen and fades back when the reticle or ship passes over it.
  drawComm(dt) {
    const G = Game, D = G.dialog, P = G.player, W = this.W, H = this.H, s = this.safe, g = this.g, L = this.L;
    let c = D.cur, out = 0;
    if (!c) {
      c = D.last; out = clamp01((D.clock - D.lastEnd) / 0.22);
      if (!c || out >= 1) return;
    }
    const land = W > H, S = 26, lefty = G.settings.lefty;
    let w, x0, bottom;
    if (land) { // keep clear of the resonance meter at bottom centre
      w = Math.round(Math.min(216, W / 2 - 52 - (lefty ? s.r : s.l) - 4));
      x0 = lefty ? W - s.r - 4 - w : s.l + 4;
      bottom = H - s.b - 4;
    } else {
      w = W - s.l - s.r - 8; x0 = s.l + 4;
      bottom = Input.lastDevice === 'touch' || Input.touchSeen ? Math.min(L.bomb.y - L.bomb.r, H - s.b - 46 - L.stickR) - 6 : H - s.b - 30;
    }
    const lines = c.lines || (c.lines = Font.wrap(c.text, w - S - 12));
    const n = Math.max(1, Math.min(3, this.linesShown(c, lines))), h = Math.max(S + 4, 12 + n * 8 + 3);
    const y = bottom - h;
    // get out of the way of the reticle and the ship
    let clear = true;
    const r = G.reticle;
    if (P.alive && r.ok && G.phase !== 'intro' && G.phase !== 'clear') {
      const rx = r.nx * W, ry = r.ny * H;
      if (rx > x0 - 16 && rx < x0 + w + 16 && ry > y - 16 && ry < y + h + 16) clear = false;
      const sp = W3(P.d, P.x, P.y);
      if (G.cam.project(_q, sp.x, sp.y, sp.z)) { const sx = _q.x * W, sy = _q.y * H; if (sx > x0 - 20 && sx < x0 + w + 20 && sy > y - 20 && sy < y + h + 20) clear = false; }
    }
    this.commFade = damp(this.commFade === undefined ? 1 : this.commFade, clear ? 1 : 0.22, 12, dt);
    const kin = easeOutCubic(clamp01((D.clock - c.t0) / 0.18));
    const x = Math.round(x0 + ((1 - kin) * 36 + out * 24) * (land && lefty ? 1 : -1));
    g.globalAlpha = clamp01(kin * (1 - out)) * this.commFade;
    const col = DIALOG_COL[c.who] || '#9fd0ff';
    // backdrop: dark glass that fades out to the right, with a speaker-coloured spine
    const bg = g.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, 'rgba(4,10,28,0.72)'); bg.addColorStop(0.7, 'rgba(4,10,28,0.5)'); bg.addColorStop(1, 'rgba(4,10,28,0)');
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    this.rect(x, y, 1, h, col);
    const tl = g.createLinearGradient(x, 0, x + w * 0.8, 0); tl.addColorStop(0, col); tl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tl; g.globalAlpha *= 0.6; g.fillRect(x + 1, y, w * 0.8, 1); g.globalAlpha /= 0.6;
    // face close-up (cropped from the full portrait so it stays crisp)
    const px = x + 3, py = y + 2;
    this.rect(px - 1, py - 1, S + 2, S + 2, col);
    this.rect(px, py, S, S, '#0a1428');
    g.drawImage(Portraits.get(c.who, this.mouthOpen(c), this.blinking(c)), 7, 3, S, S, px, py, S, S);
    for (let i = 0; i < S; i += 2) this.rect(px, py + i, S, 1, 'rgba(0,0,0,0.2)');
    if (D.clock - c.t0 < 0.22) this.staticNoise(px, py, S, S, 50);
    // name + signal bars, then the typed line(s)
    const tx = px + S + 5, name = DIALOG_NAME[c.who] || c.who.toUpperCase();
    this.text(name, tx, y + 3, { color: col, outline: '#000' });
    const talking = c.shown < c.text.length;
    for (let i = 0; i < 3; i++) {
      const on = !talking || (Math.sin(this.t * 23 + i * 1.7) > -0.2 - i * 0.3);
      this.rect(tx + Font.width(name) + 4 + i * 3, y + 8 - i * 2, 2, 2 + i * 2, on ? col : 'rgba(255,255,255,0.18)');
    }
    this.typed(c, lines, tx, y + 13, 8, 3);
    g.globalAlpha = 1;
  },
  // Type out pre-wrapped lines up to c.shown; keeps the newest max lines visible.
  typed(c, lines, x, y, lh, max) {
    let left = Math.floor(c.shown), last = 0;
    const vis = [];
    for (let i = 0; i < lines.length && left > 0; i++) { vis.push(lines[i].slice(0, left)); left -= lines[i].length + 1; last = i; }
    const from = Math.max(0, last - max + 1);
    for (let i = from; i < vis.length; i++) this.text(vis[i], x, y + (i - from) * lh, { color: '#ffffff', outline: '#001' });
  },
  linesShown(c, lines) { let left = Math.floor(c.shown), i = 0; while (i < lines.length && left > 0) { left -= lines[i].length + 1; i++; } return i; },
  mouthOpen(c) { return c.shown < c.text.length && c.t - c.sylT < 0.075; },
  blinking(c) { return Math.floor((this.t + c.who.length) * 10) % 37 === 0; },
  staticNoise(x, y, w, h, n) { for (let i = 0; i < n; i++) this.rect(x + Math.random() * w, y + Math.random() * h, 1, 1, `rgba(255,255,255,${Math.random()})`); },

  // ---- pause -------------------------------------------------------------------------
  drawPause() {
    const G = Game, W = this.W, H = this.H;
    this.rect(0, 0, W, H, 'rgba(4,6,20,0.6)');
    this.text('PAUSED', W / 2, H * 0.18, { scale: 3, align: 'center', color: ['#ffffff', '#9fd0ff'], outline: '#0a0a20', thick: true });
    const bw = 150, bh = 22, y0 = H * 0.34;
    const items = [
      ['RESUME', () => { G.resume(); }],
      ['RESTART STAGE', () => { G.resume(); G.score = G.stageStartScore; G.player.reset(true); G.checkpointHit = false; G.startStage(G.stageIdx, false); }],
      ['SETTINGS', () => { this.sub = 'settings'; this.focus = 0; }],
      ['QUIT TO TITLE', () => { G.resume(); G.setState('title'); }],
    ];
    items.forEach(([l, fn], i) => { if (this.button(l, W / 2 - bw / 2, y0 + i * (bh + 5), bw, bh)) fn(); });
    const st = G.stage;
    this.text(st.name + '  ·  ' + DIFFS[G.settings.diff].name, W / 2, H - this.safe.b - 14, { align: 'center', color: '#9fd0ff', outline: '#000' });
    if ((Input.nav.back || Input.pausePressed) && G.overlayT > 0.15) { G.resume(); SFX.menuOk(); }
  },

  // ---- results -----------------------------------------------------------------------
  drawResults() {
    const G = Game, R = G.results, W = this.W, H = this.H, s = this.safe, t = G.resultT;
    if (!R) return;
    const st = G.stage;
    const pw = Math.min(300, W - 20), ph = Math.min(H - s.t - s.b - 16, 200);
    const px = W / 2 - pw / 2, py = Math.max(s.t + 6, H / 2 - ph / 2);
    this.panel(px, py, pw, ph, { glow: true });
    this.text(st.name + ' CLEAR!', W / 2, py + 8, { scale: 2, align: 'center', color: ['#ffffff', '#ffe14a', '#ff8a2a'], outline: '#1a0a00', thick: true });
    const rows = [
      ['STAGE SCORE', String(Math.round(R.stageScore * clamp01((t - 0.3) / 1.2)))],
      ['ENEMIES DOWN', String(R.kills)],
      ['WINGMEN RESCUED', String(R.rescues)],
      ['TUNING FORK', R.fork ? 'FOUND ♪' : '—'],
      ['TOTAL SCORE', String(R.total)],
    ];
    rows.forEach(([k, v], i) => {
      if (t < 0.3 + i * 0.25) return;
      const y = py + 30 + i * 13;
      this.text(k, px + 12, y, { color: '#bfe0ff', outline: '#000' });
      this.text(v, px + pw - 12, y, { align: 'right', color: i === 4 ? '#ffe14a' : '#ffffff', outline: '#000' });
    });
    // wingmen status
    if (t > 1.6) {
      const y = py + 30 + rows.length * 13 + 4;
      ['oz', 'sable', 'tobi'].forEach((who, i) => {
        const w = G.wing(who), ok = w && w.hp > 0;
        const x = px + 12 + i * ((pw - 24) / 3);
        this.g.drawImage(Portraits.get(who, false, !ok), Math.round(x), y, 20, 20);
        this.text(ok ? 'OK' : 'DOWN', x + 24, y + 7, { color: ok ? '#6dff8a' : '#ff7a7a', outline: '#000' });
      });
    }
    if (t > 2.1) {
      const y = py + ph - 34;
      if (R.medal) this.text('★ MEDAL EARNED ★', W / 2, y, { align: 'center', scale: 1, color: this.rainbow(), outline: '#000' });
      else this.text('MEDAL: ' + st.medal + ' PTS' + (R.allWings ? '' : ' · NO WINGMAN LOST'), W / 2, y, { align: 'center', color: '#8899aa', outline: '#000' });
      if (R.newBest) this.text('NEW RECORD!', W / 2, y + 10, { align: 'center', color: '#ffe14a', outline: '#000' });
    }
    if (t > 1.5 && Math.floor(this.t * 2.5) % 2 === 0) this.text(Input.lastDevice === 'touch' ? 'TAP TO CONTINUE' : 'PRESS ENTER', W / 2, py + ph - 12, { align: 'center', color: '#ffffff', outline: '#000' });
  },

  // ---- game over ------------------------------------------------------------------------
  drawGameOver() {
    const G = Game, W = this.W, H = this.H;
    this.rect(0, 0, W, H, 'rgba(10,0,10,0.55)');
    const k = easeOutBack(clamp01(G.stateT / 0.8));
    this.text('GAME OVER', W / 2, H * 0.25, { scale: Math.max(1, Math.round(4 * k)), align: 'center', color: ['#ffffff', '#ff7a7a', '#a02040'], outline: '#200000', thick: true });
    this.text('The silence spreads... but the song is not over.', W / 2, H * 0.25 + 36, { align: 'center', color: '#ffd0e8', outline: '#000' });
    if (G.stateT > 1.2) {
      const bw = 160, bh = 22;
      if (this.button('CONTINUE', W / 2 - bw / 2, H * 0.52, bw, bh)) G.continueGame();
      if (this.button('QUIT TO TITLE', W / 2 - bw / 2, H * 0.52 + bh + 6, bw, bh)) G.setState('title');
    }
  },

  // ---- ending ------------------------------------------------------------------------------
  drawEnding() {
    const G = Game, W = this.W, H = this.H;
    const endY = this.drawCredits(true);
    if (endY < H * 0.3) {
      this.text('THE END', W / 2, H * 0.5, { scale: 4, align: 'center', color: ['#ffffff', '#ffe14a', '#ff8a2a'], outline: '#1a0a00', thick: true });
      this.text('FINAL SCORE ' + G.score, W / 2, H * 0.5 + 36, { scale: 2, align: 'center', color: '#ffffff', outline: '#000' });
      if (G.save.gold) this.text('GOLD SYNTHWING UNLOCKED!', W / 2, H * 0.5 + 56, { align: 'center', color: this.rainbow(), outline: '#000' });
      if (Math.floor(this.t * 2) % 2) this.text('TAP TO RETURN TO TITLE', W / 2, H - this.safe.b - 14, { align: 'center', color: '#fff', outline: '#000' });
    }
  },
};

const DIALOG_NAME = { oz: 'OZ', sable: 'SABLE', tobi: 'TOBI', maren: 'ADMIRAL MAREN', hush: 'THE HUSH', static: 'STATIC COMMANDER' };
const DIALOG_COL = { oz: '#6dff8a', sable: '#c9a0ff', tobi: '#ffb060', maren: '#9fd0ff', hush: '#e8e6f0', static: '#ff5ad0' };
const CREDITS = [
  ['h', 'SYNTHWING 64'], ['y', 'A SQUADRON OF SOUND'], ['s', ''],
  ['p', 'The Octave Cluster sings again.'], ['s', ''],
  ['y', 'STARRING'], ['p', 'OZ — the veteran'], ['p', 'SABLE — the ace'], ['p', 'TOBI — the rookie'], ['p', 'ADMIRAL MAREN — the Cadence'], ['p', 'and YOU as LEAD'], ['s', ''],
  ['y', 'DESIGN · CODE · MUSIC · ART'], ['p', 'Claude'], ['s', ''],
  ['p', 'Thank you for playing!'],
];
