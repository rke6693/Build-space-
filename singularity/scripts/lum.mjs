// average luminance of PNG files (uses the browser to decode)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
for (const f of process.argv.slice(2)) {
  const data = readFileSync(f).toString('base64');
  const v = await p.evaluate(async (d) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + d;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] * 0.2 + px[i + 1] * 0.7 + px[i + 2] * 0.1;
    return s / (px.length / 4);
  }, data);
  console.log(f.split('/').pop(), v.toFixed(1));
}
await b.close();
