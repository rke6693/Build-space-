// Thin helper to push live metric values into the DOM. No framework.

const FORMATTERS = {
  maxBoxDisplacementXY: (v) => `${v.toFixed(1)} mm`,
  boxesToppled:         (v) => `${v}`,
  loadLeanAngle:        (v) => `${v.toFixed(2)} °`,
  palletCOGShift:       (v) => `${v.toFixed(1)} mm`,
  wrapBroken:           (v) => (v ? 'BROKEN' : 'intact'),
  compressionDeflection:(v) => `${v.toFixed(2)} mm`,
  maxBoxAccel:          (v) => `${v.toFixed(2)} g`,
  bctAdvisory_McKee:    (v) => `${v.toFixed(0)} lbf`,
};

const THRESHOLD_CLASSES = {
  maxBoxDisplacementXY: (v) => v > 25 ? 'err' : v > 15 ? 'warn' : 'ok',
  boxesToppled:         (v) => v > 0 ? 'err' : 'ok',
  loadLeanAngle:        (v) => v > 3 ? 'err' : v > 2 ? 'warn' : 'ok',
  palletCOGShift:       (v) => v > 50 ? 'err' : v > 30 ? 'warn' : 'ok',
  wrapBroken:           (v) => v ? 'err' : 'ok',
  compressionDeflection:(v) => v > 10 ? 'err' : v > 6 ? 'warn' : 'ok',
};

export function renderMetrics(m) {
  const set = (k, val) => {
    const el = document.querySelector(`[data-metric="${k}"]`);
    if (!el) return;
    const fmt = FORMATTERS[k];
    el.textContent = fmt ? fmt(val) : String(val);
    const cls = THRESHOLD_CLASSES[k]?.(val);
    el.classList.remove('ok', 'warn', 'err');
    if (cls) el.classList.add(cls);
  };
  set('maxBoxDisplacementXY', m.maxBoxDisplacementXY_mm ?? 0);
  set('boxesToppled', m.boxesToppled ?? 0);
  set('loadLeanAngle', m.loadLeanAngle_deg ?? 0);
  set('palletCOGShift', m.palletCOGShift_mm ?? 0);
  set('wrapBroken', m.wrapBroken ? 1 : 0);
  set('compressionDeflection', m.compressionDeflection_mm ?? 0);
  set('maxBoxAccel', m.maxBoxAccel_g ?? 0);
  set('bctAdvisory_McKee', m.bctAdvisory_lbf ?? 0);
}

export function setVerdict(state, message) {
  const el = document.getElementById('verdict-card');
  if (!el) return;
  el.classList.remove('verdict-idle', 'verdict-running', 'verdict-pass', 'verdict-fail');
  el.classList.add(`verdict-${state}`);
  el.querySelector('.verdict-value').textContent = message;
}

export function setPhase(name) {
  const el = document.getElementById('hud-phase');
  if (el) el.textContent = name;
}

export function setSimTime(sec) {
  const el = document.getElementById('hud-sim-time');
  if (el) el.textContent = `${sec.toFixed(3)} s`;
}
