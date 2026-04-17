// Packaging Engineering Calculators
// All formulas are industry-standard engineering estimations.
(function () {
  const { byId, fmt } = window.PE;

  // Helper to read numeric input
  const num = id => parseFloat(byId(id).value);

  // ---------- 1. McKee Box Compression (BCT) ----------
  // BCT (lbf) = 5.874 * ECT (lb/in) * sqrt(caliper (in) * perimeter (in))
  // Metric: BCT (N) = 2.028 * ECT (kN/m) * sqrt(h (mm) * Z (mm))  (approx)
  function calcMckee() {
    const ect = num('mk-ect');           // lb/in
    const caliper = num('mk-caliper');   // inches
    const L = num('mk-length');          // inches
    const W = num('mk-width');           // inches
    const safety = num('mk-safety') || 1;
    const stackTime = byId('mk-time').value;
    if ([ect, caliper, L, W].some(Number.isNaN)) return 'Enter all fields.';

    const Z = 2 * (L + W); // perimeter
    const bct = 5.874 * ect * Math.sqrt(caliper * Z);

    // Time derating factors (industry typical)
    const timeFactors = { '0': 1.0, '10': 0.65, '30': 0.50, '180': 0.40 };
    const tf = timeFactors[stackTime] ?? 1.0;

    // Humidity derating at 50% RH baseline -> 85% RH reduces ~50%. Default 1 (50% RH assumed).
    const humidity = parseFloat(byId('mk-humidity').value) || 50;
    let hf = 1;
    if (humidity >= 80) hf = 0.5;
    else if (humidity >= 70) hf = 0.72;
    else if (humidity >= 60) hf = 0.85;

    const workingLoad = (bct * tf * hf) / safety;

    return {
      'Perimeter (Z)': fmt(Z) + ' in',
      'Predicted BCT (lbf)': fmt(bct, 0),
      'Time factor': tf,
      'Humidity factor': hf,
      'Safe stacking load': fmt(workingLoad, 0) + ' lbf',
      'Note': 'McKee simplified; verify with ASTM D642 / TAPPI T804.'
    };
  }

  // ---------- 2. Dimensional (DIM) Weight ----------
  function calcDim() {
    const L = num('dim-l');
    const W = num('dim-w');
    const H = num('dim-h');
    const carrier = byId('dim-carrier').value;
    const units = byId('dim-units').value; // 'in-lb' or 'cm-kg'
    const divisors = {
      'ups-ground': units === 'in-lb' ? 139 : 5000,
      'ups-air':    units === 'in-lb' ? 139 : 5000,
      'fedex-gnd':  units === 'in-lb' ? 139 : 5000,
      'usps':       units === 'in-lb' ? 166 : 6000,
      'intl':       units === 'in-lb' ? 139 : 5000,
      'amazon':     units === 'in-lb' ? 139 : 5000
    };
    const d = divisors[carrier];
    if ([L, W, H].some(Number.isNaN)) return 'Enter all fields.';
    const dim = (L * W * H) / d;
    const actual = parseFloat(byId('dim-actual').value) || 0;
    const billable = Math.max(dim, actual);
    const unit = units === 'in-lb' ? 'lb' : 'kg';
    return {
      'Volume': fmt(L * W * H, 0) + (units === 'in-lb' ? ' in³' : ' cm³'),
      'Divisor': d,
      'Dimensional weight': fmt(dim, 1) + ' ' + unit,
      'Actual weight': fmt(actual, 1) + ' ' + unit,
      'Billable weight': fmt(billable, 1) + ' ' + unit
    };
  }

  // ---------- 3. Drop Height by Package Weight (ASTM D5276 / ISTA) ----------
  // Heuristic tiers
  function calcDrop() {
    const wt = num('drop-weight');
    const unit = byId('drop-unit').value;
    const severity = byId('drop-sev').value;
    if (Number.isNaN(wt)) return 'Enter weight.';
    const lb = unit === 'kg' ? wt * 2.20462 : wt;

    const tiers = [
      { max: 20,   light: 30, moderate: 36, severe: 48 },
      { max: 40,   light: 24, moderate: 30, severe: 36 },
      { max: 60,   light: 18, moderate: 24, severe: 30 },
      { max: 100,  light: 12, moderate: 18, severe: 24 },
      { max: 150,  light: 10, moderate: 15, severe: 20 },
      { max: 250,  light: 8,  moderate: 12, severe: 18 }
    ];
    const tier = tiers.find(t => lb <= t.max) || { light: 6, moderate: 10, severe: 12 };
    const h = tier[severity];
    return {
      'Package weight': fmt(lb, 1) + ' lb',
      'Severity': severity,
      'Drop height (in)': h,
      'Drop height (mm)': fmt(h * 25.4, 0),
      'Sequence': '10 drops: 1 corner, 3 edges, 6 faces (ASTM D5276).'
    };
  }

  // ---------- 4. Cushion / Fragility (G-factor based) ----------
  // Minimum cushion thickness t = h / (G - 1)  (from peak G and drop height, approximate)
  // Required area A = W / P_static where P_static is the foam static stress curve sweet spot
  function calcCushion() {
    const dropIn = num('cu-drop');
    const weight = num('cu-weight');       // lb (product)
    const gTarget = num('cu-g');           // g
    const sigma = num('cu-sigma');         // static stress lb/in^2 (from curve)
    if ([dropIn, weight, gTarget, sigma].some(Number.isNaN)) return 'Enter all fields.';
    // Energy equation approximation: t = H / (G-1) in inches (for constant deceleration idealisation)
    const t = dropIn / Math.max(gTarget - 1, 1);
    const area = weight / sigma;
    return {
      'Required cushion thickness': fmt(t, 2) + ' in',
      'Required cushion area (total, per face)': fmt(area, 2) + ' in²',
      'Tip': 'Verify against the foam manufacturer cushion curve for your gauge and drop height.'
    };
  }

  // ---------- 5. Pallet Cube / Ti x Hi ----------
  function calcPallet() {
    const palletL = num('pal-l') || 48;
    const palletW = num('pal-w') || 40;
    const palletH = num('pal-h') || 6;
    const maxH = num('pal-max') || 72;
    const cL = num('pal-cl');
    const cW = num('pal-cw');
    const cH = num('pal-ch');
    const cWt = num('pal-cwt') || 0;
    if ([cL, cW, cH].some(Number.isNaN)) return 'Enter case dimensions.';

    // Simple grid fit (ti) using two orientations on pallet footprint
    const fitA = Math.floor(palletL / cL) * Math.floor(palletW / cW);
    const fitB = Math.floor(palletL / cW) * Math.floor(palletW / cL);
    const ti = Math.max(fitA, fitB);
    const hi = Math.floor((maxH - palletH) / cH);
    const cases = ti * hi;
    const loadWt = cases * cWt;
    const cube = cases * cL * cW * cH;

    return {
      'Ti (cases per layer)': ti,
      'Hi (layers high)': hi,
      'Total cases': cases,
      'Total weight (lb)': fmt(loadWt, 1),
      'Product cube': fmt(cube, 0) + ' in³',
      'Pallet utilization': fmt(100 * (cases * cL * cW * cH) / (palletL * palletW * (maxH - palletH)), 1) + ' %'
    };
  }

  // ---------- 6. Corrugated Board Caliper from Flute ----------
  function calcCaliper() {
    const flute = byId('cal-flute').value;
    const calipers = { A: 4.8, B: 3.2, C: 4.0, E: 1.6, F: 0.8, BC: 6.4, EB: 4.8, BA: 8.0 };
    const mm = calipers[flute];
    return {
      'Flute': flute,
      'Caliper (mm)': mm,
      'Caliper (in)': fmt(mm / 25.4, 3),
      'Flutes per meter (typical)': { A: 110, B: 154, C: 128, E: 290, F: 420, BC: 282, EB: 444, BA: 264 }[flute]
    };
  }

  // ---------- 7. MVTR / OTR Shelf-Life Estimate (simplified) ----------
  // Shelf life (days) = (Max allowable moisture gain [g]) / (MVTR [g/m2/day] * Area [m2])
  function calcShelfLife() {
    const mvtr = num('sl-mvtr');
    const area = num('sl-area');
    const gain = num('sl-gain');
    if ([mvtr, area, gain].some(Number.isNaN)) return 'Enter all fields.';
    const days = gain / (mvtr * area);
    return {
      'Shelf life estimate': fmt(days, 0) + ' days (~' + fmt(days / 30, 1) + ' months)',
      'Note': 'Linear model; assumes constant ambient & headspace.'
    };
  }

  // ---------- 8. Paperboard GSM to lb/1000 ft² ----------
  function calcGsm() {
    const gsm = num('gsm-gsm');
    if (Number.isNaN(gsm)) return 'Enter a value.';
    // 1 gsm = 0.2048 lb/1000ft² (approx) for caliper-neutral basis weight
    const lbs = gsm * 0.2048;
    return {
      'GSM (g/m²)': gsm,
      'lb / 1000 ft² (basis weight)': fmt(lbs, 1),
      'oz / yd²': fmt(gsm * 0.0295, 2)
    };
  }

  // ---------- 9. CO2e footprint (simple emission factor estimator) ----------
  function calcCO2() {
    const material = byId('co2-mat').value;
    const massKg = num('co2-mass');
    const units = num('co2-units') || 1;
    // Cradle-to-gate kg CO2e / kg material (approximate, for directional estimates)
    const ef = {
      'rpet': 1.4, 'pet': 2.7, 'hdpe': 1.9, 'ldpe': 2.1, 'pp': 1.9,
      'aluminum-virgin': 11.5, 'aluminum-recycled': 1.2,
      'glass-virgin': 0.9, 'glass-recycled': 0.5,
      'steel-tin': 2.5,
      'corrugated-virgin': 1.0, 'corrugated-recycled': 0.7,
      'paperboard-sbs': 1.1, 'molded-pulp': 0.8,
      'pla': 2.0, 'bopp': 2.0
    };
    if (Number.isNaN(massKg)) return 'Enter mass.';
    const factor = ef[material];
    const perUnit = massKg * factor;
    const total = perUnit * units;
    return {
      'Emission factor': factor + ' kg CO₂e / kg',
      'Per unit': fmt(perUnit, 3) + ' kg CO₂e',
      ['Total (units=' + units + ')']: fmt(total, 1) + ' kg CO₂e',
      'Note': 'Directional only; use supplier LCA or EPD for reporting.'
    };
  }

  // ---------- 10. Unit Conversions ----------
  function calcConvert() {
    const val = num('cv-val');
    const from = byId('cv-from').value;
    const to = byId('cv-to').value;
    if (Number.isNaN(val)) return 'Enter a value.';
    // Only convert within the same dimension group
    const groups = {
      length: { in: 25.4, mm: 1, cm: 10, ft: 304.8, m: 1000 },
      mass:   { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 },
      force:  { N: 1, lbf: 4.44822, kgf: 9.80665 },
      pressure:{ kPa: 1, psi: 6.89476, Pa: 0.001, bar: 100, 'N/mm2': 1000 },
      basis:  { gsm: 1, 'lb/1000ft2': 4.8824 }
    };
    const group = Object.entries(groups).find(([_, m]) => m[from] && m[to]);
    if (!group) return 'Units are in different dimensions.';
    const [_, map] = group;
    const inBase = val * map[from];
    const out = inBase / map[to];
    return {
      'Input': val + ' ' + from,
      'Output': fmt(out, 5) + ' ' + to
    };
  }

  // ---------- 11. Seal Integrity / Bubble-Leak Pressure (ASTM F2096 approx) ----------
  function calcBubble() {
    const seal = num('seal-width');   // mm
    const burst = num('seal-burst');  // N/15mm (seal strength)
    const area = num('seal-area');    // cm2 internal
    if ([seal, burst, area].some(Number.isNaN)) return 'Enter fields.';
    // Simplified: pressure (kPa) ~= (2 * sealStrength_N/mm * seal_width_mm) / area_mm2
    const strengthNmm = burst / 15; // N/mm
    const pressure = (2 * strengthNmm * seal) / (area * 100); // kPa approx
    return {
      'Seal linear strength': fmt(strengthNmm, 2) + ' N/mm',
      'Estimated burst pressure': fmt(pressure, 2) + ' kPa',
      'Note': 'Estimation only; use ASTM F1140/F2054 for validation.'
    };
  }

  // ---------- 12. ECT Target from BCT ----------
  function calcEctFromBct() {
    const bct = num('ect-bct');
    const caliper = num('ect-caliper');
    const L = num('ect-l');
    const W = num('ect-w');
    if ([bct, caliper, L, W].some(Number.isNaN)) return 'Enter all fields.';
    const Z = 2 * (L + W);
    const ect = bct / (5.874 * Math.sqrt(caliper * Z));
    return {
      'Required ECT (lb/in)': fmt(ect, 1),
      'Required ECT (kN/m)': fmt(ect * 0.175, 2),
      'Perimeter (in)': fmt(Z, 1)
    };
  }

  // Register all calculators (key => function)
  window.PE.calculators = {
    mckee: calcMckee,
    dim: calcDim,
    drop: calcDrop,
    cushion: calcCushion,
    pallet: calcPallet,
    caliper: calcCaliper,
    shelf: calcShelfLife,
    gsm: calcGsm,
    co2: calcCO2,
    convert: calcConvert,
    bubble: calcBubble,
    ect: calcEctFromBct
  };

  // Bind buttons in calculators.html
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-calc]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-calc');
        const fn = window.PE.calculators[id];
        if (!fn) return;
        const out = btn.parentElement.querySelector('.result');
        if (!out) return;
        try {
          const r = fn();
          if (typeof r === 'string') { out.textContent = r; return; }
          out.innerHTML = Object.entries(r).map(
            ([k, v]) => `<div><span class="k">${k}:</span> <span class="v">${v}</span></div>`
          ).join('');
        } catch (e) {
          out.textContent = 'Error: ' + e.message;
        }
      });
    });
  });
})();
