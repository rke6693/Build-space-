// Report generation: CSV, JSON, printable HTML. All produced purely from the
// run manifest + metrics — no dependencies on Three.js state.

export function runReportJSON(report) {
  return JSON.stringify(report, null, 2);
}

export function runReportCSV(report) {
  const lines = [];
  lines.push('# Pallet Stability Simulator — single run');
  lines.push(`# verdict,${report.verdict}`);
  if (report.runMeta) {
    for (const [k, v] of Object.entries(report.runMeta)) {
      lines.push(`# ${k},${escape(v)}`);
    }
  }
  lines.push('');
  lines.push('metric,value,usl,direction,pass');
  for (const row of report.perCriterion) {
    lines.push([row.metric, numStr(row.value), numStr(row.usl), row.direction, row.pass].join(','));
  }
  lines.push('');
  lines.push('metric,value');
  for (const [k, v] of Object.entries(report.metrics)) {
    lines.push([k, numStr(v)].join(','));
  }
  return lines.join('\n');
}

export function batchReportCSV(batch) {
  const lines = [];
  lines.push(`# Pallet Stability Simulator — Monte Carlo / DOE batch`);
  lines.push(`# nTrials,${batch.trials.length}`);
  lines.push(`# seedRoot,${batch.seedRoot}`);
  lines.push('');
  const inputKeys = Object.keys(batch.trials[0].inputs);
  const metricKeys = Object.keys(batch.trials[0].metrics);
  lines.push(['trial', 'verdict', ...inputKeys, ...metricKeys].join(','));
  for (const t of batch.trials) {
    const row = [t.trial, t.verdict];
    for (const k of inputKeys) row.push(numStr(t.inputs[k]));
    for (const k of metricKeys) row.push(numStr(t.metrics[k]));
    lines.push(row.join(','));
  }
  if (batch.cpk) {
    lines.push('');
    lines.push('metric,mean,stddev,Cp,Cpk,usl,lsl,empiricalDefectRate');
    for (const row of batch.cpk) {
      lines.push([row.metric, numStr(row.mean), numStr(row.sigma), numStr(row.cp), numStr(row.cpk), numStr(row.usl), numStr(row.lsl), numStr(row.empDefect)].join(','));
    }
  }
  if (batch.sensitivity) {
    lines.push('');
    lines.push('inputParam,outputMetric,spearmanRho');
    for (const row of batch.sensitivity) {
      lines.push([row.input, row.output, numStr(row.rho)].join(','));
    }
  }
  return lines.join('\n');
}

export function printableHTML(report) {
  const style = `
    body { font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", Arial, sans-serif; color: #1a2230; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; letter-spacing: 1.4px; text-transform: uppercase; color: #7a8494; margin: 24px 0 6px; }
    .verdict { display: inline-block; padding: 4px 14px; border-radius: 3px; font-weight: 700; letter-spacing: 0.5px; }
    .pass { background: #e4f4ea; color: #15874a; }
    .fail { background: #fbecec; color: #c8302f; }
    table { border-collapse: collapse; width: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e2e6ec; }
    th { background: #f2f4f7; font-weight: 700; }
    .limits { background: #fff3dd; padding: 10px 14px; border-radius: 4px; border: 1px solid #e9c77c; font-size: 12px; margin-top: 16px; }
    .limits strong { color: #b46600; }
  `;
  const metaRows = Object.entries(report.runMeta || {}).map(([k, v]) => `<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('');
  const critRows = report.perCriterion.map(r => `<tr><td>${escape(r.metric)}</td><td>${numStr(r.value)}</td><td>${numStr(r.usl)}</td><td>${r.direction}</td><td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('');
  const metricRows = Object.entries(report.metrics).map(([k, v]) => `<tr><td>${escape(k)}</td><td>${numStr(v)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>ISTA 3E Simulation Report</title><style>${style}</style></head><body>
    <h1>Pallet Stability Simulator — ISTA 3E Run Report</h1>
    <div>Verdict: <span class="verdict ${report.verdict === 'PASS' ? 'pass' : 'fail'}">${report.verdict}</span></div>
    <h2>Run metadata</h2>
    <table>${metaRows}</table>
    <h2>Pass / fail criteria</h2>
    <table><thead><tr><th>Metric</th><th>Value</th><th>Limit</th><th>Dir</th><th>Result</th></tr></thead><tbody>${critRows}</tbody></table>
    <h2>All metrics</h2>
    <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${metricRows}</tbody></table>
    <div class="limits"><strong>Limitations:</strong> This simulator uses pure rigid-body physics. It does not model box crush (McKee BCT is advisory), creep/relaxation, humidity/temperature effects, fluid sloshing inside products, cyclic fatigue, or adhesive bond failure. Use as a screening tool — confirm with physical ISTA 3E testing before release.</div>
  </body></html>`;
}

export function triggerDownload(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function numStr(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toPrecision(6);
}

function escape(v) {
  return String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
