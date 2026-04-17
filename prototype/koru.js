/* =========================================================================
 * Koru — Prototype runtime
 *
 * Mirrors the Swift design system for the shipping watchOS 11 app.
 * No build step, no dependencies. Pure ES modules via a single file.
 *
 * Responsibilities:
 *   1. Render the main / trend / insights screens inside each of the
 *      three device frames (Ultra 2, S9 45mm, S9 41mm).
 *   2. Rotate through mocked wellness states so the prototype "breathes".
 *   3. Simulate crown scrolling via mouse wheel & control bar.
 *   4. Toggle Night Mode.
 *   5. Drive the check-in sheet.
 *
 * Every visual token is read from CSS custom properties so Night Mode
 * and size-class tweaks propagate automatically.
 * ========================================================================= */

(() => {
  'use strict';

  // -----------------------------------------------------------------------
  // Mocked score states — same shape as the Swift WellnessScore struct.
  // -----------------------------------------------------------------------
  const STATES = [
    {
      value: 82,
      status: 'Strong',
      trend: +4,
      band: 'high',
      components: [
        { label: 'HRV',           value: 68, delta: '+6 ms vs 14-day' },
        { label: 'Sleep',         value: 91, delta: '7h 48m · 22% deep' },
        { label: 'Resting HR',    value: 78, delta: '53 bpm · −2' },
      ],
      tip: 'Big HRV rebound overnight. Green-light for an <b>intensity day</b>.',
      trendLine: [62, 68, 71, 65, 74, 78, 82],
    },
    {
      value: 64,
      status: 'Steady',
      trend: -3,
      band: 'mid',
      components: [
        { label: 'HRV',           value: 58, delta: '−3 ms vs 14-day' },
        { label: 'Sleep',         value: 72, delta: '6h 52m · 18% deep' },
        { label: 'Resting HR',    value: 62, delta: '56 bpm · +1' },
      ],
      tip: 'Good enough to train, but dial back intensity. Keep it <b>zone 2</b>.',
      trendLine: [70, 72, 68, 71, 67, 65, 64],
    },
    {
      value: 43,
      status: 'Recover',
      trend: -9,
      band: 'low',
      components: [
        { label: 'HRV',           value: 34, delta: '−14 ms vs 14-day' },
        { label: 'Resting HR',    value: 38, delta: '61 bpm · +6' },
        { label: 'Wrist temp',    value: 42, delta: '+0.4 °F deviation' },
      ],
      tip: 'Your body is <b>working on something</b>. Hydrate, sunlight, easy walk only.',
      trendLine: [68, 64, 58, 60, 56, 50, 43],
    },
    {
      value: 91,
      status: 'Peak',
      trend: +7,
      band: 'high',
      components: [
        { label: 'HRV',           value: 94, delta: '+12 ms vs 14-day' },
        { label: 'Sleep',         value: 96, delta: '8h 10m · 24% deep' },
        { label: 'VO₂ max',       value: 88, delta: '48.2 · +0.4' },
      ],
      tip: 'All systems green. Consider a <b>benchmark workout</b> today.',
      trendLine: [72, 78, 81, 84, 86, 89, 91],
    },
  ];

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const PAGES = ['score', 'trend', 'insights', 'calendar'];

  // -----------------------------------------------------------------------
  // Runtime state
  // -----------------------------------------------------------------------
  const runtime = {
    stateIndex: 0,
    pageIndex: 0,
    night: false,
  };

  // -----------------------------------------------------------------------
  // Spiral generator — Archimedean, mirrors the Swift Path in SpiralLogo.swift.
  // Used for the brand glyph in the header and the tiny logo in each status bar.
  // -----------------------------------------------------------------------
  function buildSpiralPath({ cx = 50, cy = 50, maxR = 36, turns = 1.5, segments = 72 }) {
    const totalTheta = turns * 2 * Math.PI;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      // Ease-in so the spiral feels tight at the core and opens gracefully.
      const tEase = Math.pow(t, 1.25);
      const theta = tEase * totalTheta;
      const r = tEase * maxR;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return 'M' + pts.join(' L');
  }

  // Attach the brand spiral path once on load.
  document.querySelectorAll('.brand-spiral').forEach((path) => {
    path.setAttribute('d', buildSpiralPath({ cx: 50, cy: 50, maxR: 34, turns: 1.6 }));
  });

  // -----------------------------------------------------------------------
  // Device catalog — matches KoruDeviceClass in the Swift layer.
  // -----------------------------------------------------------------------
  const DEVICES = {
    'ultra2': {
      ringSize: 304, ringRadius: 133, ringStroke: 14,
      logoSize:  14,
    },
    's9-45':  {
      ringSize: 280, ringRadius: 122, ringStroke: 13,
      logoSize:  13,
    },
    's9-41':  {
      ringSize: 244, ringRadius: 106, ringStroke: 11,
      logoSize:  12,
    },
  };

  // -----------------------------------------------------------------------
  // Renderers — one per page type per device.
  // They mutate the DOM once on construction, then .update() on state change.
  // -----------------------------------------------------------------------

  function renderScreenShell(root, sizeKey) {
    const d = DEVICES[sizeKey];
    root.innerHTML = `
      <div class="koru-main page-active">
        <div class="status-bar">
          <span class="bar-time">09:41</span>
          <svg class="bar-logo" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <linearGradient id="barAurora-${sizeKey}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="var(--aurora-teal)"/>
                <stop offset="50%"  stop-color="var(--aurora-violet)"/>
                <stop offset="100%" stop-color="var(--aurora-coral)"/>
              </linearGradient>
            </defs>
            <path class="bar-spiral-${sizeKey}" fill="none" stroke="url(#barAurora-${sizeKey})" stroke-width="10" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="score-stack">
          <div class="ring-wrap">
            <svg class="ring-svg" viewBox="0 0 ${d.ringSize} ${d.ringSize}" aria-hidden="true">
              <defs>
                <linearGradient id="ringAurora-${sizeKey}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stop-color="var(--aurora-teal)"/>
                  <stop offset="50%"  stop-color="var(--aurora-violet)"/>
                  <stop offset="100%" stop-color="var(--aurora-coral)"/>
                </linearGradient>
              </defs>
              <circle class="ring-track" cx="${d.ringSize / 2}" cy="${d.ringSize / 2}" r="${d.ringRadius}"/>
              <circle class="ring-fill"  cx="${d.ringSize / 2}" cy="${d.ringSize / 2}" r="${d.ringRadius}"
                      stroke="url(#ringAurora-${sizeKey})"/>
            </svg>
            <div class="score-numeral" data-role="numeral">0</div>
          </div>
          <div class="trend-row">
            <svg class="trend-arrow" viewBox="0 0 24 24" aria-hidden="true" data-role="trend-arrow">
              <path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="status-word" data-role="status">—</span>
          </div>
          <div class="dot-row" data-role="dots">
            <span class="dot dot-active"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
        </div>
      </div>

      <div class="koru-trend">
        <div class="trend-header">
          <h4>7-day trend</h4>
          <span class="delta" data-role="trend-delta">+0</span>
        </div>
        <div class="trend-chart-wrap">
          <svg class="trend-chart" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="auroraTrend-${sizeKey}" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="var(--aurora-teal)"/>
                <stop offset="50%"  stop-color="var(--aurora-violet)"/>
                <stop offset="100%" stop-color="var(--aurora-coral)"/>
              </linearGradient>
              <linearGradient id="auroraArea-${sizeKey}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stop-color="var(--aurora-violet)"/>
                <stop offset="100%" stop-color="var(--aurora-violet)" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <path class="trend-area" data-role="trend-area" fill="url(#auroraArea-${sizeKey})"/>
            <path class="trend-line" data-role="trend-line" stroke="url(#auroraTrend-${sizeKey})"/>
            <g data-role="trend-points"></g>
          </svg>
        </div>
        <div class="day-row">${DAY_LABELS.map(d => `<span>${d}</span>`).join('')}</div>
      </div>

      <div class="koru-insights">
        <div class="insights-header">Top contributors</div>
        <div class="insights-list" data-role="insights-list"></div>
        <div class="insight-tip" data-role="insights-tip"></div>
      </div>

      <div class="koru-calendar">
        ${renderCalendarPage(root)}
      </div>
    `;

    // Draw the small status-bar spiral
    const spiralPath = root.querySelector(`.bar-spiral-${sizeKey}`);
    if (spiralPath) {
      spiralPath.setAttribute('d', buildSpiralPath({ cx: 50, cy: 50, maxR: 38, turns: 1.5, segments: 60 }));
    }

    // Set dasharray once so update() can just mutate offset
    const ringFill = root.querySelector('.ring-fill');
    const circumference = 2 * Math.PI * d.ringRadius;
    ringFill.setAttribute('stroke-dasharray', `${circumference}`);
    ringFill.dataset.circumference = circumference;
  }

  // -----------------------------------------------------------------------
  // Update a rendered device to a new state.
  // -----------------------------------------------------------------------
  function updateScreen(root, state) {
    // SCORE PAGE -----------------------------------------------------------
    const numeral = root.querySelector('[data-role="numeral"]');
    const statusWord = root.querySelector('[data-role="status"]');
    const trendArrow = root.querySelector('[data-role="trend-arrow"]');
    const ringFill = root.querySelector('.ring-fill');
    const circumference = Number(ringFill.dataset.circumference);
    const fraction = Math.max(0, Math.min(1, state.value / 100));

    // Animate numeral counting in
    animateNumber(numeral, parseInt(numeral.textContent, 10) || 0, state.value, 800);
    statusWord.textContent = state.status;
    ringFill.setAttribute('stroke-dashoffset', String(circumference * (1 - fraction)));

    // Flip arrow direction based on trend sign
    if (state.trend < 0) {
      trendArrow.innerHTML = '<path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
      trendArrow.style.color = 'var(--band-low)';
    } else if (state.trend > 0) {
      trendArrow.innerHTML = '<path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
      trendArrow.style.color = 'var(--band-high)';
    } else {
      trendArrow.innerHTML = '<path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';
      trendArrow.style.color = 'var(--band-mid)';
    }

    // TREND PAGE -----------------------------------------------------------
    const trendLine = root.querySelector('[data-role="trend-line"]');
    const trendArea = root.querySelector('[data-role="trend-area"]');
    const trendPoints = root.querySelector('[data-role="trend-points"]');
    const trendDelta = root.querySelector('[data-role="trend-delta"]');

    const { pathLine, pathArea, points } = buildSparkline(state.trendLine, 300, 140, 12);
    trendLine.setAttribute('d', pathLine);
    trendArea.setAttribute('d', pathArea);
    trendPoints.innerHTML = points
      .map(p => `<circle class="trend-point" cx="${p.x}" cy="${p.y}" r="${p.last ? 4 : 2.2}"/>`)
      .join('');
    trendDelta.textContent = (state.trend >= 0 ? '+' : '') + state.trend;
    trendDelta.classList.toggle('delta-up', state.trend > 0);
    trendDelta.classList.toggle('delta-down', state.trend < 0);

    // INSIGHTS PAGE --------------------------------------------------------
    const insightsList = root.querySelector('[data-role="insights-list"]');
    insightsList.innerHTML = state.components.map(c => `
      <div class="insight-row" data-comp='${JSON.stringify(c).replace(/'/g, "&#39;")}'>
        <div class="insight-row-top">
          <span class="insight-label">${c.label}</span>
          <span class="insight-value">${c.delta}</span>
        </div>
        <div class="insight-bar">
          <div class="insight-bar-fill" style="width: ${c.value}%"></div>
        </div>
      </div>
    `).join('');
    root.querySelector('[data-role="insights-tip"]').innerHTML = state.tip;
  }

  // -----------------------------------------------------------------------
  // Number count-in animation (ease-out)
  // -----------------------------------------------------------------------
  function animateNumber(el, from, to, duration) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = String(to);
      return;
    }
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const val = Math.round(from + (to - from) * eased);
      el.textContent = String(val);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // -----------------------------------------------------------------------
  // Sparkline builder for the 7-day trend
  // -----------------------------------------------------------------------
  function buildSparkline(data, w, h, pad) {
    const min = Math.min(...data, 30);
    const max = Math.max(...data, 100);
    const range = Math.max(1, max - min);
    const dx = (w - pad * 2) / (data.length - 1);
    const points = data.map((v, i) => ({
      x: pad + i * dx,
      y: pad + (1 - (v - min) / range) * (h - pad * 2),
      last: i === data.length - 1,
    }));
    const pathLine = 'M' + points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L');
    const pathArea = pathLine + ` L${points[points.length - 1].x.toFixed(1)},${h} L${points[0].x.toFixed(1)},${h} Z`;
    return { pathLine, pathArea, points };
  }

  // -----------------------------------------------------------------------
  // Page switching — score / trend / insights
  // -----------------------------------------------------------------------
  function setPage(index) {
    runtime.pageIndex = ((index % PAGES.length) + PAGES.length) % PAGES.length;
    document.querySelectorAll('.screen-inner').forEach((root) => {
      root.querySelectorAll('.koru-main, .koru-trend, .koru-insights, .koru-calendar')
        .forEach((p, i) => p.classList.toggle('page-active', i === runtime.pageIndex));
      const dots = root.querySelectorAll('[data-role="dots"] .dot');
      dots.forEach((d, i) => d.classList.toggle('dot-active', i === runtime.pageIndex));
    });
  }

  // -----------------------------------------------------------------------
  // State cycling
  // -----------------------------------------------------------------------
  function applyState(index) {
    runtime.stateIndex = ((index % STATES.length) + STATES.length) % STATES.length;
    const state = STATES[runtime.stateIndex];
    document.querySelectorAll('.screen-inner').forEach(root => updateScreen(root, state));
  }

  function cycleState() {
    applyState(runtime.stateIndex + 1);
    const s = STATES[runtime.stateIndex];
    showToast(`Score ${s.value} \u00B7 ${s.status}`, s.trend > 0 ? '\u2197\uFE0F' : s.trend < 0 ? '\u2198\uFE0F' : '\u2796');
    // Pulse the score numerals
    document.querySelectorAll('.score-numeral').forEach(el => {
      el.classList.remove('pulsing');
      void el.offsetWidth;
      el.classList.add('pulsing');
    });
    // Streak badges
    updateStreakBadges(runtime.stateIndex);
    // Confetti on Peak scores
    if (s.band === 'high' && s.value >= 90) {
      document.querySelectorAll('.screen-inner').forEach(root => burstConfetti(root));
    }
    // Milestone check
    setTimeout(() => checkMilestone(s), 600);
  }

  // -----------------------------------------------------------------------
  // Night Mode
  // -----------------------------------------------------------------------
  function setNight(on) {
    runtime.night = on;
    document.documentElement.setAttribute('data-theme', on ? 'night' : 'day');
    const btn = document.querySelector('[data-action="toggle-night"]');
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // -----------------------------------------------------------------------
  // Check-in sheet
  // -----------------------------------------------------------------------
  function openCheckIn()  { document.querySelector('.sheet-overlay').hidden = false; }
  function closeCheckIn() { document.querySelector('.sheet-overlay').hidden = true;  }

  // -----------------------------------------------------------------------
  // Particle system — ambient aurora dots floating behind everything.
  // -----------------------------------------------------------------------
  function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    const particles = [];
    const COUNT = 60;
    const COLORS = ['#37E2D5', '#7B5CFF', '#FF6B6B', '#5DA0E8', '#AA77FF'];

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 2.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.25,
        alpha: 0.15 + Math.random() * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.dx; p.y += p.dy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(draw);
    }
  }

  // -----------------------------------------------------------------------
  // Loading screen — dismisses after render + spiral path draw.
  // -----------------------------------------------------------------------
  function initLoader() {
    const loader = document.getElementById('loader');
    if (!loader) return;
    const sp = loader.querySelector('.loader-path');
    if (sp) sp.setAttribute('d', buildSpiralPath({ cx: 50, cy: 50, maxR: 38, turns: 1.6 }));
    setTimeout(() => loader.classList.add('fade-out'), 1400);
    setTimeout(() => { loader.style.display = 'none'; }, 2200);
  }

  // -----------------------------------------------------------------------
  // Toast notification system
  // -----------------------------------------------------------------------
  let toastTimer = null;
  function showToast(text, icon = '\u2728') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.querySelector('.toast-text').textContent = text;
    el.querySelector('.toast-icon').textContent = icon;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => { el.hidden = true; }, 400);
    }, 2800);
  }

  // -----------------------------------------------------------------------
  // Calendar heatmap — 28-day grid rendered inside the 4th watch page.
  // -----------------------------------------------------------------------
  const CALENDAR_DATA = (() => {
    const bands = ['recover', 'steady', 'strong', 'peak'];
    const values = [43, 64, 78, 82, 91, 68, 75, 55, 70, 88, 92, 44, 67, 73, 81, 85, 60, 72, 79, 84, 90, 48, 66, 77, 83, 87, 71, 80];
    return values.map((v, i) => ({
      day: 28 - i,
      value: v,
      band: v < 50 ? 'recover' : v < 70 ? 'steady' : v < 85 ? 'strong' : 'peak',
    }));
  })();

  function renderCalendarPage(root) {
    const today = new Date();
    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const monthStr = today.toLocaleDateString('en', { month: 'long', year: 'numeric' }).toUpperCase();
    let html = `<h4 class="cal-header">${monthStr}</h4>`;
    html += `<div class="cal-day-headers">${dayNames.map(d => `<span>${d}</span>`).join('')}</div>`;
    html += '<div class="cal-grid">';
    for (let i = CALENDAR_DATA.length - 1; i >= 0; i--) {
      const d = CALENDAR_DATA[i];
      const isToday = i === 0;
      html += `<div class="cal-cell ${isToday ? 'cal-today' : ''}" data-band="${d.band}" title="Day ${d.day}: Score ${d.value} (${d.band})" aria-label="Score ${d.value}, ${d.band}">${d.value}</div>`;
    }
    html += '</div>';
    html += `<div class="cal-legend">
      <span><span class="cal-legend-dot" style="background:rgba(255,107,107,0.55)"></span>Recover</span>
      <span><span class="cal-legend-dot" style="background:rgba(123,92,255,0.45)"></span>Steady</span>
      <span><span class="cal-legend-dot" style="background:rgba(55,226,213,0.5)"></span>Strong</span>
      <span><span class="cal-legend-dot" style="background:rgba(55,226,213,0.8)"></span>Peak</span>
    </div>`;
    return html;
  }

  // -----------------------------------------------------------------------
  // Component detail — opens a modal showing per-metric drilldown.
  // -----------------------------------------------------------------------
  const COMP_EXPLANATIONS = {
    'HRV': 'Heart Rate Variability measures your autonomic nervous system\'s flexibility. Higher overnight SDNN indicates stronger recovery capacity and resilience to stress.',
    'Sleep': 'Sleep quality is a composite of duration, deep+REM share, and efficiency. Consistently hitting 7\u20139 hours with 20%+ deep+REM is the strongest predictor of high scores.',
    'Resting HR': 'A lower resting heart rate generally indicates better cardiovascular fitness and recovery. Acute rises often signal stress, illness, or overtraining.',
    'Activity': 'Your daily movement measured through Apple\'s three activity rings: Move (calories), Exercise (active minutes), and Stand (hourly standing). Closing all rings = 100.',
    'Workouts': 'Training load uses a TRIMP-lite formula: duration \u00D7 intensity. An inverted-U curve means both undertraining and overtraining depress your score.',
    'VO\u2082 Max': 'Cardiorespiratory fitness measured as maximum oxygen uptake. This metric changes slowly over weeks \u2014 it\'s the best long-term health predictor in the formula.',
    'Blood O\u2082': 'Overnight blood oxygen saturation. Healthy is \u226595%. Drops below 93% are flagged aggressively because even mild chronic hypoxemia affects recovery.',
    'Breath Rate': 'Overnight respiratory rate in breaths per minute. Deviations in either direction from your personal baseline signal physiological stress.',
    'Wrist Temp': 'Sleeping wrist temperature deviation from your personal baseline. Shifts of \u00B10.3\u00B0C or more often precede illness, hormonal changes, or recovery strain.',
    'Mindful': 'Minutes of mindfulness sessions logged today. The target is 10 minutes/day \u2014 even a brief session meaningfully impacts HRV and subjective wellbeing.',
  };

  function openComponentDetail(component) {
    const overlay = document.querySelector('[data-sheet="component-detail"]');
    if (!overlay) return;
    overlay.querySelector('[data-role="comp-name"]').textContent = component.label;
    overlay.querySelector('[data-role="comp-score"]').textContent = String(component.value);
    overlay.querySelector('[data-role="comp-delta"]').textContent = component.delta;
    overlay.querySelector('[data-role="comp-explain"]').textContent = COMP_EXPLANATIONS[component.label] || 'A key contributor to your daily wellness score.';
    const impact = component.value > 55 ? `Contributing +${component.value - 50} to your score` : `Pulling score down by ${50 - component.value}`;
    overlay.querySelector('[data-role="comp-impact"]').innerHTML = `<span class="comp-impact-badge">${impact}</span>`;
    // Mini sparkline
    const sparkData = [component.value - 8, component.value - 4, component.value + 2, component.value - 6, component.value + 5, component.value - 1, component.value];
    const { pathLine } = buildSparkline(sparkData, 260, 80, 8);
    overlay.querySelector('[data-role="comp-line"]').setAttribute('d', pathLine);
    overlay.hidden = false;
  }

  function closeComponentDetail() {
    const overlay = document.querySelector('[data-sheet="component-detail"]');
    if (overlay) overlay.hidden = true;
  }

  // -----------------------------------------------------------------------
  // Confetti burst — fires inside a device screen on "Peak" scores.
  // -----------------------------------------------------------------------
  function burstConfetti(parent) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const container = document.createElement('div');
    container.className = 'confetti-container';
    parent.appendChild(container);
    const colors = ['#37E2D5', '#7B5CFF', '#FF6B6B', '#FFD700', '#FF8C42', '#E8FF42'];
    for (let i = 0; i < 18; i++) {
      const dot = document.createElement('div');
      dot.className = 'confetti-dot';
      const angle = (Math.PI * 2 * i) / 18 + (Math.random() - 0.5) * 0.5;
      const dist = 60 + Math.random() * 90;
      dot.style.setProperty('--cx', `${Math.cos(angle) * dist}px`);
      dot.style.setProperty('--cy', `${Math.sin(angle) * dist}px`);
      dot.style.left = '50%'; dot.style.top = '45%';
      dot.style.background = colors[i % colors.length];
      dot.style.animationDelay = `${Math.random() * 0.15}s`;
      container.appendChild(dot);
    }
    setTimeout(() => container.remove(), 1500);
  }

  // -----------------------------------------------------------------------
  // Milestone celebration — shows a full-screen card on special moments.
  // -----------------------------------------------------------------------
  const MILESTONES = [
    { value: 91, emoji: '💯', text: 'A perfect Koru score! You\'re in the top 1%.' },
    { value: 82, emoji: '🔥', text: '7-day streak! Consistency is the real superpower.' },
    { value: 64, emoji: '💪', text: 'Bounced back! Score jumped 20+ from your low.' },
    { value: 43, emoji: '🌱', text: 'Rest day detected. Recovery is growth.' },
  ];
  let milestoneShown = new Set();

  function checkMilestone(state) {
    const ms = MILESTONES.find(m => m.value === state.value && !milestoneShown.has(m.value));
    if (!ms) return;
    milestoneShown.add(ms.value);
    const overlay = document.getElementById('milestone');
    if (!overlay) return;
    overlay.querySelector('[data-role="ms-emoji"]').textContent = ms.emoji;
    overlay.querySelector('[data-role="ms-text"]').textContent = ms.text;
    overlay.hidden = false;
  }

  function dismissMilestone() {
    const overlay = document.getElementById('milestone');
    if (overlay) overlay.hidden = true;
  }

  // -----------------------------------------------------------------------
  // Streak badge — shows fire icon + count in score page.
  // -----------------------------------------------------------------------
  function updateStreakBadges(stateIndex) {
    const streakCount = Math.max(0, 7 - stateIndex % 4);
    document.querySelectorAll('.screen-inner').forEach(root => {
      let badge = root.querySelector('.streak-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'streak-badge';
        badge.innerHTML = '<span class="streak-flame">🔥</span><span class="streak-count"></span>';
        const mainPage = root.querySelector('.koru-main');
        if (mainPage) mainPage.appendChild(badge);
      }
      badge.querySelector('.streak-count').textContent = String(streakCount);
      badge.classList.toggle('visible', streakCount >= 3);
      badge.classList.toggle('streak-hot', streakCount >= 7);
    });
  }

  // -----------------------------------------------------------------------
  // Touch gestures — swipe left/right to change pages on mobile.
  // -----------------------------------------------------------------------
  function initTouch() {
    let startX = 0, startY = 0;
    document.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx > 0) setPage(runtime.pageIndex - 1);
      else        setPage(runtime.pageIndex + 1);
    }, { passive: true });
  }

  // -----------------------------------------------------------------------
  // Mouse wheel = crown-scroll analogue
  // -----------------------------------------------------------------------
  let wheelLock = false;
  function onWheel(e) {
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 320);
    setPage(runtime.pageIndex + (e.deltaY > 0 ? 1 : -1));
  }

  // -----------------------------------------------------------------------
  // Chip row behavior inside the check-in sheet
  // -----------------------------------------------------------------------
  function wireChips() {
    document.querySelectorAll('.sheet-step').forEach((step) => {
      step.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        step.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
      });
    });
  }

  // -----------------------------------------------------------------------
  // Boot
  // -----------------------------------------------------------------------
  function boot() {
    document.querySelectorAll('.screen-inner').forEach((root) => {
      renderScreenShell(root, root.dataset.size);
    });
    applyState(0);
    setPage(0);
    wireChips();

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'cycle-state')      cycleState();
      if (action === 'prev-page')      setPage(runtime.pageIndex - 1);
      if (action === 'next-page')      setPage(runtime.pageIndex + 1);
      if (action === 'toggle-night')   setNight(!runtime.night);
      if (action === 'open-checkin')   openCheckIn();
      if (action === 'close-checkin')  closeCheckIn();
      if (action === 'close-component')  closeComponentDetail();
      if (action === 'dismiss-milestone') dismissMilestone();
    });

    document.addEventListener('wheel', onWheel, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'j')      setPage(runtime.pageIndex + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'k')  setPage(runtime.pageIndex - 1);
      else if (e.key === ' ')                           { e.preventDefault(); cycleState(); }
      else if (e.key === 'n' || e.key === 'N')          setNight(!runtime.night);
      else if (e.key === 'c' || e.key === 'C')          openCheckIn();
      else if (e.key === 'Escape')                      { closeCheckIn(); closeComponentDetail(); }
    });

    // Insight row tap → component detail
    document.addEventListener('click', (e) => {
      const row = e.target.closest('.insight-row[data-comp]');
      if (!row) return;
      try { openComponentDetail(JSON.parse(row.dataset.comp)); } catch {}
    });

    // Action button on Ultra 2 device → open check-in
    document.querySelectorAll('.action-button').forEach(btn => {
      btn.addEventListener('click', () => openCheckIn());
    });

    // Crown click → next page
    document.querySelectorAll('.crown').forEach(cr => {
      cr.addEventListener('click', () => setPage(runtime.pageIndex + 1));
    });

    // Initialize 10x features
    initParticles();
    initLoader();
    initTouch();

    // Auto-cycle every 7s so the prototype feels alive
    setInterval(cycleState, 7000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
