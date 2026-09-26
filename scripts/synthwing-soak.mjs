#!/usr/bin/env node
// =============================================================================
// SYNTHWING 64 — chaos / soak test
//
// Drives the real game in headless Chromium and fails if anything throws:
// page errors, console errors, or errors the game's own guard logged
// (window.SYNTHWING_ERRORS).
//
//   node scripts/synthwing-soak.mjs [--minutes 3] [--suite monkey,campaign,storage,lifecycle]
//
// Suites
//   monkey     random taps, swipes and keys across every screen, mixed with
//              rotations, backgrounding, focus loss, WebGL context loss and
//              audio suspends
//   campaign   an autopilot plays all five stages with random ships, including
//              runs that die, continue and reach game over
//   storage    broken localStorage and a set of corrupted / hostile saves
//   lifecycle  backgrounding pauses play; context loss restores mid-game
//
// Needs Playwright's Chromium (npm i -D @playwright/test && npx playwright install
// chromium). Set PLAYWRIGHT_MODULE to load Playwright from another path.
// =============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/game/synthwing');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const MINUTES = parseFloat(opt('minutes', '3'));
const SUITES = opt('suite', 'storage,lifecycle,monkey,campaign').split(',');

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, '@playwright/test', 'playwright'].filter(Boolean);
  for (const m of tries) { try { const mod = await import(m); return mod.chromium || mod.default.chromium; } catch (e) { /* next */ } }
  throw new Error('Playwright not found. Run: npm i -D @playwright/test && npx playwright install chromium');
}

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// In-page helpers: autopilot, fast-forward, chaos events.
const HELPERS = `
window.__soak = {
  bot(invincible, fast) {
    const G = Game, orig = Input.poll.bind(Input); let t = 0;
    Input.poll = function (dt) {
      orig(dt);
      const P = G.player;
      if (invincible && P.alive) P.invuln = Math.max(P.invuln, 1);
      if (G.state !== 'play' || !P.alive || G.overlay) return;
      let best = null, bd = 1e9;
      for (const e of G.enemies) { if (e.dead) continue; const off = e.d - P.d; if (off < 12 || off > 220) continue; const dd = Math.hypot(e.x - P.x, e.y - P.y) + off * 0.05; if (dd < bd) { bd = dd; best = e; } }
      if (G.boss && !G.boss.dead && !G.boss.entering) for (const p of G.boss.parts) { if (!p.alive || !p.weak || p.invuln) continue; const dd = Math.hypot(p.x - P.x, p.y - P.y); if (dd < bd + 20) { bd = dd; best = p; } }
      let mx = 0, my = 0;
      if (best) { mx = Math.max(-1, Math.min(1, (best.x - P.x) / 5)); my = Math.max(-1, Math.min(1, (best.y - P.y) / 5)); }
      Input.move.x = mx; Input.move.y = my;
      t += dt;
      if (t % 1.5 < 1.25) { if (!Input.fire) Input.firePressed = true; Input.fire = true; } else if (Input.fire) { Input.fire = false; Input.fireReleased = true; }
      if (Math.random() < dt * 0.3) Input.rollPressed = true;
      if (Math.random() < dt * 0.05) Input.bombPressed = true;
    };
    const frame = Game.frame.bind(Game), render = Game.render, draw = HUD.draw;
    window.__fast = fast || 1;
    Game.frame = function (dt) {
      for (let i = 1; i < window.__fast; i++) { Game.render = () => {}; HUD.draw = () => {}; try { frame(dt); } finally { Game.render = render; HUD.draw = draw; } }
      frame(dt);
    };
  },
  hide(hidden) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  },
  loseContext(ms) {
    const ext = Game.renderer.gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); setTimeout(() => { try { ext.restoreContext(); } catch (e) { reportError('soak', e); } }, ms);
    return true;
  },
};
`;

async function main() {
  const chromium = await loadPlaywright();
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/index.html`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
  const report = {};
  let failures = 0;

  async function session(name, { viewport = { width: 956, height: 440 }, init } = {}, body) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    if (init) await ctx.addInitScript(init);
    await ctx.addInitScript(HELPERS);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
    const t0 = Date.now();
    let note = '';
    try {
      await page.goto(url);
      await page.waitForFunction(() => typeof Game !== 'undefined' && !!Game.state, null, { timeout: 30000 });
      note = (await body(page)) || '';
      const logged = await page.evaluate(() => (window.SYNTHWING_ERRORS || []).map((e) => e.where + ': ' + e.msg.split('\n')[0]));
      for (const l of logged) if (!errors.some((e) => e.includes(l.split(': ').slice(1).join(': ').slice(0, 60)))) errors.push('logged: ' + l);
    } catch (e) { errors.push('harness: ' + e.message.split('\n')[0]); }
    await ctx.close();
    const uniq = [...new Set(errors)];
    report[name] = { seconds: Math.round((Date.now() - t0) / 1000), errors: uniq.length, note, sample: uniq.slice(0, 8) };
    failures += uniq.length;
    console.log(`${uniq.length ? 'FAIL' : 'ok  '}  ${name.padEnd(28)} ${String(report[name].seconds).padStart(4)}s  ${note}`);
    for (const e of uniq.slice(0, 8)) console.log('        ' + e);
  }

  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const VIEWS = [{ width: 956, height: 440 }, { width: 440, height: 956 }, { width: 1180, height: 820 }, { width: 667, height: 375 }];

  if (SUITES.includes('storage')) {
    const saves = [
      '{', 'null', '[]', '"text"', '42',
      JSON.stringify({ settings: { music: 'loud', sfx: null, voice: -3, diff: 7, res: 999, sens: 'x', steer: 'joystick', haptics: 'yes', lefty: 'no' } }),
      JSON.stringify({ best: [], medals: 'all', forks: null, hiscore: 'high', unlocked: 99, vehicle: 12, plays: -1, awards: 'x', settings: [] }),
      JSON.stringify({ vehicle: 'maestro', gold: false, settings: { v: 1, haptics: true } }),
      JSON.stringify({ best: { corona: 'NaN', halo: 1e308 }, unlocked: 5, cleared: true, gold: true, vehicle: 'maestro' }),
    ];
    for (const [i, raw] of saves.entries()) {
      await session('storage: corrupt save #' + (i + 1), { init: `try { localStorage.setItem('synthwing64.save.v1', ${JSON.stringify(raw)}); } catch (e) {}` }, async (page) => {
        await page.evaluate(() => { AudioSys.unlock(); HUD.playStage(Math.floor(Math.random() * Game.save.unlocked)); });
        await page.waitForFunction(() => Game.state === 'hangar', null, { timeout: 20000 });
        await page.evaluate(() => { Game.hangarSelect(1); Game.hangarLaunch(); if (Game.state !== 'brief') { Game.hangarSelect(-1); Game.hangarLaunch(); } });
        await page.waitForFunction(() => Game.state === 'brief', null, { timeout: 20000 });
        await page.evaluate(() => { Game.briefDone = true; Game.launchStage(); Game.writeSave(); });
        await page.waitForTimeout(2500);
        return await page.evaluate(() => `diff=${Game.settings.diff} music=${Game.settings.music} ship=${Game.player.V.id}`);
      });
    }
    await session('storage: localStorage throws', { init: `Storage.prototype.getItem = () => { throw new Error('denied'); }; Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };` }, async (page) => {
      await page.evaluate(() => { AudioSys.unlock(); HUD.playStage(0); Game.hangarLaunch(); Game.briefDone = true; Game.launchStage(); Game.writeSave(); });
      await page.waitForTimeout(3000);
      return await page.evaluate(() => 'state=' + Game.state);
    });
  }

  if (SUITES.includes('lifecycle')) {
    await session('lifecycle: pause & restore', {}, async (page) => {
      await page.evaluate(() => { AudioSys.unlock(); HUD.playStage(0); Game.hangarLaunch(); Game.briefDone = true; Game.launchStage(); });
      await page.waitForFunction(() => Game.state === 'play' && Game.phase === 'main', null, { timeout: 60000 });
      const paused = await page.evaluate(() => { __soak.hide(true); const p = Game.overlay === 'pause'; __soak.hide(false); return p; });
      if (!paused) throw new Error('backgrounding did not pause the game');
      await page.evaluate(() => Game.resume());
      const lost = await page.evaluate(() => __soak.loseContext(400));
      await page.waitForTimeout(1500);
      const drawing = await page.evaluate(() => !Game.renderer.lost && Game.renderer.stats.draws > 0);
      await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
      const blurPaused = await page.evaluate(() => Game.overlay === 'pause');
      await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); Game.resume(); });
      for (const v of VIEWS) { await page.setViewportSize(v); await page.waitForTimeout(250); }
      return `paused-on-background=${paused} context-lost=${lost} redrawing=${drawing} paused-on-blur=${blurPaused}`;
    });
  }

  if (SUITES.includes('monkey')) {
    for (const [i, vp] of [VIEWS[0], VIEWS[1]].entries()) {
      await session('monkey: ' + (i ? 'portrait' : 'landscape'), { viewport: vp }, async (page) => {
        const end = Date.now() + MINUTES * 60000 * 0.25;
        let n = 0; const seen = new Set();
        while (Date.now() < end) {
          const v = page.viewportSize(), r = Math.random();
          if (r < 0.62) await page.touchscreen.tap(Math.random() * v.width, Math.random() * v.height);
          else if (r < 0.72) { await page.mouse.move(Math.random() * v.width, Math.random() * v.height); await page.mouse.down(); await page.mouse.move(Math.random() * v.width, Math.random() * v.height, { steps: 4 }); await page.mouse.up(); }
          else if (r < 0.9) await page.keyboard.press(pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'Escape', 'KeyK', 'ShiftLeft', 'KeyP', 'KeyQ', 'KeyE', 'KeyJ']));
          else if (r < 0.93) await page.setViewportSize(pick(VIEWS));
          else if (r < 0.95) await page.evaluate(() => { __soak.hide(true); setTimeout(() => __soak.hide(false), 200); });
          else if (r < 0.96) await page.evaluate(() => __soak.loseContext(300));
          else if (r < 0.97) await page.evaluate(() => { window.dispatchEvent(new Event('blur')); AudioSys.suspend(); });
          else { // legal shortcuts deeper into the game
            await page.evaluate(() => {
              const k = Math.random();
              if (Game.state === 'title' && !HUD.sub) HUD.playStage(Math.floor(Math.random() * 5));
              else if (Game.state === 'hangar') { Game.hangarSelect(1); Game.hangarLaunch(); }
              else if (Game.state === 'brief') { Game.briefDone = true; Game.launchStage(); }
              else if (Game.state === 'play' && !Game.overlay) {
                const P = Game.player;
                if (k < 0.3) P.powerUp(POWER_WEIGHTS[Math.floor(Math.random() * POWER_WEIGHTS.length)][0]);
                else if (k < 0.5) Game.spawnPod(0, 2);
                else if (k < 0.65) { P.invuln = 0; P.hurt(999); }
                else if (k < 0.8) { Game.stageTime += Game.barDur * 8; }
                else Game.finishStage();
              }
            });
          }
          seen.add(await page.evaluate(() => Game.state + (Game.overlay ? '+' + Game.overlay : '') + (HUD.sub ? '/' + HUD.sub : '')));
          n++;
        }
        return `${n} actions, screens: ${[...seen].sort().join(' ')}`;
      });
    }
  }

  if (SUITES.includes('campaign')) {
    for (let s = 0; s < 5; s++) {
      const ship = pick(['synthwing', 'bassline', 'arpeggio', 'maestro']);
      const mortal = s === 1 || s === 3;
      await session(`campaign: stage ${s + 1} ${ship}${mortal ? ' (mortal)' : ''}`, { init: `try { localStorage.setItem('synthwing64.save.v1', JSON.stringify({ gold: true, unlocked: 5, vehicle: '${ship}' })); } catch (e) {}` }, async (page) => {
        await page.evaluate(([st, mortal]) => { AudioSys.unlock(); __soak.bot(!mortal, 3); HUD.playStage(st); Game.hangarLaunch(); Game.briefDone = true; Game.launchStage(); }, [s, mortal]);
        const deadline = Date.now() + Math.max(4, MINUTES * 2) * 60000;
        let continues = 0, tick = 0, ending = false;
        while (Date.now() < deadline) {
          await page.waitForTimeout(1500);
          const st = await page.evaluate(() => Game.state);
          if (st === 'results') {
            if (s < 4) break;
            await page.waitForTimeout(2000); await page.evaluate(() => { Input.nav.ok = true; }); // on to the ending
            continue;
          }
          if (st === 'ending') { ending = true; await page.waitForTimeout(14000); await page.evaluate(() => { Input.nav.ok = true; }); await page.waitForTimeout(1500); break; }
          if (st === 'gameover') { if (continues++ >= 1) break; await page.waitForTimeout(1500); await page.evaluate(() => Game.continueGame()); }
          // mortal runs: shoot the ship down now and then to walk respawn / game over / continue
          if (mortal && ++tick % 6 === 0) await page.evaluate(() => { const P = Game.player; if (Game.state === 'play' && P.alive) { P.invuln = 0; P.hurt(9999); } });
        }
        return await page.evaluate(([c, e]) => `end=${Game.state} kills=${Game.stats.kills} deaths=${Game.stats.deaths} continues=${c}${e ? ' ending=seen' : ''} score=${Game.score}`, [continues, ending]);
      });
    }
  }

  await browser.close(); srv.close();
  console.log(`\n${failures ? 'FAILED' : 'PASSED'}: ${Object.keys(report).length} sessions, ${failures} distinct errors`);
  if (process.env.SOAK_REPORT) fs.writeFileSync(process.env.SOAK_REPORT, JSON.stringify(report, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
