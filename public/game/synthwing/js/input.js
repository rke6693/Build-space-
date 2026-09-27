'use strict';
// =============================================================================
// SYNTHWING 64 — input.js
// Multi-touch virtual controls (floating analog stick or relative "pad"),
// on-screen FIRE / BOMB / ROLL buttons, keyboard, and gamepads (an MFi/Xbox/
// DualSense controller paired to an iPhone works through the Gamepad API).
// =============================================================================

// getGamepads() throws a SecurityError where a permissions policy blocks it
// (e.g. inside some iframes), so every call goes through here.
function safePads() { try { return (navigator.getGamepads && navigator.getGamepads()) || []; } catch (e) { return []; } }

const Input = {
  mode: 'menu', // 'menu' | 'play'
  move: { x: 0, y: 0 },
  padDelta: { x: 0, y: 0 },
  fire: false, firePressed: false, fireReleased: false,
  bombPressed: false, rollPressed: false, rollDir: 0, pausePressed: false,
  nav: { up: false, down: false, left: false, right: false, ok: false, back: false },
  clicks: [], swipe: 0, anyPress: false,
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
    this.anyPress = true;
    AudioSys.unlock();
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { this.lastDevice = 'touch'; this.touchSeen = true; } else this.lastDevice = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    const [x, y] = this.toHud(e.clientX, e.clientY);
    const p = { x, y, sx: x, sy: y, t: performance.now(), role: 'ui' };
    this.pointers.set(e.pointerId, p);
    const L = this.layout;
    if (this.mode === 'play' && L) {
      if (this.hitRect(L.pause, x, y)) { p.role = 'pause'; this.pausePressed = true; Haptics.ui(); return; }
      if (this.hitCircle(L.bomb, x, y)) { p.role = 'bomb'; this.bombPressed = true; Haptics.ui(); return; }
      if (this.hitCircle(L.roll, x, y)) { p.role = 'roll'; this.rollPressed = true; this.rollDir = 0; Haptics.ui(); return; }
      const onFire = this.hitCircle(L.fire, x, y, 1.35);
      const stickSide = L.leftHanded ? x > L.W * 0.5 : x < L.W * 0.5;
      if (onFire || !stickSide) { p.role = 'fire'; if (!this.fire) { this.firePressed = true; Haptics.fire(true); } this.fire = true; return; }
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
    if (!cancel && e.pointerType !== 'mouse') Haptics.release(p.role, p.x, p.y);
    if (p.role === 'stick') {
      this.stick.active = false; this.move.x = 0; this.move.y = 0;
      // a quick horizontal flick = barrel roll in that direction
      const dt = performance.now() - p.t, dx = p.x - p.sx;
      if (dt < 180 && Math.abs(dx) > 26) { this.rollPressed = true; this.rollDir = Math.sign(dx); Haptics.release('flick'); }
    } else if (p.role === 'fire') {
      let still = false;
      for (const q of this.pointers.values()) if (q.role === 'fire') still = true;
      if (!still) { this.fire = false; this.fireReleased = true; }
    } else if (p.role === 'ui' && !cancel) {
      const dx = p.x - p.sx, dy = p.y - p.sy;
      if (Math.hypot(dx, dy) < 14) this.clicks.push({ x: p.x, y: p.y });
      else if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.5 && performance.now() - p.t < 600) this.swipe = Math.sign(dx);
    }
  },
  stickRadius() { return this.layout ? this.layout.stickR : 30; },

  onKey(e, down) {
    const k = e.code;
    if (down) {
      if (this.keys.has(k)) return;
      this.keys.add(k); this.lastDevice = 'keyboard'; this.anyPress = true;
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
    const pads = safePads();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const l = Math.hypot(ax, ay);
      if (l > 0.15) { const k = Math.min(1, (l - 0.15) / 0.85) / l; mx += ax * k; my -= ay * k; this.lastDevice = 'gamepad'; }
      const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const prev = this.gpPrev[gp.index] || [];
      const edge = (i) => b(i) && !prev[i];
      const rel = (i) => !b(i) && prev[i];
      for (let i = 0; i < gp.buttons.length; i++) if (edge(i)) this.anyPress = true;
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
    this.clicks.length = 0; this.swipe = 0; this.anyPress = false;
  },
};

// iOS Safari has no Vibration API, but toggling a native <input switch>
// produces a system haptic tick on iOS 18+. Android uses navigator.vibrate.
// Tactile feedback. iPhone Safari has no vibration API, but since iOS 18
// toggling an <input type=checkbox switch> plays the system's light "tick", so
// on iOS every pattern is a sequence of ticks. WebKit only plays that tick
// while handling a real user gesture, and for touch that is a finger lifting
// (pointerup), not touching down or the game loop, so Input.onUp calls
// Haptics.release() with what the finger was doing. Android gets real
// vibration patterns from anywhere and gamepads rumble.
//            Android pattern (ms)     iOS ticks (ms offsets)     pad [ms, strong, weak]
const HAPTIC = {
  ui: [[8], [0], [40, 0, 0.3]],
  fire: [[7], [0], [45, 0, 0.22]],
  lock: [[6], [0], [30, 0, 0.35]],
  kill: [[14], [0], [80, 0.25, 0.45]],
  scrape: [[18], [0], [90, 0.2, 0.5]],
  pickup: [[10, 50, 14], [0, 90], [120, 0.1, 0.4]],
  roll: [[10, 40, 10], [0, 110], [160, 0.2, 0.3]],
  bigkill: [[25, 30, 40], [0, 70], [220, 0.7, 0.6]],
  warn: [[30, 90, 30], [0, 120], [260, 0.3, 0.5]],
  hit: [[45, 35, 70], [0, 60, 130], [320, 1, 0.8]],
  bomb: [[70, 40, 110], [0, 60, 120, 220], [500, 1, 1]],
  down: [[120, 60, 60, 60, 220], [0, 80, 160, 260, 400, 560], [900, 1, 1]],
  boss: [[90, 50, 140, 60, 200], [0, 70, 140, 240, 360], [900, 1, 1]],
};
const HAPTIC_PRIO = { ui: 0, fire: 0, lock: 0, kill: 1, scrape: 1, pickup: 1, roll: 1, bigkill: 2, warn: 2, hit: 3, bomb: 3, down: 4, boss: 4 };

const Haptics = {
  level: 2, // 0 off · 1 light (single ticks, no autofire buzz) · 2 full
  switchTick: false, busyUntil: 0, busyPrio: 0, lastFire: 0, lastTick: 0, lastGestureTick: 0,
  init() { this.switchTick = !navigator.vibrate && !Native.ok; }, // the iOS app has the real Taptic Engine
  // gesture ticks keep their own rate limit so a best-effort tick that iOS
  // ignored (touch-down, game loop) never swallows one it would have played
  tick(gesture) {
    const now = performance.now();
    if (now - (gesture ? this.lastGestureTick : this.lastTick) < 30) return;
    this.lastTick = now; if (gesture) this.lastGestureTick = now;
    try { // a fresh hidden switch each time, as in the known-working ios-haptics approach
      const label = document.createElement('label'), inp = document.createElement('input');
      label.setAttribute('aria-hidden', 'true'); label.style.display = 'none';
      inp.type = 'checkbox'; inp.setAttribute('switch', ''); inp.tabIndex = -1;
      label.appendChild(inp); document.head.appendChild(label);
      label.click(); label.remove();
    } catch (e) { /* ignore */ }
  },
  ticks(offsets, gesture) { for (const at of offsets) { if (at) setTimeout(() => this.tick(gesture), at); else this.tick(gesture); } }, // WebKit forwards the gesture to timers < 1s
  // iOS: called from pointerup (inside the gesture) with the lifted finger's role.
  release(role, x, y) {
    if (!this.level || !this.switchTick) return;
    const full = this.level > 1, P = Game.player;
    if (role === 'fire') { const n = P.locks.length; this.ticks(n && full ? Array.from({ length: Math.min(n, 6) }, (_, i) => i * 55) : [0], true); } // lock-on volley
    else if (role === 'bomb') this.ticks(Game.bomb && full ? HAPTIC.bomb[1] : [0], true);
    else if (role === 'roll') this.ticks(P.rolling && full ? HAPTIC.roll[1] : [0], true);
    else if (role === 'flick') this.ticks(full ? HAPTIC.roll[1] : [0], true);
    else if (role === 'ui' && HUD.btns.some((b) => x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h)) this.tick(true);
  },
  play(kind) {
    const H = HAPTIC[kind];
    if (!this.level || !H) return;
    const now = performance.now(), prio = HAPTIC_PRIO[kind], light = this.level === 1;
    if (now < this.busyUntil && prio < this.busyPrio) return; // small ticks never cut off a big pattern
    const [pat, ticks, pad] = H;
    this.busyUntil = now + pat.reduce((a, b) => a + b, 0); this.busyPrio = prio;
    if (Input.lastDevice === 'gamepad') this.rumble(pad, light ? 0.5 : 1);
    if (Native.ok) { Native.haptic(kind, light); return; }
    if (navigator.vibrate) { try { navigator.vibrate(light ? Math.ceil(pat[0] * 0.6) : pat); } catch (e) { /* ignore */ } return; }
    if (this.switchTick) this.ticks(light ? [0] : ticks); // best effort outside a gesture
  },
  rumble(pad, k) {
    const pads = safePads();
    for (const gp of pads) {
      if (!gp || !gp.vibrationActuator) continue;
      try {
        const r = gp.vibrationActuator.playEffect('dual-rumble', { duration: pad[0], strongMagnitude: pad[1] * k, weakMagnitude: pad[2] * k });
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* ignore */ }
      return;
    }
  },
  ui() { this.play('ui'); },
  // Every shot on FULL; only the trigger press on LIGHT.
  fire(press) {
    const now = performance.now();
    if (!press && (this.level < 2 || now - this.lastFire < 95)) return;
    this.lastFire = now;
    this.play('fire');
  },
  impact(kind) { this.play(kind); },
};
