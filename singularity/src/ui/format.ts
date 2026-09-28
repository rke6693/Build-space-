import { STEP_SECONDS } from '../sim/config';

export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-US');
export const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const fmtNum = (v: number, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

export function fmtMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const fmtTick = (tick: number) => `T+${fmtClock(tick * STEP_SECONDS)}`;

export function fmtTimeOfDay(hours: number): string {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function compassName(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** Event category → identity colour (validated dark categorical order) + label. */
export const CATEGORY: Record<string, { color: string; label: string }> = {
  seismic: { color: '#9085e9', label: 'Seismic' },
  flood: { color: '#3987e5', label: 'Flood' },
  water: { color: '#3987e5', label: 'Water' },
  fire: { color: '#d95926', label: 'Fire' },
  weather: { color: '#199e70', label: 'Weather' },
  power: { color: '#c98500', label: 'Power' },
  comms: { color: '#c98500', label: 'Telecom' },
  health: { color: '#d55181', label: 'Health' },
  population: { color: '#d55181', label: 'Population' },
  transport: { color: '#8b95a3', label: 'Transport' },
  user: { color: '#8b95a3', label: 'Operator' },
};

export const SEVERITY = ['Info', 'Minor', 'Major', 'Critical'];

/** Status palette (reserved for state; always shown with a text label). */
export const STATUS = { ok: '#0ca30c', warn: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
export const statusName = (s: number) => (s >= 2 ? 'Operational' : s === 1 ? 'Degraded' : 'Out of service');
export const statusColor = (s: number) => (s >= 2 ? STATUS.ok : s === 1 ? STATUS.warn : STATUS.critical);

/** Ordinal damage ramp (neutral → one-hue orange), shared by charts and the 3D tint. */
export const DAMAGE_COLORS = ['#5b6470', '#f5c9a8', '#ec9a62', '#d95926', '#8f2d0f'];
export const DAMAGE_NAMES = ['None', 'Slight', 'Moderate', 'Extensive', 'Collapse'];

/** World position (x east, z south, metres from the city centre) as "0.90 km E · 5.60 km S". */
export function fmtLocation(x: number, z: number): string {
  const ew = `${(Math.abs(x) / 1000).toFixed(2)} km ${x < 0 ? 'W' : 'E'}`;
  const ns = `${(Math.abs(z) / 1000).toFixed(2)} km ${z > 0 ? 'S' : 'N'}`;
  return `${ew} · ${ns}`;
}
