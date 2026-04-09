/**
 * OmniSight Terminal — Interactive Dashboard
 * Bloomberg Terminal-style UI for prediction market infrastructure.
 * Simulates real-time data feeds for demo purposes.
 */

// ── Simulated Market Data ─────────────────────────────────────

const DEMO_MARKETS = [
  { id: "poly-1", title: "US Presidential Election 2028 — Republican Nominee", platform: "polymarket", category: "politics", yes: 0.42, no: 0.58, vol24h: 18420000, liquidity: 5200000, status: "active" },
  { id: "kalshi-1", title: "Fed Rate Cut Before July 2026", platform: "kalshi", category: "economics", yes: 0.67, no: 0.33, vol24h: 12800000, liquidity: 3800000, status: "active" },
  { id: "poly-2", title: "Bitcoin Above $200K by Dec 2026", platform: "polymarket", category: "crypto", yes: 0.28, no: 0.72, vol24h: 9600000, liquidity: 4100000, status: "active" },
  { id: "kalshi-2", title: "US GDP Growth > 3% in 2026 Q2", platform: "kalshi", category: "economics", yes: 0.35, no: 0.65, vol24h: 6200000, liquidity: 2900000, status: "active" },
  { id: "poly-3", title: "AI Model Passes PhD-Level Math Exam", platform: "polymarket", category: "science", yes: 0.73, no: 0.27, vol24h: 8100000, liquidity: 3200000, status: "active" },
  { id: "pinnacle-1", title: "Champions League Winner — Real Madrid", platform: "pinnacle", category: "sports", yes: 0.22, no: 0.78, vol24h: 14500000, liquidity: 8200000, status: "active" },
  { id: "poly-4", title: "SpaceX Starship Reaches Orbit by Q3 2026", platform: "polymarket", category: "science", yes: 0.81, no: 0.19, vol24h: 5400000, liquidity: 2100000, status: "active" },
  { id: "kalshi-3", title: "US Unemployment Rate Above 5% in 2026", platform: "kalshi", category: "economics", yes: 0.18, no: 0.82, vol24h: 4200000, liquidity: 1800000, status: "active" },
  { id: "betfair-1", title: "Next UK Prime Minister — Labour", platform: "betfair", category: "politics", yes: 0.55, no: 0.45, vol24h: 3800000, liquidity: 1500000, status: "active" },
  { id: "poly-5", title: "Ethereum Flippening (ETH > BTC Marketcap)", platform: "polymarket", category: "crypto", yes: 0.08, no: 0.92, vol24h: 7200000, liquidity: 2800000, status: "active" },
  { id: "kalshi-4", title: "Major US Hurricane (Cat 4+) in 2026", platform: "kalshi", category: "science", yes: 0.44, no: 0.56, vol24h: 2100000, liquidity: 900000, status: "active" },
  { id: "poly-6", title: "OpenAI IPO Before 2027", platform: "polymarket", category: "economics", yes: 0.62, no: 0.38, vol24h: 11200000, liquidity: 4800000, status: "active" },
];

const CROSS_PLATFORM_EVENTS = [
  { title: "US Presidential Election 2028 — Republican", poly: 0.42, kalshi: 0.44, pinnacle: 0.40, spread: 40 },
  { title: "Fed Rate Cut Before July 2026", poly: 0.67, kalshi: 0.65, pinnacle: 0.68, spread: 30 },
  { title: "Bitcoin Above $200K by Dec 2026", poly: 0.28, kalshi: 0.30, pinnacle: 0.26, spread: 40 },
  { title: "Champions League — Real Madrid", poly: 0.22, kalshi: null, pinnacle: 0.20, spread: 20 },
  { title: "AI PhD-Level Math by 2027", poly: 0.73, kalshi: 0.70, pinnacle: null, spread: 30 },
  { title: "US GDP Growth > 3% Q2 2026", poly: null, kalshi: 0.35, pinnacle: 0.37, spread: 20 },
  { title: "SpaceX Starship Orbit Q3 2026", poly: 0.81, kalshi: 0.78, pinnacle: null, spread: 30 },
  { title: "OpenAI IPO Before 2027", poly: 0.62, kalshi: 0.59, pinnacle: null, spread: 30 },
];

const WHALE_ALERTS = [
  { side: "buy", amount: 250000, market: "US Presidential Election 2028", wallet: "0x7a3b...f2d1", platform: "polymarket", time: "2m ago" },
  { side: "sell", amount: 180000, market: "Bitcoin Above $200K", wallet: "0x1c4e...8a92", platform: "polymarket", time: "5m ago" },
  { side: "buy", amount: 520000, market: "Fed Rate Cut Before July", wallet: "0x9f2d...c3b7", platform: "kalshi", time: "8m ago" },
  { side: "buy", amount: 95000, market: "AI PhD Math Exam", wallet: "0x3e8a...d4f5", platform: "polymarket", time: "12m ago" },
  { side: "sell", amount: 340000, market: "Ethereum Flippening", wallet: "0x5b1c...e7a3", platform: "polymarket", time: "15m ago" },
  { side: "buy", amount: 150000, market: "SpaceX Starship Orbit", wallet: "0x2d9f...b1c4", platform: "kalshi", time: "18m ago" },
  { side: "sell", amount: 420000, market: "US Presidential Election 2028", wallet: "0x8c3a...f6d2", platform: "polymarket", time: "22m ago" },
  { side: "buy", amount: 75000, market: "OpenAI IPO Before 2027", wallet: "0x4e7b...a9c1", platform: "polymarket", time: "28m ago" },
  { side: "buy", amount: 1200000, market: "Fed Rate Cut Before July", wallet: "0xf1a2...3b4c", platform: "kalshi", time: "35m ago" },
  { side: "sell", amount: 88000, market: "US Unemployment Above 5%", wallet: "0x6d5e...c8f7", platform: "kalshi", time: "42m ago" },
];

const ARB_OPPORTUNITIES = [
  { event: "US Presidential Election 2028 — Republican", buyPlatform: "pinnacle", buyPrice: 0.40, sellPlatform: "kalshi", sellPrice: 0.44, spread: 40, profit: 38, liquidity: 820000, age: "3m" },
  { event: "Bitcoin Above $200K by Dec 2026", buyPlatform: "pinnacle", buyPrice: 0.26, sellPlatform: "kalshi", sellPrice: 0.30, spread: 40, profit: 35, liquidity: 450000, age: "7m" },
  { event: "Fed Rate Cut Before July 2026", buyPlatform: "kalshi", buyPrice: 0.65, sellPlatform: "pinnacle", sellPrice: 0.68, spread: 30, profit: 27, liquidity: 1200000, age: "12m" },
  { event: "SpaceX Starship Orbit Q3 2026", buyPlatform: "kalshi", buyPrice: 0.78, sellPlatform: "polymarket", sellPrice: 0.81, spread: 30, profit: 25, liquidity: 340000, age: "18m" },
  { event: "Champions League — Real Madrid", buyPlatform: "pinnacle", buyPrice: 0.20, sellPlatform: "polymarket", sellPrice: 0.22, spread: 20, profit: 18, liquidity: 650000, age: "25m" },
  { event: "OpenAI IPO Before 2027", buyPlatform: "kalshi", buyPrice: 0.59, sellPlatform: "polymarket", sellPrice: 0.62, spread: 30, profit: 26, liquidity: 480000, age: "30m" },
];

// ── Navigation ────────────────────────────────────────────────

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel-view').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
  });
});

// ── Clock ─────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// ── Formatters ────────────────────────────────────────────────

function formatUSD(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function formatPrice(p) {
  if (p === null || p === undefined) return '—';
  return (p * 100).toFixed(1) + 'c';
}

function platformClass(p) {
  if (p.includes('poly')) return 'poly';
  if (p.includes('kalshi')) return 'kalshi';
  if (p.includes('pinnacle')) return 'pinnacle';
  if (p.includes('betfair')) return 'betfair';
  return '';
}

function platformName(p) {
  const map = { polymarket: 'Poly', kalshi: 'Kalshi', pinnacle: 'Pinnacle', betfair: 'Betfair' };
  return map[p] || p;
}

// ── Render: Hot Markets ───────────────────────────────────────

function renderHotMarkets() {
  const el = document.getElementById('hot-markets');
  const sorted = [...DEMO_MARKETS].sort((a, b) => b.vol24h - a.vol24h).slice(0, 8);
  el.innerHTML = sorted.map(m => `
    <div class="market-item">
      <div class="market-info">
        <div class="market-title">${m.title}</div>
        <div class="market-meta">
          <span class="platform-tag ${platformClass(m.platform)}">${platformName(m.platform)}</span>
          ${m.category}
        </div>
      </div>
      <div class="market-price ${m.yes > 0.5 ? 'up' : 'down'}">${formatPrice(m.yes)}</div>
      <div class="market-vol">${formatUSD(m.vol24h)}</div>
    </div>
  `).join('');
}

// ── Render: Cross-Platform Odds ───────────────────────────────

function renderOddsTable() {
  const tbody = document.getElementById('odds-tbody');
  tbody.innerHTML = CROSS_PLATFORM_EVENTS.map(e => `
    <tr>
      <td>${e.title}</td>
      <td>${formatPrice(e.poly)}</td>
      <td>${formatPrice(e.kalshi)}</td>
      <td>${formatPrice(e.pinnacle)}</td>
      <td class="${e.spread >= 40 ? 'spread-arb' : e.spread >= 25 ? 'spread-high' : ''}">${e.spread} bps</td>
    </tr>
  `).join('');
}

// ── Render: Whale Alerts ──────────────────────────────────────

function renderWhaleAlerts(containerId, alerts, limit = 8) {
  const el = document.getElementById(containerId);
  el.innerHTML = alerts.slice(0, limit).map(a => `
    <div class="whale-alert-item">
      <span class="whale-side ${a.side}">${a.side.toUpperCase()}</span>
      <span class="whale-amount">${formatUSD(a.amount)}</span>
      <span style="flex:1;color:var(--text-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.market}</span>
      <span class="whale-wallet">${a.wallet}</span>
      <span class="whale-time">${a.time}</span>
    </div>
  `).join('');
}

// ── Render: Markets Table ─────────────────────────────────────

function renderMarketsTable() {
  const tbody = document.getElementById('markets-tbody');
  tbody.innerHTML = DEMO_MARKETS.map(m => {
    const spread = Math.abs(m.yes - (1 - m.no)) * 10000;
    return `
      <tr>
        <td>${m.title}</td>
        <td><span class="platform-tag ${platformClass(m.platform)}">${platformName(m.platform)}</span></td>
        <td class="${m.yes > 0.5 ? 'up' : ''}" style="color:${m.yes > 0.5 ? 'var(--green)' : 'var(--text-primary)'}">${formatPrice(m.yes)}</td>
        <td>${formatPrice(m.no)}</td>
        <td>${spread.toFixed(0)} bps</td>
        <td>${formatUSD(m.vol24h)}</td>
        <td>${formatUSD(m.liquidity)}</td>
        <td><span class="status-tag ${m.status}">${m.status}</span></td>
      </tr>
    `;
  }).join('');
}

// ── Render: Arbitrage Table ───────────────────────────────────

function renderArbTable() {
  const tbody = document.getElementById('arb-tbody');
  tbody.innerHTML = ARB_OPPORTUNITIES.map(a => `
    <tr>
      <td>${a.event}</td>
      <td><span class="platform-tag ${platformClass(a.buyPlatform)}">${platformName(a.buyPlatform)}</span></td>
      <td>${formatPrice(a.buyPrice)}</td>
      <td><span class="platform-tag ${platformClass(a.sellPlatform)}">${platformName(a.sellPlatform)}</span></td>
      <td>${formatPrice(a.sellPrice)}</td>
      <td class="spread-arb">${a.spread}</td>
      <td style="color:var(--green);font-weight:700">+${a.profit} bps</td>
      <td>${formatUSD(a.liquidity)}</td>
      <td style="color:var(--text-muted)">${a.age}</td>
    </tr>
  `).join('');
}

// ── Render: Whale Panel ───────────────────────────────────────

function renderWhalePanel() {
  renderWhaleAlerts('whale-feed', WHALE_ALERTS, 10);

  const markets = [
    { name: "US Presidential Election 2028", flow: 1200000 },
    { name: "Fed Rate Cut Before July 2026", flow: 850000 },
    { name: "Bitcoin Above $200K by Dec 2026", flow: -420000 },
    { name: "AI PhD-Level Math Exam", flow: 310000 },
    { name: "Ethereum Flippening", flow: -680000 },
    { name: "SpaceX Starship Orbit", flow: 220000 },
    { name: "OpenAI IPO Before 2027", flow: 180000 },
    { name: "US Unemployment Above 5%", flow: -150000 },
  ];

  document.getElementById('whale-markets').innerHTML = markets.map(m => `
    <div class="whale-market-item">
      <span class="whale-market-name">${m.name}</span>
      <span class="whale-market-flow ${m.flow >= 0 ? 'positive' : 'negative'}">
        ${m.flow >= 0 ? '+' : ''}${formatUSD(Math.abs(m.flow))}
      </span>
    </div>
  `).join('');
}

// ── Render: Ticker ────────────────────────────────────────────

function renderTicker() {
  const items = DEMO_MARKETS.map(m => {
    const change = (Math.random() - 0.45) * 6;
    const isUp = change >= 0;
    return `
      <span class="ticker-item">
        <span class="ticker-name">${m.title.substring(0, 30)}${m.title.length > 30 ? '...' : ''}</span>
        <span class="ticker-price ${isUp ? 'up' : 'down'}">${formatPrice(m.yes)}</span>
        <span class="ticker-change" style="color:${isUp ? 'var(--green)' : 'var(--red)'}">${isUp ? '+' : ''}${change.toFixed(1)}%</span>
      </span>
    `;
  }).join('');
  document.getElementById('ticker-content').innerHTML = items + items; // Duplicate for seamless scroll
}

// ── Charts (Canvas-based, no dependencies) ────────────────────

function drawVolumeChart() {
  const canvas = document.getElementById('volume-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.parentElement.clientWidth - 28;
  const h = 200;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  // Data: 7 days x 3 platforms
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const polyVol = [42, 58, 51, 67, 73, 48, 62];
  const kalshiVol = [28, 35, 31, 42, 38, 22, 34];
  const sportsVol = [18, 22, 19, 28, 32, 45, 38];

  const max = Math.max(...polyVol.map((p, i) => p + kalshiVol[i] + sportsVol[i])) * 1.1;
  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const cw = w - margin.left - margin.right;
  const ch = h - margin.top - margin.bottom;
  const barW = cw / days.length * 0.7;
  const gap = cw / days.length;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(w - margin.right, y);
    ctx.stroke();

    ctx.fillStyle = '#5a6478';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`$${((max * (4 - i) / 4)).toFixed(0)}M`, margin.left - 6, y + 4);
  }

  // Bars
  days.forEach((day, i) => {
    const x = margin.left + i * gap + (gap - barW) / 2;
    let y = margin.top + ch;

    // Sports (bottom)
    const sh = (sportsVol[i] / max) * ch;
    ctx.fillStyle = 'rgba(249,115,22,0.7)';
    ctx.fillRect(x, y - sh, barW, sh);
    y -= sh;

    // Kalshi (middle)
    const kh = (kalshiVol[i] / max) * ch;
    ctx.fillStyle = 'rgba(6,182,212,0.7)';
    ctx.fillRect(x, y - kh, barW, kh);
    y -= kh;

    // Polymarket (top)
    const ph = (polyVol[i] / max) * ch;
    ctx.fillStyle = 'rgba(139,92,246,0.7)';
    ctx.fillRect(x, y - ph, barW, ph);

    // Day label
    ctx.fillStyle = '#5a6478';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(day, x + barW / 2, h - 8);
  });

  // Legend
  const legends = [
    { label: 'Polymarket', color: 'rgba(139,92,246,0.7)' },
    { label: 'Kalshi', color: 'rgba(6,182,212,0.7)' },
    { label: 'Sportsbooks', color: 'rgba(249,115,22,0.7)' },
  ];
  let lx = margin.left;
  legends.forEach(l => {
    ctx.fillStyle = l.color;
    ctx.fillRect(lx, 2, 8, 8);
    ctx.fillStyle = '#8892a4';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, lx + 12, 10);
    lx += ctx.measureText(l.label).width + 24;
  });
}

function drawSpreadChart() {
  const canvas = document.getElementById('spread-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.parentElement.clientWidth - 28;
  const h = 200;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  // Spread distribution (histogram)
  const bins = [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200];
  const counts = [12, 28, 45, 62, 58, 42, 35, 24, 18, 12, 8, 4, 2];

  const max = Math.max(...counts) * 1.1;
  const margin = { top: 10, right: 10, bottom: 30, left: 40 };
  const cw = w - margin.left - margin.right;
  const ch = h - margin.top - margin.bottom;
  const barW = cw / counts.length * 0.85;
  const gap = cw / counts.length;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(w - margin.right, y);
    ctx.stroke();
  }

  // Bars with gradient
  counts.forEach((count, i) => {
    const x = margin.left + i * gap + (gap - barW) / 2;
    const bh = (count / max) * ch;
    const y = margin.top + ch - bh;

    // Color: green for low spread, yellow for medium, red for high
    const ratio = i / counts.length;
    const r = Math.round(34 + ratio * 205);
    const g = Math.round(197 - ratio * 150);
    const b = Math.round(94 - ratio * 26);
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
    ctx.fillRect(x, y, barW, bh);

    // Label
    ctx.fillStyle = '#5a6478';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(bins[i] + '-' + bins[i + 1], x + barW / 2, h - 8);
  });

  // Y-axis labels
  ctx.fillStyle = '#5a6478';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (ch / 4) * i;
    ctx.fillText(Math.round(max * (4 - i) / 4), margin.left - 6, y + 4);
  }

  // X label
  ctx.fillStyle = '#5a6478';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Spread (bps)', w / 2, h - 0);
}

function drawDepthChart() {
  const canvas = document.getElementById('depth-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.parentElement.clientWidth - 28;
  const h = 220;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const cw = w - margin.left - margin.right;
  const ch = h - margin.top - margin.bottom;
  const midX = margin.left + cw / 2;

  // Bid levels (left side, cumulative)
  const bids = [
    { price: 0.64, cumSize: 5200 },
    { price: 0.63, cumSize: 12400 },
    { price: 0.62, cumSize: 28600 },
    { price: 0.61, cumSize: 42100 },
    { price: 0.60, cumSize: 58200 },
    { price: 0.59, cumSize: 72400 },
    { price: 0.58, cumSize: 84300 },
    { price: 0.57, cumSize: 95000 },
  ];

  const asks = [
    { price: 0.66, cumSize: 4800 },
    { price: 0.67, cumSize: 11200 },
    { price: 0.68, cumSize: 24800 },
    { price: 0.69, cumSize: 38400 },
    { price: 0.70, cumSize: 52100 },
    { price: 0.71, cumSize: 64800 },
    { price: 0.72, cumSize: 78200 },
    { price: 0.73, cumSize: 89600 },
  ];

  const maxSize = Math.max(bids[bids.length - 1].cumSize, asks[asks.length - 1].cumSize);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(midX, margin.top);
  ctx.lineTo(midX, margin.top + ch);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw bid area (green, left)
  ctx.beginPath();
  ctx.moveTo(midX, margin.top + ch);
  bids.forEach((b, i) => {
    const x = midX - (b.cumSize / maxSize) * (cw / 2);
    const y = margin.top + (i / (bids.length - 1)) * ch;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(midX, margin.top);
  ctx.closePath();
  ctx.fillStyle = 'rgba(34,197,94,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(34,197,94,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  bids.forEach((b, i) => {
    const x = midX - (b.cumSize / maxSize) * (cw / 2);
    const y = margin.top + (i / (bids.length - 1)) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Draw ask area (red, right)
  ctx.beginPath();
  ctx.moveTo(midX, margin.top + ch);
  asks.forEach((a, i) => {
    const x = midX + (a.cumSize / maxSize) * (cw / 2);
    const y = margin.top + (i / (asks.length - 1)) * ch;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(midX, margin.top);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239,68,68,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(239,68,68,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  asks.forEach((a, i) => {
    const x = midX + (a.cumSize / maxSize) * (cw / 2);
    const y = margin.top + (i / (asks.length - 1)) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Labels
  ctx.fillStyle = 'var(--green, #22c55e)';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('BIDS', midX - 10, margin.top + 14);

  ctx.fillStyle = 'var(--red, #ef4444)';
  ctx.textAlign = 'left';
  ctx.fillText('ASKS', midX + 10, margin.top + 14);

  // Mid price
  ctx.fillStyle = '#e8ecf1';
  ctx.font = 'bold 12px SF Mono, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('65.0c', midX, h - 6);
}

function drawVolumeProfileChart() {
  const canvas = document.getElementById('volume-profile-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.parentElement.clientWidth - 28;
  const h = 220;
  canvas.width = w * 2;
  canvas.height = h * 2;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(2, 2);

  const margin = { top: 10, right: 10, bottom: 30, left: 50 };
  const cw = w - margin.left - margin.right;
  const ch = h - margin.top - margin.bottom;

  // 24h volume by hour
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const volumes = [12, 8, 5, 3, 4, 7, 15, 28, 42, 55, 48, 52, 58, 45, 38, 42, 55, 62, 58, 45, 35, 28, 22, 16];
  const max = Math.max(...volumes) * 1.1;

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i <= 4; i++) {
    const y = margin.top + (ch / 4) * i;
    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(w - margin.right, y);
    ctx.stroke();

    ctx.fillStyle = '#5a6478';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`$${((max * (4 - i) / 4)).toFixed(0)}K`, margin.left - 6, y + 4);
  }

  // Area chart
  const gradient = ctx.createLinearGradient(0, margin.top, 0, margin.top + ch);
  gradient.addColorStop(0, 'rgba(59,130,246,0.3)');
  gradient.addColorStop(1, 'rgba(59,130,246,0.02)');

  ctx.beginPath();
  ctx.moveTo(margin.left, margin.top + ch);
  volumes.forEach((v, i) => {
    const x = margin.left + (i / (volumes.length - 1)) * cw;
    const y = margin.top + ch - (v / max) * ch;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(margin.left + cw, margin.top + ch);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  volumes.forEach((v, i) => {
    const x = margin.left + (i / (volumes.length - 1)) * cw;
    const y = margin.top + ch - (v / max) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(59,130,246,0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hour labels
  [0, 6, 12, 18, 23].forEach(i => {
    const x = margin.left + (i / (volumes.length - 1)) * cw;
    ctx.fillStyle = '#5a6478';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${i}:00`, x, h - 8);
  });
}

// ── Real-time Simulation ──────────────────────────────────────

function simulatePriceUpdates() {
  DEMO_MARKETS.forEach(m => {
    const delta = (Math.random() - 0.48) * 0.008;
    m.yes = Math.max(0.01, Math.min(0.99, m.yes + delta));
    m.no = 1 - m.yes;
    m.vol24h += Math.random() * 50000;
  });

  CROSS_PLATFORM_EVENTS.forEach(e => {
    if (e.poly !== null) e.poly = Math.max(0.01, Math.min(0.99, e.poly + (Math.random() - 0.48) * 0.005));
    if (e.kalshi !== null) e.kalshi = Math.max(0.01, Math.min(0.99, e.kalshi + (Math.random() - 0.48) * 0.005));
    if (e.pinnacle !== null) e.pinnacle = Math.max(0.01, Math.min(0.99, e.pinnacle + (Math.random() - 0.48) * 0.005));

    const prices = [e.poly, e.kalshi, e.pinnacle].filter(p => p !== null);
    e.spread = Math.round((Math.max(...prices) - Math.min(...prices)) * 10000);
  });

  // Update displayed values
  document.getElementById('stat-volume').textContent = formatUSD(
    DEMO_MARKETS.reduce((sum, m) => sum + m.vol24h, 0)
  );
}

// ── Initialize ────────────────────────────────────────────────

function init() {
  renderHotMarkets();
  renderOddsTable();
  renderWhaleAlerts('whale-alerts-mini', WHALE_ALERTS, 5);
  renderMarketsTable();
  renderArbTable();
  renderWhalePanel();
  renderTicker();

  // Draw charts after DOM is ready
  requestAnimationFrame(() => {
    drawVolumeChart();
    drawSpreadChart();
    drawDepthChart();
    drawVolumeProfileChart();
  });

  // Live updates
  setInterval(() => {
    simulatePriceUpdates();
    renderHotMarkets();
    renderOddsTable();
  }, 2000);

  // Redraw charts on resize
  window.addEventListener('resize', () => {
    drawVolumeChart();
    drawSpreadChart();
    drawDepthChart();
    drawVolumeProfileChart();
  });
}

init();
