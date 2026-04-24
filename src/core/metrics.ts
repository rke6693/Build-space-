/**
 * Tiny Prometheus exposition writer. We don't depend on `prom-client` to
 * keep the runtime small and the surface auditable. Counters and histograms
 * cover everything the gateway exposes today; if we ever need summaries or
 * gauges with labels-of-labels, swap in prom-client.
 *
 * Format reference: https://prometheus.io/docs/instrumenting/exposition_formats/
 */

type Labels = Record<string, string>;

interface CounterEntry {
  labels: Labels;
  value: number;
}

interface HistogramEntry {
  labels: Labels;
  buckets: number[]; // counts per bucket boundary
  sum: number;
  count: number;
}

export class Counter {
  private readonly entries = new Map<string, CounterEntry>();

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const k = labelKey(labels);
    let e = this.entries.get(k);
    if (!e) {
      e = { labels, value: 0 };
      this.entries.set(k, e);
    }
    e.value += by;
  }

  expose(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
    ];
    for (const e of this.entries.values()) {
      lines.push(`${this.name}${formatLabels(e.labels)} ${e.value}`);
    }
    return lines.join('\n');
  }
}

export class Histogram {
  private readonly entries = new Map<string, HistogramEntry>();

  constructor(
    readonly name: string,
    readonly help: string,
    readonly bucketsLe: number[], // upper bounds; +Inf is implicit and always present
  ) {}

  observe(value: number, labels: Labels = {}): void {
    const k = labelKey(labels);
    let e = this.entries.get(k);
    if (!e) {
      e = {
        labels,
        buckets: new Array(this.bucketsLe.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.entries.set(k, e);
    }
    for (let i = 0; i < this.bucketsLe.length; i++) {
      if (value <= this.bucketsLe[i]!) e.buckets[i]!++;
    }
    e.sum += value;
    e.count++;
  }

  expose(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const e of this.entries.values()) {
      for (let i = 0; i < this.bucketsLe.length; i++) {
        const labels = { ...e.labels, le: String(this.bucketsLe[i]) };
        lines.push(`${this.name}_bucket${formatLabels(labels)} ${e.buckets[i]}`);
      }
      const infLabels = { ...e.labels, le: '+Inf' };
      lines.push(`${this.name}_bucket${formatLabels(infLabels)} ${e.count}`);
      lines.push(`${this.name}_sum${formatLabels(e.labels)} ${e.sum}`);
      lines.push(`${this.name}_count${formatLabels(e.labels)} ${e.count}`);
    }
    return lines.join('\n');
  }
}

function labelKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('|');
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1));
  if (entries.length === 0) return '';
  return `{${entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',')}}`;
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

/** Singleton registry. */
export const registry = {
  requests: new Counter('keel_requests_total', 'Total requests processed by the gateway'),
  errors: new Counter('keel_errors_total', 'Total errored requests, labelled by error code'),
  cacheHits: new Counter('keel_cache_hits_total', 'Cache hits, labelled by status (exact|semantic)'),
  cacheMisses: new Counter('keel_cache_misses_total', 'Cache misses'),
  shadowAttempts: new Counter('keel_shadow_attempts_total', 'Shadow-eval attempts, labelled by candidate_ok'),
  // Histogram buckets in milliseconds — covers gateway overhead (sub-ms) and
  // upstream-dependent latencies (up to a minute).
  latencyMs: new Histogram(
    'keel_request_latency_ms',
    'End-to-end request latency in milliseconds',
    [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 30_000, 60_000],
  ),
  costUsd: new Counter('keel_cost_usd_total', 'Cumulative spend in USD, labelled by served_model'),
};

export function exposeAll(): string {
  return [
    registry.requests.expose(),
    registry.errors.expose(),
    registry.cacheHits.expose(),
    registry.cacheMisses.expose(),
    registry.shadowAttempts.expose(),
    registry.latencyMs.expose(),
    registry.costUsd.expose(),
    '',
  ].join('\n');
}
