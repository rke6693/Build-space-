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
  const PAGES = ['score', 'trend', 'insights'];

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
      <div class="insight-row">
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
      root.querySelectorAll('.koru-main, .koru-trend, .koru-insights')
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

  function cycleState() { applyState(runtime.stateIndex + 1); }

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
      if (action === 'cycle-state')   cycleState();
      if (action === 'prev-page')     setPage(runtime.pageIndex - 1);
      if (action === 'next-page')     setPage(runtime.pageIndex + 1);
      if (action === 'toggle-night')  setNight(!runtime.night);
      if (action === 'open-checkin')  openCheckIn();
      if (action === 'close-checkin') closeCheckIn();
    });

    document.addEventListener('wheel', onWheel, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'j')      setPage(runtime.pageIndex + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'k')  setPage(runtime.pageIndex - 1);
      else if (e.key === ' ')                           { e.preventDefault(); cycleState(); }
      else if (e.key === 'n' || e.key === 'N')          setNight(!runtime.night);
      else if (e.key === 'Escape')                      closeCheckIn();
    });

    // Auto-cycle every 7s so the prototype feels alive
    setInterval(cycleState, 7000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
