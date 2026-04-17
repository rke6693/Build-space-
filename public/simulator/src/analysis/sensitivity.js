// Spearman rank correlation between input parameters and output metrics.
// Rank-based correlation is robust to monotonic but non-linear relationships,
// which is exactly what we want for transit-test sensitivity studies.

function rank(arr) {
  // Average-rank for ties.
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Float64Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1; // ranks start at 1
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const rx = rank(x), ry = rank(y);
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += rx[i]; sumY += ry[i]; }
  const mx = sumX / n, my = sumY / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom > 1e-12 ? num / denom : 0;
}

/** Build a flat list of { input, output, rho } rows, sorted by |rho| desc. */
export function sensitivityMatrix(inputsByKey, outputsByKey) {
  const rows = [];
  for (const [oKey, oArr] of Object.entries(outputsByKey)) {
    for (const [iKey, iArr] of Object.entries(inputsByKey)) {
      rows.push({ input: iKey, output: oKey, rho: spearman(iArr, oArr) });
    }
  }
  rows.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
  return rows;
}

/** Latin Hypercube Sampling: n trials over p dimensions, each dim uniform [0,1). */
export function latinHypercube(n, p, rng) {
  const matrix = [];
  for (let d = 0; d < p; d++) {
    const col = new Array(n);
    for (let i = 0; i < n; i++) col[i] = (i + rng.nextFloat()) / n;
    rng.shuffle(col);
    matrix.push(col);
  }
  // Return as n rows of length p.
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(p);
    for (let d = 0; d < p; d++) row[d] = matrix[d][i];
    out.push(row);
  }
  return out;
}
