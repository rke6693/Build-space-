import { STEP_SECONDS } from './config';
import { METRIC_KEYS } from './metrics';
import type { Metrics, Scenario, SimEvent } from './types';

export interface SummaryExport {
  generator: string;
  exportedAt: string;
  scenario: Scenario;
  simulatedSeconds: number;
  checksum: string;
  replay: { keyframesVerified: number; mismatches: number };
  disclaimer: string;
  finalMetrics: Metrics | null;
  peaks: Record<string, number>;
  history: Metrics[];
  events: SimEvent[];
}

export const ECONOMIC_DISCLAIMER =
  'Economic figures come from a configurable, illustrative model (replacement cost × damage ratio, depth-damage curves, outage-hours). They are not actuarial or insurance estimates.';

export function buildSummary(
  scenario: Scenario,
  history: Metrics[],
  events: SimEvent[],
  checksum: number,
  verification: { checked: number; mismatches: number },
  exportedAt = new Date().toISOString(),
): SummaryExport {
  const final = history.length ? history[history.length - 1] : null;
  const peaks: Record<string, number> = {};
  for (const k of ['affected', 'evacuating', 'sheltered', 'injured', 'maxFloodDepth', 'floodedAreaKm2', 'activeFires', 'burnedAreaKm2', 'lossTotal', 'peakPGA'] as (keyof Metrics)[]) {
    peaks[k] = history.reduce((m, h) => Math.max(m, Number(h[k]) || 0), 0);
  }
  for (const k of ['gridAvailability', 'roadAccessibility', 'hospitalAccess', 'commAvailability'] as (keyof Metrics)[]) {
    peaks[`min_${k}`] = history.reduce((m, h) => Math.min(m, Number(h[k])), 1);
  }
  return {
    generator: 'PROJECT SINGULARITY',
    exportedAt,
    scenario,
    simulatedSeconds: final ? final.t : 0,
    checksum: checksum.toString(16).padStart(8, '0'),
    replay: { keyframesVerified: verification.checked, mismatches: verification.mismatches },
    disclaimer: ECONOMIC_DISCLAIMER,
    finalMetrics: final,
    peaks,
    history,
    events,
  };
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(6).replace(/\.?0+$/, '')) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function metricsToCSV(history: Metrics[]): string {
  const lines = [METRIC_KEYS.join(',')];
  for (const m of history) lines.push(METRIC_KEYS.map((k) => csvCell(m[k])).join(','));
  return lines.join('\n') + '\n';
}

export function eventsToCSV(events: SimEvent[]): string {
  const cols = ['id', 'tick', 'time_s', 'type', 'category', 'severity', 'title', 'detail', 'x', 'z', 'causes'];
  const lines = [cols.join(',')];
  for (const e of events) {
    lines.push(
      [e.id, e.tick, e.tick * STEP_SECONDS, e.type, e.category, e.severity, e.title, e.detail, Math.round(e.x), Math.round(e.z), e.causes.join(' ')].map(csvCell).join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/** Minimal CSV parser used by tests to validate round-trips (handles quoted fields). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
