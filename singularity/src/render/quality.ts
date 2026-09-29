export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  post: boolean;
  bloom: boolean;
  particleScale: number;
  treeScale: number;
  fireLights: number;
  maxAgents: number;
  cloudLayers: number;
  envMap: boolean;
}

export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

export function qualitySettings(level: QualityLevel, dpr: number): QualitySettings {
  switch (level) {
    case 'low':
      return { level, pixelRatio: Math.min(dpr, 1) * 0.75, shadows: false, shadowMapSize: 512, post: false, bloom: false, particleScale: 0.3, treeScale: 0.35, fireLights: 0, maxAgents: 1200, cloudLayers: 1, envMap: false };
    case 'medium':
      return { level, pixelRatio: Math.min(dpr, 1), shadows: true, shadowMapSize: 1024, post: true, bloom: true, particleScale: 0.6, treeScale: 0.65, fireLights: 1, maxAgents: 2500, cloudLayers: 1, envMap: true };
    case 'high':
      return { level, pixelRatio: Math.min(dpr, 1.5), shadows: true, shadowMapSize: 2048, post: true, bloom: true, particleScale: 1, treeScale: 1, fireLights: 2, maxAgents: 5000, cloudLayers: 2, envMap: true };
    case 'ultra':
      return { level, pixelRatio: Math.min(dpr, 2), shadows: true, shadowMapSize: 4096, post: true, bloom: true, particleScale: 1.4, treeScale: 1, fireLights: 4, maxAgents: 5000, cloudLayers: 2, envMap: true };
  }
}

/** Adaptive quality: steps down when frame rate stays low, cautiously back up when it recovers. */
export class AdaptiveQuality {
  private samples: number[] = [];
  private since = 0;
  private upCredit = 0;
  enabled = true;
  constructor(public level: QualityLevel, private onChange: (l: QualityLevel) => void) {}

  /** Discards samples, e.g. after a deliberate frame-rate cap was lifted. */
  reset(now: number) {
    this.samples = [];
    this.since = now;
  }

  frame(dtMs: number, now: number) {
    if (!this.enabled) return;
    this.samples.push(dtMs);
    if (this.samples.length > 240) this.samples.shift();
    if (now - this.since < 3000 || this.samples.length < 60) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const fps = 1000 / p50;
    const idx = QUALITY_ORDER.indexOf(this.level);
    // a rock-steady ~30 fps is a display cap (e.g. iOS Low Power Mode), not an overloaded GPU
    const capped30 = p50 > 31 && p50 < 35.5 && p90 < 37;
    if (fps < (capped30 ? 26 : 38) && idx > 0) {
      this.set(QUALITY_ORDER[idx - 1], now);
      this.upCredit = 0;
    } else if (fps > 58 && idx < QUALITY_ORDER.indexOf('high')) {
      this.upCredit++;
      if (this.upCredit >= 4) {
        this.set(QUALITY_ORDER[idx + 1], now);
        this.upCredit = 0;
      }
    }
    this.since = now;
  }

  private set(l: QualityLevel, now: number) {
    this.level = l;
    this.samples = [];
    this.since = now;
    this.onChange(l);
  }
}
