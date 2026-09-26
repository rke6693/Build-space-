'use strict';
// =============================================================================
// SYNTHWING 64 — native.js
// Bridge to the native iOS shell (Capacitor build in apps/synthwing-ios).
// In a browser Native.ok is false and every call is a harmless no-op; in the
// app it drives the Taptic Engine and Game Center. Nothing here can throw.
// =============================================================================

const GC_PREFIX = 'synthwing64.';
// Taptic patterns: [ms offset, style] with style LIGHT | MEDIUM | HEAVY,
// or a notification type SUCCESS | WARNING | ERROR.
const NATIVE_HAPTICS = {
  ui: [[0, 'LIGHT']], fire: [[0, 'LIGHT']], lock: [[0, 'LIGHT']],
  kill: [[0, 'MEDIUM']], scrape: [[0, 'MEDIUM']], roll: [[0, 'MEDIUM'], [110, 'LIGHT']],
  pickup: [[0, 'SUCCESS']], bigkill: [[0, 'HEAVY'], [70, 'MEDIUM']], warn: [[0, 'WARNING']],
  hit: [[0, 'HEAVY'], [60, 'HEAVY'], [130, 'MEDIUM']],
  bomb: [[0, 'HEAVY'], [60, 'HEAVY'], [120, 'MEDIUM'], [220, 'HEAVY'], [340, 'MEDIUM']],
  down: [[0, 'ERROR'], [120, 'HEAVY'], [240, 'HEAVY'], [400, 'MEDIUM'], [560, 'LIGHT']],
  boss: [[0, 'SUCCESS'], [90, 'HEAVY'], [200, 'HEAVY'], [340, 'MEDIUM'], [500, 'HEAVY']],
};

const Native = {
  ok: false, hap: null, gc: null, gcReady: false,
  init() {
    try {
      const C = window.Capacitor;
      this.ok = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
      if (!this.ok) return;
      const reg = (n) => (typeof C.registerPlugin === 'function' ? C.registerPlugin(n) : C.Plugins && C.Plugins[n]) || null;
      this.hap = reg('Haptics');
      this.gc = reg('GameCenter');
      this.call(this.gc, 'authenticate').then((r) => { this.gcReady = !!(r && r.authenticated); });
    } catch (e) { this.ok = false; }
  },
  // Plugin calls return promises that may reject (plugin missing, user signed
  // out of Game Center...). Swallow all of it; the game never depends on them.
  call(plugin, method, arg) {
    try {
      if (!plugin || typeof plugin[method] !== 'function') return Promise.resolve(null);
      return Promise.resolve(plugin[method](arg)).catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  },
  haptic(kind, light) {
    const pat = NATIVE_HAPTICS[kind];
    if (!this.hap || !pat) return;
    for (const [at, style] of light ? pat.slice(0, 1) : pat) {
      const go = () => (['SUCCESS', 'WARNING', 'ERROR'].includes(style) ? this.call(this.hap, 'notification', { type: style }) : this.call(this.hap, 'impact', { style }));
      if (at) setTimeout(go, at); else go();
    }
  },
  submitScore(board, value) {
    if (this.gcReady && value > 0) this.call(this.gc, 'submitScore', { leaderboardId: GC_PREFIX + board, score: Math.round(value) });
  },
  achieve(id) { if (this.gcReady) this.call(this.gc, 'reportAchievement', { achievementId: GC_PREFIX + id, percent: 100 }); },
  showGameCenter() { this.call(this.gc, 'showDashboard'); },
};
