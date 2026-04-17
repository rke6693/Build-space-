// Main bootstrap: init Rapier, build CHEP pallet + parameterized box stack,
// render via Three.js, and drive the full ISTA 3E sequence on demand.

import { ensureRapierReady, createWorld, FixedStepLoop, disposeWorld, PHYS_HZ, PHYS_DT } from './physics/world.js';
import { spawnCHEPPallet } from './physics/pallet.js';
import { spawnBox, spawnGround } from './physics/box.js';
import { layoutLayer } from './physics/stack-patterns.js';
import { StretchWrap } from './physics/stretch-wrap.js';
import { MetricsCollector } from './analysis/metrics.js';
import { runISTA3ESequence } from './tests/sequencer.js';
import { Viewport } from './ui/viewport.js';
import { renderMetrics, setVerdict, setPhase, setSimTime } from './ui/metrics-panel.js';
import { runReportJSON, runReportCSV, printableHTML, triggerDownload, batchReportCSV } from './ui/report.js';
import { runMonteCarloBatch } from './runner/monte-carlo.js';
import { renderTornado, renderHistogram, renderCpkTable } from './ui/charts.js';

class App {
  constructor() {
    this.viewport = null;
    this.world = null;
    this.loop = null;
    this.pallet = null;
    this.boxes = [];
    this.wrap = null;
    this.metrics = null;
    this.rafHandle = null;
    this.running = false;
    this.lastReport = null;
    this._fpsEma = 0;
    this._fpsLastMs = 0;
  }

  async init() {
    await ensureRapierReady();
    const canvas = document.getElementById('viewport');
    this.viewport = new Viewport(canvas);
    this.viewport._resize();
    this._wireUI();
    await this.rebuild();
    this.startRenderLoop();
    this._enableButtons();
    document.getElementById('boot-overlay')?.classList.add('hidden');
  }

  readConfig() {
    const v = (id) => parseFloat(document.getElementById(id).value);
    const s = (id) => document.getElementById(id).value;
    return {
      boxLmm: v('inp-box-L'),
      boxWmm: v('inp-box-W'),
      boxHmm: v('inp-box-H'),
      boxMass: v('inp-box-mass'),
      ectLbIn: v('inp-box-ect'),
      muCC: v('inp-box-mu'),
      pattern: s('inp-pattern'),
      layers: Math.max(1, Math.round(v('inp-layers'))),
      wrapTurns: Math.max(0, Math.round(v('inp-wrap-turns'))),
      wrapTensionN: v('inp-wrap-tension'),
      vibrationDurationSec: v('inp-vib-duration'),
      timeCompression: Math.max(1, v('inp-time-compression')),
      seed: Math.round(v('inp-seed')),
    };
  }

  async rebuild() {
    const cfg = this.readConfig();
    if (this.world) disposeWorld(this.world);
    this.world = createWorld();
    this.loop = new FixedStepLoop(this.world);
    this.viewport.clearBoxes();
    this.boxes = [];
    this.wrap = null;
    this.metrics = null;

    spawnGround(this.world);
    const palletY = 0.142 / 2;
    this.pallet = spawnCHEPPallet(this.world, { kinematic: false, position: { x: 0, y: palletY, z: 0 } });
    this.viewport.attachPallet(this.pallet);
    this.viewport.focusOnPallet();

    // Build stack.
    const box = { L: cfg.boxLmm / 1000, W: cfg.boxWmm / 1000, H: cfg.boxHmm / 1000 };
    const palletTopY = this.pallet.topSurfaceY;
    let created = 0;
    for (let layer = 0; layer < cfg.layers; layer++) {
      const positions = layoutLayer(cfg.pattern, layer, box);
      for (const p of positions) {
        const y = palletTopY + box.H * (layer + 0.5) + 0.001 * layer;
        const spawned = spawnBox(this.world, {
          L: box.L, W: box.W, H: box.H, mass: cfg.boxMass,
          position: { x: p.x, y, z: p.z },
          rotationY: p.rotY,
          friction: cfg.muCC,
          label: `box_L${layer}_${created}`,
        });
        this.boxes.push(spawned);
        this.viewport.addBox(spawned);
        created++;
      }
    }

    // Stretch wrap (if turns > 0).
    if (cfg.wrapTurns > 0) {
      this.wrap = new StretchWrap({
        boxes: this.boxes,
        turns: cfg.wrapTurns,
        pretensionN: cfg.wrapTensionN,
        releaseY: palletTopY + 0.03,
        palletTopY,
      });
    }

    this.metrics = new MetricsCollector({ boxes: this.boxes, pallet: this.pallet, wrap: this.wrap });
    setVerdict('idle', `${this.boxes.length} boxes — ready`);
    setPhase('Idle');
    renderMetrics(this.metrics.toReport({
      palletTopY,
      boxConfig: { L: box.L, W: box.W, ectLbIn: cfg.ectLbIn, caliperIn: 0.156 },
      runMeta: {},
    }).metrics);
  }

  startRenderLoop() {
    const frame = (nowMs) => {
      this.rafHandle = requestAnimationFrame(frame);
      if (!this.running) {
        // Live preview: run physics so the user can see settling, but don't accumulate metrics for the report.
        this.loop.advance(nowMs, () => {
          if (this.wrap) this.wrap.applyForces(this.loop.totalSimTime);
        });
      }
      this.viewport.syncFromPhysics();
      this.viewport.render();
      setSimTime(this.loop.totalSimTime);
      this._updateFps(nowMs);
      this._publishStatus();
    };
    this.rafHandle = requestAnimationFrame(frame);
  }

  _updateFps(nowMs) {
    if (this._fpsLastMs > 0) {
      const fps = 1000 / Math.max(0.5, nowMs - this._fpsLastMs);
      this._fpsEma = this._fpsEma ? this._fpsEma * 0.9 + fps * 0.1 : fps;
      const el = document.getElementById('hud-fps');
      if (el) el.textContent = `${this._fpsEma.toFixed(0)}`;
    }
    this._fpsLastMs = nowMs;
  }

  _publishStatus() {
    const el = document.getElementById('status-line');
    if (!el) return;
    el.textContent =
      `Rapier 0.14 · Three.js r160 · dt=${(PHYS_DT * 1000).toFixed(2)} ms · boxes=${this.boxes.length} · t=${this.loop.totalSimTime.toFixed(2)} s`;
  }

  async runSequence() {
    if (this.running) return;
    this.running = true;
    this._disableButtons(['btn-run-single', 'btn-run-batch', 'btn-reset']);
    setVerdict('running', 'Running ISTA 3E sequence…');

    try {
      const cfg = this.readConfig();
      const box = { L: cfg.boxLmm / 1000, W: cfg.boxWmm / 1000, H: cfg.boxHmm / 1000 };
      const palletTopY = this.pallet.topSurfaceY;

      // Reset metrics at run start.
      this.metrics = new MetricsCollector({ boxes: this.boxes, pallet: this.pallet, wrap: this.wrap });

      // Cooperative scheduling: the sequencer calls world.step() synchronously in a loop,
      // so we yield to the render loop every N physics steps via setTimeout(0).
      const sequencerConfig = {
        ...cfg,
        vibrationDurationSec: cfg.vibrationDurationSec,
        timeCompression: cfg.timeCompression,
        seed: cfg.seed,
      };

      // Wrap world.step with a yielding trampoline.
      const originalStep = this.world.step.bind(this.world);
      let stepsSinceYield = 0;
      this.world.step = () => {
        originalStep();
        this.loop.totalSteps += 1;
        this.loop.totalSimTime += PHYS_DT;
        stepsSinceYield++;
      };
      const yieldEveryNSteps = 40; // ~12 ms of sim time per yield
      const needsYield = () => stepsSinceYield >= yieldEveryNSteps;
      const yieldNow = () => new Promise((r) => { stepsSinceYield = 0; setTimeout(r, 0); });

      // Patch postStep on the sequencer flow by awaiting between batches.
      const onProgress = async ({ phase, frac }) => {
        if (needsYield()) await yieldNow();
        const pct = Math.round((frac || 0) * 100);
        setPhase(`${phase} ${pct}%`);
      };
      const onPhase = (phase) => setPhase(phase);

      const result = await runISTA3ESequence({
        world: this.world,
        pallet: this.pallet,
        boxes: this.boxes,
        wrap: this.wrap,
        metrics: this.metrics,
        config: sequencerConfig,
        onPhase,
        onProgress,
      });

      // Restore step.
      this.world.step = originalStep;

      const report = this.metrics.toReport({
        palletTopY,
        boxConfig: { L: box.L, W: box.W, ectLbIn: cfg.ectLbIn, caliperIn: 0.156 },
        runMeta: {
          pallet: 'CHEP_GMA_48x40',
          boxDims_mm: `${cfg.boxLmm}x${cfg.boxWmm}x${cfg.boxHmm}`,
          boxMass_kg: cfg.boxMass,
          muCC: cfg.muCC,
          pattern: cfg.pattern,
          layers: cfg.layers,
          wrapTurns: cfg.wrapTurns,
          wrapTensionN: cfg.wrapTensionN,
          vibrationDurationSec: cfg.vibrationDurationSec,
          timeCompression: cfg.timeCompression,
          seed: cfg.seed,
          phaseLog: result.phaseLog,
          timestamp: new Date().toISOString(),
        },
      });

      this.lastReport = report;
      renderMetrics(report.metrics);
      setVerdict(report.verdict === 'PASS' ? 'pass' : 'fail',
        report.verdict === 'PASS' ? 'PASS — all ISTA 3E criteria met' : 'FAIL — one or more criteria exceeded');
      setPhase('Done');
      document.getElementById('btn-export').disabled = false;
    } catch (err) {
      console.error(err);
      setVerdict('fail', `Error: ${err.message}`);
    } finally {
      this.running = false;
      this._enableButtons();
    }
  }

  exportReport() {
    if (this.lastBatch) this.exportBatch();
    if (!this.lastReport) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `ista3e-run-${stamp}`;
    triggerDownload(`${base}.json`, 'application/json', runReportJSON(this.lastReport));
    triggerDownload(`${base}.csv`, 'text/csv', runReportCSV(this.lastReport));
    triggerDownload(`${base}.html`, 'text/html', printableHTML(this.lastReport));
  }

  _wireUI() {
    document.getElementById('btn-reset')?.addEventListener('click', () => this.rebuild());
    document.getElementById('btn-run-single')?.addEventListener('click', () => this.runSequence());
    document.getElementById('btn-export')?.addEventListener('click', () => this.exportReport());
    document.getElementById('btn-run-batch')?.addEventListener('click', () => this.runBatch());
    // Auto-rebuild on config changes.
    const cfgInputs = document.querySelectorAll('#panel-config input, #panel-config select');
    cfgInputs.forEach(el => el.addEventListener('change', () => {
      if (!this.running) this.rebuild();
    }));
  }

  async runBatch() {
    if (this.running) return;
    const nTrials = parseInt(prompt('Number of Monte Carlo trials? (Recommended 30-100. Each trial is a compressed ISTA 3E sequence; 50 trials ~ 3-10 min)', '30'), 10);
    if (!nTrials || nTrials < 2) return;
    this.running = true;
    this._disableButtons(['btn-run-single', 'btn-run-batch', 'btn-reset']);
    setVerdict('running', `Monte Carlo: 0 / ${nTrials} trials`);
    setPhase('Monte Carlo');
    document.getElementById('batch-results')?.classList.remove('hidden');
    try {
      const cfg = this.readConfig();
      const batch = await runMonteCarloBatch({
        base: {
          boxLmm: cfg.boxLmm, boxWmm: cfg.boxWmm, boxHmm: cfg.boxHmm,
          boxMass: cfg.boxMass, muCC: cfg.muCC, pattern: cfg.pattern,
          layers: cfg.layers, wrapTurns: cfg.wrapTurns, wrapTensionN: cfg.wrapTensionN,
          vibrationDurationSec: Math.min(cfg.vibrationDurationSec, 60),
          timeCompression: cfg.timeCompression,
          ectLbIn: cfg.ectLbIn,
        },
        nTrials,
        seedRoot: cfg.seed,
        onProgress: (frac, t) => {
          setVerdict('running', `Monte Carlo: ${t} / ${nTrials} trials  (${Math.round(frac * 100)}%)`);
          setPhase(`MC trial ${t}/${nTrials}`);
        },
      });
      this.lastBatch = batch;
      const pass = batch.trials.filter(t => t.verdict === 'PASS').length;
      const passRate = pass / batch.trials.length;
      setVerdict(passRate >= 0.99 ? 'pass' : passRate >= 0.90 ? 'running' : 'fail',
        `Monte Carlo: ${pass}/${batch.trials.length} PASS (${(passRate * 100).toFixed(1)}%)`);
      setPhase('Done');
      renderCpkTable(document.getElementById('cpk-table'), batch.cpk);
      renderTornado(document.getElementById('tornado-chart'), batch.sensitivity, { outputMetric: 'maxBoxDisplacementXY_mm' });
      // Histogram of the first metric as a distribution preview.
      const samples = batch.trials.map(t => t.metrics.maxBoxDisplacementXY_mm);
      renderHistogram(document.getElementById('hist-chart'), samples, { label: 'maxBoxDisplacementXY (mm)' });
      document.getElementById('btn-export').disabled = false;
    } catch (err) {
      console.error(err);
      setVerdict('fail', `Batch error: ${err.message}`);
    } finally {
      this.running = false;
      this._enableButtons();
    }
  }

  exportBatch() {
    if (!this.lastBatch) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `ista3e-batch-${stamp}`;
    triggerDownload(`${base}.json`, 'application/json', JSON.stringify(this.lastBatch, null, 2));
    triggerDownload(`${base}.csv`, 'text/csv', batchReportCSV(this.lastBatch));
  }

  _enableButtons() {
    ['btn-run-single', 'btn-run-batch'].forEach(id => {
      const el = document.getElementById(id); if (el) el.disabled = false;
    });
  }

  _disableButtons(ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  }
}

window.__simApp = new App();
window.__simApp.init().catch((err) => {
  console.error(err);
  const el = document.getElementById('boot-overlay-msg');
  if (el) el.textContent = `Initialization failed: ${err.message}`;
});
