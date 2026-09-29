/* Renders the app icons (a lit orb over a dark bay horizon) into public/icons. */
import { mkdirSync } from 'node:fs';
import { writePng } from './png';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

function icon(size: number): Uint8Array {
  const rgb = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // background: deep navy with a faint horizon glow
      let r = mix(7, 12, v);
      let g = mix(12, 26, v);
      let b = mix(20, 40, v);
      const horizon = Math.exp(-Math.pow((v - 0.7) / 0.05, 2)) * 0.5;
      r += 40 * horizon;
      g += 120 * horizon;
      b += 150 * horizon;
      // orb
      const dx = u - 0.5;
      const dy = v - 0.47;
      const d = Math.hypot(dx, dy);
      const R = 0.27;
      const inside = 1 - smooth(R - 0.006, R + 0.006, d);
      const lx = (u - 0.4) / R;
      const ly = (v - 0.36) / R;
      const light = clamp01(1 - Math.hypot(lx, ly) * 0.75);
      const or = mix(11, 156, light * light);
      const og = mix(36, 240, light);
      const ob = mix(56, 255, Math.sqrt(light));
      const halo = Math.exp(-Math.pow((d - R) / 0.05, 2)) * 0.55 * (1 - inside);
      r = mix(r, or, inside) + 90 * halo;
      g = mix(g, og, inside) + 209 * halo;
      b = mix(b, ob, inside) + 230 * halo;
      const k = (y * size + x) * 3;
      rgb[k] = Math.min(255, r);
      rgb[k + 1] = Math.min(255, g);
      rgb[k + 2] = Math.min(255, b);
    }
  }
  return rgb;
}

mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]] as const) {
  writePng(`public/icons/${name}.png`, size, size, icon(size));
}
console.log('icons written to public/icons');
