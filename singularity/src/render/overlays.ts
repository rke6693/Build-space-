import * as THREE from 'three';
import { N_CELLS } from '../sim/config';
import { mmiFromPga } from '../sim/systems/earthquake';
import type { City, Frame } from '../sim/types';
import { DAMAGE_COLORS, DAMAGE_NAMES } from '../ui/format';

export type GroundOverlay = 'none' | 'shaking' | 'soil' | 'fire' | 'smoke' | 'damage' | 'power' | 'rain' | 'flood';

// USGS-style MMI palette (I..X+)
const MMI = ['#ffffff', '#bfccff', '#a0e6ff', '#80ffff', '#7aff93', '#ffff00', '#ffc800', '#ff9100', '#ff0000', '#c80000', '#800000'].map((c) => new THREE.Color(c));
const tmp = new THREE.Color();

/** Writes an RGBA8 analysis overlay (128² cells) for the terrain shader. Returns true if non-empty. */
export function writeOverlay(kind: GroundOverlay, out: Uint8Array, f: Frame, city: City, cellSub: Int16Array, cellMaxDS: Uint8Array): boolean {
  out.fill(0);
  if (kind === 'none' || kind === 'flood') return false;
  const put = (c: number, col: THREE.Color, a: number) => {
    out[c * 4] = Math.min(255, col.r * 255);
    out[c * 4 + 1] = Math.min(255, col.g * 255);
    out[c * 4 + 2] = Math.min(255, col.b * 255);
    out[c * 4 + 3] = Math.min(255, a * 255);
  };
  for (let c = 0; c < N_CELLS; c++) {
    switch (kind) {
      case 'shaking': {
        const live = f.shaking[c];
        const g = Math.max(f.peakPGA[c], live);
        if (g < 0.005) break;
        const mmi = mmiFromPga(g);
        const idx = Math.min(10, Math.max(0, Math.floor(mmi) - 1));
        tmp.copy(MMI[idx]).lerp(MMI[Math.min(10, idx + 1)], mmi % 1);
        if (live > 0.01) tmp.lerp(new THREE.Color(1, 1, 1), Math.min(0.5, live));
        put(c, tmp, 0.72);
        break;
      }
      case 'soil': {
        const s = city.soil[c];
        const settle = f.settlement[c];
        tmp.setRGB(0.95, 0.85 - s * 0.45, 0.25 - s * 0.2);
        if (settle > 0.02) tmp.lerp(new THREE.Color(0.6, 0.1, 0.4), Math.min(1, settle * 2));
        put(c, tmp, 0.25 + s * 0.55);
        break;
      }
      case 'fire': {
        const b = f.burn[c];
        if (b > 0) put(c, tmp.setRGB(1, 0.25 + b * 0.6, 0.05), 0.55 + b * 0.4);
        break;
      }
      case 'smoke': {
        const s = f.smoke[c];
        if (s > 0.02) put(c, tmp.setRGB(0.55, 0.55, 0.6), Math.min(0.85, s * 0.6));
        break;
      }
      case 'damage': {
        const ds = cellMaxDS[c];
        if (ds > 0) {
          tmp.set(DAMAGE_COLORS[ds]);
          put(c, tmp, 0.35 + ds * 0.12);
        }
        break;
      }
      case 'power': {
        const s = cellSub[c];
        if (s < 0) break;
        const a = f.assets[s];
        if (!a) break;
        if (a.energized) put(c, tmp.set('#1f9fd0'), 0.28);
        else put(c, tmp.set('#d02f4a'), 0.5);
        break;
      }
      case 'rain': {
        const i = Math.floor((c % 128) / 4);
        const j = Math.floor(Math.floor(c / 128) / 4);
        const cl = f.clouds[j * 32 + i] ?? 0;
        const intensity = f.eff.rainfall * (0.35 + 1.3 * cl);
        if (intensity > 0.5) put(c, tmp.setRGB(0.2, 0.5 + Math.min(0.5, intensity / 120), 1), Math.min(0.75, intensity / 80));
        break;
      }
    }
  }
  return true;
}

/** Per-cell serving substation for the power overlay. */
export function cellSubstations(city: City): Int16Array {
  const out = new Int16Array(N_CELLS).fill(-1);
  const b = city.buildings;
  for (let k = 0; k < b.count; k++) out[b.cell[k]] = b.substation[k];
  return out;
}

export const OVERLAY_LEGENDS: Record<GroundOverlay, { title: string; stops: [string, string][] } | null> = {
  none: null,
  flood: { title: 'Flood depth', stops: [['#8ce6ff', '< 0.5 m'], ['#1a73ff', '1 m'], ['#5a1abf', '2 m'], ['#e61a73', '≥ 3 m']] },
  shaking: { title: 'Peak shaking (MMI)', stops: [['#a0e6ff', 'III'], ['#7aff93', 'V'], ['#ffff00', 'VI'], ['#ff9100', 'VII'], ['#ff0000', 'VIII'], ['#800000', 'X']] },
  soil: { title: 'Liquefaction susceptibility', stops: [['#f2d840', 'low'], ['#f2a02a', 'medium'], ['#e0741a', 'high'], ['#991a66', 'settled']] },
  fire: { title: 'Fire intensity', stops: [['#ff4a0d', 'igniting'], ['#ff990d', 'burning'], ['#ffd40d', 'fully involved']] },
  smoke: { title: 'Smoke density', stops: [['#8c8c99', 'haze'], ['#555560', 'dense']] },
  damage: { title: 'Worst building damage per block', stops: DAMAGE_COLORS.map((c, i) => [c, DAMAGE_NAMES[i].toLowerCase()] as [string, string]) },
  power: { title: 'Grid service area', stops: [['#1f9fd0', 'energised'], ['#d02f4a', 'no grid power']] },
  rain: { title: 'Rainfall intensity', stops: [['#337fff', 'light'], ['#33ffff', 'heavy']] },
};
