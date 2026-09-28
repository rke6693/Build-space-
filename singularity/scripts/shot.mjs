// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [actions-json]
import { chromium } from '@playwright/test';
const [url, out, wait = '8000', actions = '[]'] = process.argv.slice(2);
const opts = (path) => (/\.jpe?g$/i.test(path) ? { path, type: 'jpeg', quality: 82 } : { path });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(Number(wait));
try {
  for (const a of JSON.parse(actions)) {
    if (a.click) await page.click(a.click, { timeout: 10000, ...(a.pos ? { position: a.pos } : {}) });
    if (a.key) await page.keyboard.press(a.key);
    if (a.mouse) await page.mouse.click(a.mouse.x, a.mouse.y);
    if (a.wait) await page.waitForTimeout(a.wait);
    if (a.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(a.eval)));
    if (a.shot) await page.screenshot(opts(a.shot));
  }
} catch (e) {
  logs.push('[action-error] ' + e.message.split('\n').slice(0, 14).join(' / '));
}
await page.screenshot(opts(out));
console.log(logs.slice(-40).join('\n'));
await browser.close();
