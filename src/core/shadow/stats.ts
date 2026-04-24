/**
 * Rolling stats for shadow-eval scoring. Per (primary, candidate) pair we
 * keep a ring buffer of recent judge scores, plus cumulative savings. The
 * window size caps both memory and staleness — too small and the signal is
 * noisy, too big and the routing adapts slowly to prompt-mix shifts.
 */
export interface PairStats {
  count: number;
  mean: number;
  min: number;
  max: number;
  recentScores: number[];
  cumulativeCostDeltaUsd: number;
}

export class ShadowStats {
  private readonly buckets = new Map<string, { scores: number[]; costDeltas: number[] }>();

  constructor(private readonly windowSize: number) {}

  record(primaryModel: string, candidateModel: string, score: number, costDeltaUsd: number): void {
    const key = `${primaryModel}::${candidateModel}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { scores: [], costDeltas: [] };
      this.buckets.set(key, bucket);
    }
    bucket.scores.push(score);
    bucket.costDeltas.push(costDeltaUsd);
    if (bucket.scores.length > this.windowSize) {
      bucket.scores.shift();
      bucket.costDeltas.shift();
    }
  }

  get(primaryModel: string, candidateModel: string): PairStats | null {
    const bucket = this.buckets.get(`${primaryModel}::${candidateModel}`);
    if (!bucket || bucket.scores.length === 0) return null;
    const count = bucket.scores.length;
    let sum = 0;
    let min = 1;
    let max = 0;
    for (const s of bucket.scores) {
      sum += s;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const cumCost = bucket.costDeltas.reduce((a, b) => a + b, 0);
    return {
      count,
      mean: sum / count,
      min,
      max,
      recentScores: [...bucket.scores],
      cumulativeCostDeltaUsd: cumCost,
    };
  }

  /** Returns {primary -> candidate} pairs currently qualifying for promotion. */
  qualifyingForPromotion(
    threshold: number,
    minSamples: number,
  ): Array<{ primary: string; candidate: string; stats: PairStats }> {
    const out: Array<{ primary: string; candidate: string; stats: PairStats }> = [];
    for (const [key, bucket] of this.buckets) {
      if (bucket.scores.length < minSamples) continue;
      const mean = bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length;
      if (mean < threshold) continue;
      const [primary, candidate] = key.split('::');
      if (!primary || !candidate) continue;
      out.push({
        primary,
        candidate,
        stats: {
          count: bucket.scores.length,
          mean,
          min: Math.min(...bucket.scores),
          max: Math.max(...bucket.scores),
          recentScores: [...bucket.scores],
          cumulativeCostDeltaUsd: bucket.costDeltas.reduce((a, b) => a + b, 0),
        },
      });
    }
    return out;
  }

  /** For /v1/stats dashboard. */
  snapshot(): Array<{ primary: string; candidate: string; stats: PairStats }> {
    const out: Array<{ primary: string; candidate: string; stats: PairStats }> = [];
    for (const key of this.buckets.keys()) {
      const [primary, candidate] = key.split('::');
      if (!primary || !candidate) continue;
      const s = this.get(primary, candidate);
      if (s) out.push({ primary, candidate, stats: s });
    }
    return out;
  }
}
