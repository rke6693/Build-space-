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
  btns: [], focus: 0, prevCount: 0, sub: null, subSel: 0,
  bands: new Float32Array(6), bandsS: new Float32Array(6),
  fps: 60, fpsAcc: 0, fpsN: 0, t: 0,
  resultsT: 0, confirmReset: false, stageSel: 0,

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
    if (s > 1 && Font.width(label, s) > w - 10) s = 1;
    this.text(label, x + w / 2, y + Math.round((h - 7 * s) / 2), { scale: s, align: 'center', color: dis ? '#6a6a80' : o.color || ['#ffffff', '#bfe0ff'], outline: '#0a0a20' });
    if (focused) { this.text('▶', x - 8, y + Math.round((h - 7) / 2), { color: '#ffe14a' }); }
    if (hit && !dis) { SFX.menuOk(); Haptics.tap(0.4); return true; }
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
    else if (st === 'results') this.drawResults(dt);
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
    const blink = Math.floor(this.t * 2) % 2 === 0;
    const verb = Input.lastDevice === 'keyboard' || Input.lastDevice === 'mouse' ? 'PRESS ENTER OR CLICK' : 'TAP TO START';
    if (blink) this.text(verb, cx, H * 0.62, { scale: 2, align: 'center', color: '#ffffff', outline: '#000' });
    this.text('♪ Sound on for the full experience ♪', cx, H * 0.62 + 22, { align: 'center', color: '#9ab' });
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (isIOS && !standalone) this.text('Tip: Share ▶ Add to Home Screen for fullscreen', cx, H - this.safe.b - 22, { align: 'center', color: '#7a8aa0' });
    if (W < H) this.text('Best played in landscape', cx, H - this.safe.b - 12, { align: 'center', color: '#ffe14a' });
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
      ['STAGE SELECT', () => { this.sub = 'stages'; this.focus = 0; this.stageSel = 0; }],
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
    this.text(land ? 'v1.0' : 'v1.0 · WebGL2 · all sound synthesized live', s.l + 6, H - s.b - 10, { color: 'rgba(255,255,255,0.55)' });
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
      ['RESOLUTION', S.res === 240 ? '240p AUTHENTIC' : S.res === 360 ? '360p' : S.res === 480 ? '480p' : 'NATIVE HD', (d) => { const L = [240, 360, 480, 0]; S.res = L[(L.indexOf(S.res) + d + 4) % 4]; }],
      ['CRT SCANLINES', S.crt ? 'ON' : 'OFF', () => { S.crt = !S.crt; }],
      ['16-BIT DITHER', S.dither ? 'ON' : 'OFF', () => { S.dither = !S.dither; }],
      ['SCREEN SHAKE', S.shake ? 'ON' : 'OFF', () => { S.shake = !S.shake; }],
      ['FLASHES', S.flash ? 'FULL' : 'REDUCED', () => { S.flash = !S.flash; }],
      ['MUSIC', String(S.music), (d) => { S.music = clamp(S.music + d, 0, 10); }],
      ['SOUND FX', String(S.sfx), (d) => { S.sfx = clamp(S.sfx + d, 0, 10); }],
      ['HAPTICS', S.haptics ? 'ON' : 'OFF', () => { S.haptics = !S.haptics; }],
      ['SHOW FPS', S.fps ? 'ON' : 'OFF', () => { S.fps = !S.fps; }],
    ];
    const cols = land ? 2 : 1;
    const rowH = 21, gapY = 3;
    const colW = land ? Math.min(210, (W - s.l - s.r - 24) / 2) : Math.min(230, W - 24);
    const rows = Math.ceil(opts.length / cols);
    const x0 = W / 2 - (colW * cols + (cols - 1) * 8) / 2, y0 = s.t + 34;
    opts.forEach(([label, val, fn], i) => {
      const c = land ? Math.floor(i / rows) : 0, rI = land ? i % rows : i;
      const x = x0 + c * (colW + 8), y = y0 + rI * (rowH + gapY);
      if (y + rowH > H - s.b - (G.state === 'title' ? 28 : 4)) return;
      const idx = this.btns.length;
      const focused = idx === this.focus && Input.lastDevice !== 'touch';
      this.btns.push({ x, y, w: colW, h: rowH });
      this.panel(x, y, colW, rowH, { edge: focused ? '#ffe14a' : 'rgba(120,170,255,0.8)', top: 'rgba(30,38,96,0.9)', bot: 'rgba(12,14,44,0.9)' });
      this.text(label, x + 6, y + 7, { color: '#bfe0ff' });
      this.text('◀ ' + val + ' ▶', x + colW - 6, y + 7, { align: 'right', color: '#ffffff' });
      let d = 0;
      for (const cl of Input.clicks) if (cl.x >= x && cl.y >= y && cl.x <= x + colW && cl.y <= y + rowH) { this.focus = idx; d = cl.x < x + colW * 0.62 ? -1 : 1; }
      if (focused && (Input.nav.left)) d = -1;
      if (focused && (Input.nav.right || Input.nav.ok)) d = 1;
      if (d) { fn(d); G.applySettings(); G.writeSave(); SFX.menuMove(); Haptics.tap(0.3); }
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
    this.text('MEDAL AT ' + st.medal + ' PTS + ALL WINGMEN SAFE', x, s.t + 76, { color: 'rgba(200,220,255,0.7)', outline: '#000' });
    this.drawDialog(true);
    if (G.briefDone && Math.floor(this.t * 2.5) % 2 === 0) this.text(Input.lastDevice === 'touch' ? 'TAP TO LAUNCH' : 'PRESS ENTER TO LAUNCH', W / 2, H - s.b - 20, { scale: 2, align: 'center', color: ['#ffffff', '#ffe14a'], outline: '#1a0a00', thick: true });
    else if (!G.briefDone) this.text('tap to skip', W - s.r - 8, H - s.b - 12, { align: 'right', color: 'rgba(255,255,255,0.5)' });
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
      this.text(t.str, _q.x * W, _q.y * H, { align: 'center', color: t.col, outline: '#000', scale: t.big ? 2 : 1 });
      g.globalAlpha = 1;
    }
    // --- top-left: shield, lives, bombs
    const x0 = s.l + 6, y0 = s.t + 5;
    this.text('SHIELD', x0, y0, { color: '#bfe0ff', outline: '#0a0a20' });
    const bw = Math.round(60 * P.maxShield / 100), frac = P.shield / P.maxShield;
    this.rect(x0 - 1, y0 + 9, bw + 2, 7, '#0a0a20');
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
    this.text(String(G.score).padStart(7, '0'), rx, y0 + 9, { align: 'right', scale: 2, color: ['#ffffff', '#ffe14a'], outline: '#1a0a00' });
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
    // comm window
    this.drawDialog(false);
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
    const G = Game, W = this.W, H = this.H, s = this.safe, g = this.g;
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
    const L = this.L, g = this.g, P = Game.player;
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
      this.text('STEER', hx, hy - 3, { align: 'center', color: 'rgba(255,255,255,0.3)' });
    }
    const btn = (c, label, active, col, sub) => {
      this.circle(c.x, c.y, c.r, active ? col.replace('0.35', '0.65') : col);
      this.circle(c.x, c.y, c.r, active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)', false, 1);
      this.text(label, c.x, c.y - (sub ? 6 : 3), { align: 'center', color: '#ffffff', outline: '#000' });
      if (sub) this.text(sub, c.x, c.y + 4, { align: 'center', color: '#ffe14a', outline: '#000' });
    };
    const firing = Input.fire;
    const locking = firing && P.holdT > 0.2;
    btn({ x: L.fire.x, y: L.fire.y, r: L.fire.r + (firing ? 0 : beat * 1.5) }, 'FIRE', firing, locking ? 'rgba(255,90,200,0.35)' : 'rgba(255,80,80,0.35)', locking ? 'LOCK ' + P.locks.length : 'hold:lock');
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
    const ray = cam.pos.clone();
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
  drawDialog(brief) {
    const G = Game, c = G.dialog.cur;
    if (!c) return;
    const W = this.W, s = this.safe, g = this.g;
    const land = W > this.H;
    const w = Math.min(land ? 300 : W - 16, W - s.l - s.r - (land ? 150 : 16)), h = 50;
    const x = Math.round(W / 2 - w / 2), y = brief ? this.H - s.b - h - 30 : s.t + (land ? 4 : 44);
    const k = clamp01(c.t * 6);
    const hh = Math.round(h * k);
    const yy = y + Math.round((h - hh) / 2);
    this.panel(x, yy, w, hh, { top: 'rgba(12,30,60,0.9)', bot: 'rgba(4,10,24,0.9)', edge: DIALOG_COL[c.who] || '#9fd0ff' });
    if (k < 1) return;
    // portrait with comm static
    const px = x + 5, py = y + 5;
    this.rect(px - 1, py - 1, 42, 42, '#000');
    const bg = g.createLinearGradient(0, py, 0, py + 40); bg.addColorStop(0, '#1a3a6a'); bg.addColorStop(1, '#0a1428');
    g.fillStyle = bg; g.fillRect(px, py, 40, 40);
    const talking = c.shown < c.text.length && Math.floor(c.t * 12) % 2 === 0;
    const blink = Math.floor((this.t + c.who.length) * 10) % 37 === 0;
    g.drawImage(Portraits.get(c.who, talking, blink), px, py);
    for (let i = 0; i < 40; i += 2) this.rect(px, py + i, 40, 1, 'rgba(0,0,0,0.18)');
    if (c.t < 0.35) for (let i = 0; i < 120; i++) this.rect(px + Math.random() * 40, py + Math.random() * 40, 1, 1, `rgba(255,255,255,${Math.random()})`);
    const tx = px + 46;
    this.text(DIALOG_NAME[c.who] || c.who.toUpperCase(), tx, py, { color: DIALOG_COL[c.who] || '#9fd0ff', outline: '#000' });
    const lines = Font.wrap(c.text.slice(0, Math.floor(c.shown)), w - 56);
    lines.slice(0, 3).forEach((ln, i) => this.text(ln, tx, py + 11 + i * 9, { color: '#ffffff', outline: '#001' }));
  },

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
  drawResults(dt) {
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
      else this.text('MEDAL NEEDS ' + st.medal + ' PTS' + (R.allWings ? '' : ' + ALL WINGMEN'), W / 2, y, { align: 'center', color: '#8899aa', outline: '#000' });
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
      this.text('Continuing restarts the stage with its starting score', W / 2, H * 0.52 + 2 * (bh + 6) + 4, { align: 'center', color: '#8899aa' });
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
  ['y', 'GAME DESIGN · CODE · MUSIC · ART'], ['p', 'Claude'], ['s', ''],
  ['y', 'MADE WITH'], ['p', 'Hand-written WebGL2 · WebAudio synthesis'], ['p', 'Zero libraries · zero image files · zero samples'], ['s', ''],
  ['y', 'SPECIAL THANKS'], ['p', 'Every game that taught us a barrel roll'], ['p', 'and every soundtrack that made us hum'], ['s', ''],
  ['p', 'Thank you for playing!'],
];
