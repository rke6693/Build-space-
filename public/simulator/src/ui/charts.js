// Chart helpers using uPlot. Kept as thin wrappers so main.js stays readable.

import uPlot from 'uplot';

const palette = {
  bar: '#0a6cf0',
  barNeg: '#c8302f',
  grid: '#e2e6ec',
  axis: '#6b7481',
};

export function renderTornado(mountEl, sensitivityRows, { topN = 10, outputMetric = null } = {}) {
  // Filter to a single output metric for clarity; default to the one with highest |rho|.
  const rows = [...sensitivityRows].filter(r => outputMetric ? r.output === outputMetric : true);
  const metric = outputMetric || rows[0]?.output;
  const filtered = rows.filter(r => r.output === metric).slice(0, topN);
  if (filtered.length === 0) { mountEl.innerHTML = '<div class="chart-empty">No sensitivity data.</div>'; return; }

  mountEl.innerHTML = '';
  const caption = document.createElement('div');
  caption.style.cssText = 'font: 11px ui-monospace, Menlo, monospace; color: #6b7481; margin-bottom: 4px;';
  caption.textContent = `Sensitivity: ${metric}  (|ρ| descending)`;
  mountEl.appendChild(caption);

  const bar = document.createElement('div');
  bar.style.cssText = 'display: flex; flex-direction: column; gap: 3px;';
  const maxAbs = Math.max(0.02, ...filtered.map(r => Math.abs(r.rho)));
  for (const r of filtered) {
    const row = document.createElement('div');
    row.style.cssText = 'display: grid; grid-template-columns: 110px 1fr 46px; align-items: center; gap: 6px; font: 11px ui-monospace, Menlo, monospace;';
    const lbl = document.createElement('div'); lbl.textContent = r.input; lbl.style.color = '#4b5868';
    const barCell = document.createElement('div');
    barCell.style.cssText = 'background: #eef1f5; height: 14px; position: relative; border-radius: 2px;';
    const fill = document.createElement('div');
    const w = Math.abs(r.rho) / maxAbs * 100;
    fill.style.cssText = `position: absolute; top:0; bottom:0; width:${w}%; background:${r.rho >= 0 ? palette.bar : palette.barNeg}; border-radius: 2px;`;
    barCell.appendChild(fill);
    const val = document.createElement('div'); val.textContent = r.rho.toFixed(2); val.style.color = '#1a2230'; val.style.textAlign = 'right';
    row.appendChild(lbl); row.appendChild(barCell); row.appendChild(val);
    bar.appendChild(row);
  }
  mountEl.appendChild(bar);
}

export function renderHistogram(mountEl, samples, { bins = 24, label = '' } = {}) {
  mountEl.innerHTML = '';
  if (samples.length === 0) return;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const w = (max - min) || 1;
  const edges = new Array(bins + 1).fill(0).map((_, i) => min + (i / bins) * w);
  const counts = new Array(bins).fill(0);
  for (const v of samples) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / w * bins)));
    counts[idx]++;
  }
  const centers = edges.slice(0, bins).map((e, i) => e + w / (2 * bins));

  const opts = {
    width: mountEl.clientWidth || 320,
    height: mountEl.clientHeight || 160,
    scales: { x: { time: false } },
    axes: [
      { stroke: palette.axis, grid: { stroke: palette.grid } },
      { stroke: palette.axis, grid: { stroke: palette.grid } },
    ],
    series: [
      { label: label || 'metric' },
      { label: 'count', stroke: palette.bar, fill: 'rgba(10, 108, 240, 0.35)', paths: uPlot.paths.bars({ size: [0.9] }) },
    ],
  };
  new uPlot(opts, [centers, counts], mountEl);
}

export function renderCpkTable(mountEl, cpkRows) {
  mountEl.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'cpk-row';
  header.innerHTML = `<div>Metric</div><div>Mean</div><div>σ</div><div>Cpk</div>`;
  mountEl.appendChild(header);
  for (const r of cpkRows) {
    const row = document.createElement('div');
    row.className = 'cpk-row';
    const cpkClass = r.cpk === null ? '' : (r.cpk >= 1.33 ? 'good' : 'bad');
    const cpkStr = r.cpk === null ? '—' : r.cpk.toFixed(2);
    row.innerHTML = `
      <div>${escape(r.metric)}</div>
      <div>${fmt(r.mean)}</div>
      <div>${fmt(r.sigma)}</div>
      <div class="cpk-cell-cpk ${cpkClass}">${cpkStr}</div>
    `;
    mountEl.appendChild(row);
  }
}

function fmt(v) { if (v === null || v === undefined) return '—'; return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3); }
function escape(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
