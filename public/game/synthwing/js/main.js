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
  Haptics.init();
  HUD.resize();

  // Keep the screen awake while playing (where supported).
  let wake = null;
  const askWake = () => { if (navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then((w) => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); };
  window.addEventListener('pointerdown', askWake, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (Game.state === 'play' && !Game.overlay) Game.pause();
      AudioSys.suspend();
    } else if (!Game.overlay) AudioSys.resume();
  });

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    try { Game.frame(dt); } catch (e) { console.error(e); if (!loop.errShown) { loop.errShown = true; fail('Something went wrong. Reload the page to keep playing.'); } }
  }
  requestAnimationFrame(loop);
})();
