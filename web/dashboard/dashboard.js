// Keel dashboard — vanilla, no framework. Polls /v1/stats and /metrics.

const REFRESH_MS = 5_000;
const SAMPLE_HISTORY = 30;

const $ = (id) => document.getElementById(id);
const fmtInt = (n) =>
  n == null
    ? '—'
    : Math.abs(n) >= 1_000_000
      ? (n / 1_000_000).toFixed(2) + 'M'
      : Math.abs(n) >= 1_000
        ? (n / 1_000).toFixed(1) + 'k'
        : n.toLocaleString();
const fmtPct = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');
const fmtUsd = (n) =>
  n == null
    ? '—'
    : n >= 100
      ? '$' + n.toFixed(0)
      : n >= 1
        ? '$' + n.toFixed(2)
        : '$' + n.toFixed(4);
const fmtMs = (n) => (n == null ? '—' : n < 10 ? n.toFixed(2) + 'ms' : Math.round(n) + 'ms');

let apiKey = localStorage.getItem('keel_api_key') || '';
const requestHistory = [];
let lastRequestCount = null;

function setEnv(state, label) {
  const led = $('env-led');
  const lbl = $('env-label');
  led.classList.remove('up', 'down');
  if (state) led.classList.add(state);
  lbl.textContent = label;
}

async function fetchStats() {
  const res = await fetch('/v1/stats', {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401) {
    promptForKey();
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

async function fetchMetrics() {
  const res = await fetch('/metrics');
  if (!res.ok) return '';
  return res.text();
}

// Parse a Prometheus exposition text into { name, labels, value }[].
function parseProm(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(\w+)(\{[^}]*\})?\s+([0-9.eE+\-]+)$/);
    if (!m) continue;
    const labels = {};
    if (m[2]) {
      const inner = m[2].slice(1, -1);
      for (const part of splitLabels(inner)) {
        const eq = part.indexOf('=');
        if (eq > 0) {
          const k = part.slice(0, eq).trim();
          let v = part.slice(eq + 1).trim();
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          labels[k] = v;
        }
      }
    }
    out.push({ name: m[1], labels, value: parseFloat(m[3]) });
  }
  return out;
}

function splitLabels(s) {
  // crude but adequate: doesn't handle escaped quotes since we don't emit them
  return s.split(',').map((p) => p.trim()).filter(Boolean);
}

function p95FromHistogram(samples) {
  // Pull keel_request_latency_ms_bucket entries, find the bucket where the
  // cumulative count crosses 95% of the total count. Histograms are
  // cumulative; +Inf bucket count == total count.
  const buckets = samples.filter(
    (s) => s.name === 'keel_request_latency_ms_bucket',
  );
  if (buckets.length === 0) return null;
  // Aggregate across labels (we only label by path for now).
  const merged = new Map();
  for (const s of buckets) {
    const le = s.labels.le;
    if (!le) continue;
    const cur = merged.get(le) ?? 0;
    merged.set(le, cur + s.value);
  }
  const total = merged.get('+Inf');
  if (!total || total === 0) return null;
  const target = 0.95 * total;
  const ordered = [...merged.entries()]
    .filter(([k]) => k !== '+Inf')
    .map(([k, v]) => [parseFloat(k), v])
    .sort((a, b) => a[0] - b[0]);
  for (const [le, count] of ordered) {
    if (count >= target) return le;
  }
  return ordered.length ? ordered[ordered.length - 1][0] : null;
}

function modelMixFromMetrics(samples) {
  const out = new Map();
  for (const s of samples) {
    if (s.name !== 'keel_cost_usd_total') continue;
    const m = s.labels.served_model || 'unknown';
    out.set(m, (out.get(m) ?? 0) + s.value);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function totalRequestsFromMetrics(samples) {
  let total = 0;
  for (const s of samples) {
    if (s.name === 'keel_requests_total') total += s.value;
  }
  return total;
}

function totalErrorsFromMetrics(samples) {
  let total = 0;
  for (const s of samples) {
    if (s.name === 'keel_errors_total') total += s.value;
  }
  return total;
}

function pushSample(value) {
  requestHistory.push(value);
  while (requestHistory.length > SAMPLE_HISTORY) requestHistory.shift();
}

function renderSpark() {
  const svg = $('throughput-chart');
  if (!svg) return;
  const W = 800,
    H = 180,
    PAD = 8;
  if (requestHistory.length < 2) {
    svg.innerHTML = '<text x="400" y="90" text-anchor="middle" fill="#64748B" font-size="13">collecting samples…</text>';
    return;
  }
  const max = Math.max(...requestHistory, 1);
  const min = Math.min(...requestHistory, 0);
  const range = max - min || 1;
  const dx = (W - PAD * 2) / (SAMPLE_HISTORY - 1);
  const points = requestHistory.map((v, i) => {
    const x = PAD + i * dx;
    const y = PAD + (H - PAD * 2) * (1 - (v - min) / range);
    return [x, y];
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lastX = points[points.length - 1][0];
  const firstX = points[0][0];
  const areaPath = `${linePath} L${lastX.toFixed(1)},${H - PAD} L${firstX.toFixed(1)},${H - PAD} Z`;

  svg.innerHTML = `
    <defs>
      <linearGradient id="sparkGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="#22D3EE" />
        <stop offset="1" stop-color="#8B5CF6" />
      </linearGradient>
      <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.3" />
        <stop offset="1" stop-color="#7C5CFF" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path class="spark-area" d="${areaPath}" />
    <path class="spark-line" d="${linePath}" />
  `;
}

function renderShadow(shadow) {
  const wrap = $('shadow-pairs');
  const pill = $('shadow-pill');
  if (!shadow || shadow.length === 0) {
    pill.textContent = 'Inactive';
    pill.classList.remove('active');
    wrap.innerHTML =
      '<div class="empty">No pairs configured. Set <code>SHADOW_CANDIDATES</code> in your env to begin.</div>';
    return;
  }
  pill.textContent = 'Active';
  pill.classList.add('active');
  wrap.innerHTML = shadow
    .map((p) => {
      const m = p.stats.mean;
      const score = m == null ? '—' : m.toFixed(3);
      const cls = m == null ? '' : m >= 0.9 ? 'good' : m >= 0.75 ? 'warn' : 'bad';
      const saved = (p.stats.cumulativeCostDeltaUsd ?? 0).toFixed(4);
      return `
      <div class="pair-row">
        <div class="pair-models">
          <span class="label">primary → candidate</span>
          <span><strong>${escapeHtml(p.primary)}</strong><span class="arrow">→</span>${escapeHtml(p.candidate)}</span>
        </div>
        <div class="pair-score ${cls}">${score}</div>
        <div class="pair-meta">${p.stats.count} samples · saved $${saved}</div>
      </div>`;
    })
    .join('');
}

function renderModelMix(mix) {
  const wrap = $('model-bars');
  if (mix.length === 0) {
    wrap.innerHTML = '<div class="empty">No traffic yet.</div>';
    return;
  }
  const max = mix[0][1] || 1;
  wrap.innerHTML = mix
    .slice(0, 8)
    .map(([model, cost]) => {
      const w = Math.max(2, (cost / max) * 100);
      return `
      <div class="bar-row">
        <div>${escapeHtml(model)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div></div>
        <div class="bar-amount">$${cost.toFixed(4)}</div>
      </div>`;
    })
    .join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function tick() {
  try {
    const [stats, metricsText] = await Promise.all([fetchStats(), fetchMetrics()]);
    const samples = parseProm(metricsText);

    setEnv('up', 'connected');
    $('demo-badge').hidden = false; // we toggle it true once we know — see below
    $('last-updated').textContent = new Date().toLocaleTimeString();

    const requests = stats.requests_24h ?? 0;
    const cacheRate = stats.cache_hit_rate ?? 0;
    const cost = stats.total_cost_usd ?? 0;
    const saved = stats.saved_by_cache_usd ?? 0;
    const p95 = p95FromHistogram(samples);
    const totalRequests = totalRequestsFromMetrics(samples);
    const totalErrors = totalErrorsFromMetrics(samples);

    $('m-requests').textContent = fmtInt(requests);
    $('m-requests-sub').textContent = `${fmtInt(totalRequests)} since boot`;
    $('m-cache').textContent = fmtPct(cacheRate);
    $('m-cost').textContent = fmtUsd(cost);
    $('m-savings').textContent = saved > 0 ? `~${fmtUsd(saved)} saved by cache` : ' ';
    $('m-p95').textContent = p95 == null ? '—' : fmtMs(p95);
    $('m-errors').textContent = fmtInt(totalErrors);

    // Sparkline: requests-per-tick (delta of total since last tick).
    if (lastRequestCount != null) {
      const delta = Math.max(0, totalRequests - lastRequestCount);
      pushSample(delta);
      renderSpark();
    }
    lastRequestCount = totalRequests;

    renderShadow(stats.shadow ?? []);
    renderModelMix(modelMixFromMetrics(samples));

    // Detect demo mode via the synthetic-content prefix in stats — for now,
    // hide the badge unless a heuristic suggests demo.
    $('demo-badge').hidden = totalRequests === 0 || cost > 1; // best-effort; user can also set it
  } catch (err) {
    console.warn(err);
    setEnv('down', 'disconnected');
  }
}

function promptForKey() {
  const dlg = $('auth-dialog');
  const input = $('auth-input');
  if (!dlg.open) {
    input.value = apiKey;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
}

async function bootstrap() {
  $('refresh-secs').textContent = String(REFRESH_MS / 1000);
  $('refresh-now').addEventListener('click', tick);

  $('auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    apiKey = $('auth-input').value.trim();
    localStorage.setItem('keel_api_key', apiKey);
    $('auth-dialog').close();
    tick();
  });

  // Probe /v1/info first (unauthed). If demo mode is on, the dashboard hides
  // the auth dialog and shows the demo badge — visitors don't need a key.
  try {
    const res = await fetch('/v1/info');
    if (res.ok) {
      const info = await res.json();
      if (info.demo) {
        $('demo-badge').hidden = false;
        if (!apiKey) {
          // In demo mode the operator typically sets one static key in env.
          // The dashboard tries it automatically so the page is alive on first load.
          apiKey = 'kl_demo';
        }
      }
    }
  } catch { /* ignore */ }

  if (!apiKey) {
    promptForKey();
  } else {
    tick();
  }
  setInterval(tick, REFRESH_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  void bootstrap();
});
