'use strict';
// =============================================================================
// SYNTHWING 64 — main.js — boot & main loop
// =============================================================================
(function boot() {
  const glCanvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  const fail = (msg) => {
    const el = document.getElementById('err');
    if (el) { el.textContent = msg; el.style.display = 'flex'; }
  };
  try {
    Font.init();
    buildTextures();
    buildModels();
    buildBossModels();
    buildEnvs();
    FX.init();
    Game.init(glCanvas);
  } catch (e) {
    console.error(e);
    fail('SYNTHWING 64 needs WebGL2. Update to the latest Safari, Chrome, Firefox or Edge and reload.');
    return;
  }
  HUD.init(hudCanvas);
  Input.init(hudCanvas);
  Native.init();
  Haptics.init();
  HUD.resize();

  // Keep the screen awake while playing (where supported).
  let wake = null;
  const askWake = () => { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then((w) => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); };
  window.addEventListener('pointerdown', askWake, { passive: true });

  // App lifecycle: going to the background (home swipe, app switcher, a call,
  // Control Center) pauses a live game and silences audio; coming back waits
  // on the pause menu so nothing happens before the player is ready.
  let last = performance.now();
  const toBackground = () => { if (Game.state === 'play' && !Game.overlay && Game.phase !== 'clear') Game.pause(); AudioSys.suspend(); };
  const toForeground = () => { if (!Game.overlay) AudioSys.resume(); last = performance.now(); };
  document.addEventListener('visibilitychange', () => (document.hidden ? toBackground() : toForeground()));
  window.addEventListener('pagehide', toBackground);
  window.addEventListener('pageshow', (e) => { if (e.persisted) toForeground(); });
  window.addEventListener('blur', () => { if (Game.state === 'play' && !Game.overlay && Game.phase !== 'clear') Game.pause(); });

  // Frame guard: an exception is logged (window.SYNTHWING_ERRORS), the frame's
  // one-shot input is still cleared, and if a screen keeps failing the game
  // drops back to the title instead of freezing.
  window.addEventListener('error', (e) => reportError('window', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));
  let burst = 0, burstT = 0, recoveries = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!(dt > 0)) return;
    try { Game.frame(dt); } catch (e) {
      reportError('frame:' + Game.state, e);
      try { Input.endFrame(); const g = HUD.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } catch (e2) { /* keep going */ }
      if (now - burstT > 3000) { burstT = now; burst = 0; }
      if (++burst >= 12) {
        burst = 0;
        if (++recoveries > 3) fail('Something went wrong. Reload to keep playing.');
        else try { Game.recover(); } catch (e3) { reportError('recover', e3); }
      }
    }
  }
  requestAnimationFrame(loop);
})();
