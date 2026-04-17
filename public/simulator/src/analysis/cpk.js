// Process-capability statistics. Cp / Cpk / Cpu / Cpl per standard definitions.
// Also computes the empirical defect rate (sample proportion outside limits),
// which is more honest than the Gaussian tail for small trial counts.

export function meanStd(samples) {
  const n = samples.length;
  if (n === 0) return { mean: 0, sigma: 0 };
  let sum = 0;
  for (const v of samples) sum += v;
  const mean = sum / n;
  let v = 0;
  for (const x of samples) v += (x - mean) ** 2;
  const sigma = Math.sqrt(v / Math.max(1, n - 1));
  return { mean, sigma };
}

/**
 * Compute capability metrics for a one-or-two-sided spec.
 * @param {number[]} samples
 * @param {object} spec { usl?, lsl? }
 * @returns {{mean, sigma, cp, cpu, cpl, cpk, empDefect, usl, lsl}}
 */
export function cpk(samples, spec) {
  const { mean, sigma } = meanStd(samples);
  const { usl = null, lsl = null } = spec;
  const nz = Math.max(sigma, 1e-12);
  let cp = null, cpu = null, cpl = null, cpkV = null;
  if (usl !== null && lsl !== null) {
    cp  = (usl - lsl) / (6 * nz);
    cpu = (usl - mean) / (3 * nz);
    cpl = (mean - lsl) / (3 * nz);
    cpkV = Math.min(cpu, cpl);
  } else if (usl !== null) {
    cpu = (usl - mean) / (3 * nz);
    cpkV = cpu;
  } else if (lsl !== null) {
    cpl = (mean - lsl) / (3 * nz);
    cpkV = cpl;
  }
  let defects = 0;
  for (const v of samples) {
    if (usl !== null && v > usl) defects++;
    else if (lsl !== null && v < lsl) defects++;
  }
  const empDefect = samples.length > 0 ? defects / samples.length : 0;
  return { mean, sigma, cp, cpu, cpl, cpk: cpkV, empDefect, usl, lsl };
}
