'use strict';
// =============================================================================
// SYNTHWING 64 — input.js
// Multi-touch virtual controls (floating analog stick or relative "pad"),
// on-screen FIRE / BOMB / ROLL buttons, keyboard, and gamepads (an MFi/Xbox/
// DualSense controller paired to an iPhone works through the Gamepad API).
// =============================================================================

const Input = {
  mode: 'menu', // 'menu' | 'play'
  move: { x: 0, y: 0 },
  padDelta: { x: 0, y: 0 },
  fire: false, firePressed: false, fireReleased: false,
  bombPressed: false, rollPressed: false, rollDir: 0, pausePressed: false,
  nav: { up: false, down: false, left: false, right: false, ok: false, back: false },
  clicks: [],
  pointers: new Map(),
  keys: new Set(),
  lastDevice: 'touch',
  layout: null, // provided by HUD each frame: {fire, bomb, roll, pause (circles/rects), stickSide, W, H}
  toHud: (x, y) => [x, y],
  settings: { steer: 'stick', sens: 3, invertY: false },
  stick: { active: false, ox: 0, oy: 0, x: 0, y: 0, id: -1 },
  lastStickTap: 0,
  gpPrev: [],
  gpConnected: false,
  touchSeen: false,

  init(el) {
    const opt = { passive: false };
    el.addEventListener('pointerdown', (e) => this.onDown(e), opt);
    el.addEventListener('pointermove', (e) => this.onMove(e), opt);
    el.addEventListener('pointerup', (e) => this.onUp(e), opt);
    el.addEventListener('pointercancel', (e) => this.onUp(e, true), opt);
    el.addEventListener('lostpointercapture', (e) => this.onUp(e, true), opt);
    // Stop iOS scroll / zoom / magnifier gestures.
    const stop = (e) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', stop, opt);
    el.addEventListener('touchmove', stop, opt);
    el.addEventListener('touchend', stop, opt);
    el.addEventListener('gesturestart', stop, opt);
    el.addEventListener('contextmenu', stop, opt);
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    window.addEventListener('gamepadconnected', () => { this.gpConnected = true; this.lastDevice = 'gamepad'; });
  },
  releaseAll() {
    this.pointers.clear(); this.keys.clear();
    this.stick.active = false; this.move.x = this.move.y = 0;
    if (this.fire) this.fireReleased = true;
    this.fire = false;
  },
  hitCircle(c, x, y, pad = 1.25) { return c && Math.hypot(x - c.x, y - c.y) <= c.r * pad; },
  hitRect(r, x, y) { return r && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h; },

  onDown(e) {
    if (e.cancelable) e.preventDefault();
    AudioSys.unlock();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { this.lastDevice = 'touch'; this.touchSeen = true; } else this.lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    const [x, y] = this.toHud(e.clientX, e.clientY);
    const p = { x, y, sx: x, sy: y, t: performance.now(), role: 'ui' };
    this.pointers.set(e.pointerId, p);
    const L = this.layout;
    if (this.mode === 'play' && L) {
      if (this.hitRect(L.pause, x, y)) { p.role = 'pause'; this.pausePressed = true; Haptics.tap(); return; }
      if (this.hitCircle(L.bomb, x, y)) { p.role = 'bomb'; this.bombPressed = true; Haptics.tap(); return; }
      if (this.hitCircle(L.roll, x, y)) { p.role = 'roll'; this.rollPressed = true; this.rollDir = 0; Haptics.tap(); return; }
      const onFire = this.hitCircle(L.fire, x, y, 1.35);
      const stickSide = L.leftHanded ? x > L.W * 0.5 : x < L.W * 0.5;
      if (onFire || !stickSide) { p.role = 'fire'; if (!this.fire) this.firePressed = true; this.fire = true; return; }
      // stick
      p.role = 'stick';
      const now = performance.now();
      if (now - this.lastStickTap < 260 && !this.stick.active) { this.rollPressed = true; this.rollDir = 0; }
      this.lastStickTap = now;
      const st = this.stick;
      st.active = true; st.id = e.pointerId; st.ox = x; st.oy = y; st.x = x; st.y = y;
      p.lx = x; p.ly = y;
    }
  },
  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (e.cancelable) e.preventDefault();
    const [x, y] = this.toHud(e.clientX, e.clientY);
    if (p.role === 'stick') {
      const st = this.stick, R = this.stickRadius();
      st.x = x; st.y = y;
      // drag-follow: origin trails the finger so reversing is instant
      const dx = x - st.ox, dy = y - st.oy, l = Math.hypot(dx, dy);
      if (l > R) { st.ox = x - (dx / l) * R; st.oy = y - (dy / l) * R; }
      this.padDelta.x += x - p.lx; this.padDelta.y += y - p.ly;
      p.lx = x; p.ly = y;
    } else if (p.role === 'fire' && this.layout) {
      // sliding off FIRE onto the stick side does nothing; keep firing
    }
    p.x = x; p.y = y;
  },
  onUp(e, cancel) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (e.cancelable) e.preventDefault();
    AudioSys.unlock();
    if (p.role === 'stick') {
      this.stick.active = false; this.move.x = 0; this.move.y = 0;
      // a quick horizontal flick = barrel roll in that direction
      const dt = performance.now() - p.t, dx = p.x - p.sx;
      if (dt < 180 && Math.abs(dx) > 26) { this.rollPressed = true; this.rollDir = Math.sign(dx); }
    } else if (p.role === 'fire') {
      let still = false;
      for (const q of this.pointers.values()) if (q.role === 'fire') still = true;
      if (!still) { this.fire = false; this.fireReleased = true; }
    } else if (p.role === 'ui' && !cancel) {
      if (Math.hypot(p.x - p.sx, p.y - p.sy) < 14) this.clicks.push({ x: p.x, y: p.y });
    }
  },
  stickRadius() { return this.layout ? this.layout.stickR : 30; },

  onKey(e, down) {
    const k = e.code;
    if (down) {
      if (this.keys.has(k)) return;
      this.keys.add(k); this.lastDevice = 'keyboard';
      AudioSys.unlock();
      if (['Space', 'KeyJ', 'KeyZ'].includes(k)) { if (!this.fire) this.firePressed = true; this.fire = true; }
      if (['KeyK', 'KeyX', 'KeyB'].includes(k)) this.bombPressed = true;
      if (['KeyL', 'ShiftLeft', 'ShiftRight', 'KeyC'].includes(k)) { this.rollPressed = true; this.rollDir = 0; }
      if (k === 'KeyQ') { this.rollPressed = true; this.rollDir = -1; }
      if (k === 'KeyE') { this.rollPressed = true; this.rollDir = 1; }
      if (['Escape', 'KeyP'].includes(k)) { this.pausePressed = true; this.nav.back = true; }
      if (['ArrowUp', 'KeyW'].includes(k)) this.nav.up = true;
      if (['ArrowDown', 'KeyS'].includes(k)) this.nav.down = true;
      if (['ArrowLeft', 'KeyA'].includes(k)) this.nav.left = true;
      if (['ArrowRight', 'KeyD'].includes(k)) this.nav.right = true;
      if (['Enter', 'NumpadEnter'].includes(k) || (this.mode === 'menu' && ['Space', 'KeyZ', 'KeyJ'].includes(k))) this.nav.ok = true;
      if (['Backspace', 'KeyX'].includes(k) && this.mode === 'menu') this.nav.back = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    } else {
      this.keys.delete(k);
      if (['Space', 'KeyJ', 'KeyZ'].includes(k)) {
        if (!['Space', 'KeyJ', 'KeyZ'].some((c) => this.keys.has(c))) { this.fire = false; this.fireReleased = true; }
      }
    }
  },

  // Called once per frame before game logic.
  poll(dt) {
    let mx = 0, my = 0;
    const K = this.keys;
    if (K.has('ArrowLeft') || K.has('KeyA')) mx -= 1;
    if (K.has('ArrowRight') || K.has('KeyD')) mx += 1;
    if (K.has('ArrowUp') || K.has('KeyW')) my += 1;
    if (K.has('ArrowDown') || K.has('KeyS')) my -= 1;
    if (mx || my) { const l = Math.hypot(mx, my); mx /= l; my /= l; }
    // touch stick
    const st = this.stick;
    if (st.active) {
      const R = this.stickRadius();
      let dx = (st.x - st.ox) / R, dy = -(st.y - st.oy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      const dz = 0.08, ll = Math.min(1, l);
      const k = ll < dz ? 0 : Math.pow((ll - dz) / (1 - dz), 1.25) / (ll || 1);
      mx += dx * k; my += dy * k;
    }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const l = Math.hypot(ax, ay);
      if (l > 0.15) { const k = Math.min(1, (l - 0.15) / 0.85) / l; mx += ax * k; my -= ay * k; this.lastDevice = 'gamepad'; }
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const prev = this.gpPrev[gp.index] || [];
      const edge = (i) => b(i) && !prev[i];
      const rel = (i) => !b(i) && prev[i];
      if (edge(0) || edge(7)) { if (!this.fire) this.firePressed = true; this.fire = true; this.lastDevice = 'gamepad'; }
      if ((rel(0) || rel(7)) && !b(0) && !b(7)) { this.fire = false; this.fireReleased = true; }
      if (edge(1) || edge(2)) { if (this.mode === 'play') this.bombPressed = true; }
      if (edge(4) || edge(6)) { this.rollPressed = true; this.rollDir = -1; }
      if (edge(5)) { this.rollPressed = true; this.rollDir = 1; }
      if (edge(3)) { this.rollPressed = true; this.rollDir = 0; }
      if (edge(9)) this.pausePressed = true;
      if (edge(12)) this.nav.up = true; if (edge(13)) this.nav.down = true; if (edge(14)) this.nav.left = true; if (edge(15)) this.nav.right = true;
      if (edge(0)) this.nav.ok = true;
      if (edge(1)) this.nav.back = true;
      if (this.mode === 'menu') {
        if (ay < -0.6 && !(prev.ay < -0.6)) this.nav.up = true;
        if (ay > 0.6 && !(prev.ay > 0.6)) this.nav.down = true;
        if (ax < -0.6 && !(prev.ax < -0.6)) this.nav.left = true;
        if (ax > 0.6 && !(prev.ax > 0.6)) this.nav.right = true;
      }
      const np = gp.buttons.map((x) => x.pressed); np.ax = ax; np.ay = ay;
      this.gpPrev[gp.index] = np;
    }
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    if (this.settings.invertY) my = -my;
    this.move.x = mx; this.move.y = my;
  },
  // Clear one-frame edges after game logic consumed them.
  endFrame() {
    this.firePressed = this.fireReleased = this.bombPressed = this.rollPressed = this.pausePressed = false;
    this.padDelta.x = this.padDelta.y = 0;
    this.nav.up = this.nav.down = this.nav.left = this.nav.right = this.nav.ok = this.nav.back = false;
    this.clicks.length = 0;
  },
};

// iOS Safari has no Vibration API, but toggling a native <input switch>
// produces a system haptic tick on iOS 18+. Android uses navigator.vibrate.
const Haptics = {
  enabled: true, el: null, last: 0,
  init() {
    try {
      const label = document.createElement('label');
      label.style.cssText = 'position:fixed;left:-100px;top:-100px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.tabIndex = -1; inp.setAttribute('aria-hidden', 'true');
      label.appendChild(inp); document.body.appendChild(label);
      this.el = label;
    } catch (e) { this.el = null; }
  },
  tap(strength = 1) {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.last < 45) return;
    this.last = now;
    try {
      if (navigator.vibrate) navigator.vibrate(Math.round(8 + strength * 12));
      else if (this.el) this.el.click();
    } catch (e) { /* ignore */ }
  },
};
