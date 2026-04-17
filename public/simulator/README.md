# Pallet Stability Simulator — ISTA 3E / CHEP

A standalone, browser-based, physics-accurate screening tool for packaging R&D
engineers. Runs rigid-body ISTA 3E transit tests (compression, random
vibration, rotational edge drops) on a CHEP GMA 48×40 block pallet loaded with
parameterized corrugated box stacks. Produces pass/fail verdicts, Monte
Carlo / DOE batches with Cp/Cpk, and Spearman-rank parameter sensitivity.

Open `/simulator/` in the app (Next.js statically serves this directory).

## Scope and limits (read this first)

**What it models**
- Rigid-body dynamics of stacked boxes on a CHEP pallet (Rapier3D WASM, 480 Hz)
- Stack shifting, toppling, load-lean angle, centre-of-gravity drift
- Stretch-wrap containment via a radial tension constraint on perimeter boxes
- ISTA 3E truck-OTR random-vibration PSD driven as kinematic base motion
- Rotational edge drops per ISTA 3E §4.5 (9″ for ≤500 lb, 6″ for >500 lb)
- Quasi-static top-load compression with configurable warehouse stack height
- Full Monte Carlo / DOE batch with Cp/Cpk and Spearman sensitivity tornado

**What it does NOT model** (cite this in reports, don't hide it from reviewers)
- Box crush. McKee BCT is reported as an *advisory* number only (`5.874 · ECT · √(t·Z)`) — not a simulated failure.
- Creep or stress-relaxation under sustained load. Accelerated-time runs do not preserve cumulative creep.
- Humidity / temperature effects on flute stiffness or friction.
- Fluid sloshing inside primary packages.
- Cyclic fatigue damage accumulation.
- Adhesive bond failure (tape, glue, hot-melt).
- Off-axis (lateral / longitudinal) vibration. Current profile is vertical only.

Use it as a pre-physical-test screening tool. Confirm all go/no-go decisions
with a physical ISTA 3E test before release.

## Quick start

1. `npm run dev` in the repo root (Next.js).
2. Open `http://localhost:3000/simulator/` in Chromium.
3. Adjust configuration in the left panel (box dimensions, pattern, wrap, seed).
4. **Run ISTA 3E Sequence** — runs settle → compression → vibration → 3 edge drops,
   produces pass/fail + metrics.
5. **Monte Carlo Batch…** — prompt for N trials; produces Cpk + tornado + histogram.
6. **Export Report** — CSV, JSON, printable HTML (Ctrl/Cmd-P → Save as PDF).

## Architecture

```
public/simulator/
  index.html              page shell, importmap (Three.js, Rapier, lit-html, uPlot)
  styles.css              professional light theme + print stylesheet
  src/
    main.js               App bootstrap, render loop, UI wiring
    physics/
      world.js            Rapier world, fixed-step loop (480 Hz), deterministic config
      pallet.js           CHEP GMA compound collider (7 + 5 deck boards, 9 blocks)
      box.js              Corrugated box rigid body
      stack-patterns.js   Column / interlock / pinwheel layout generators
      stretch-wrap.js     Perimeter radial tension + break criterion (LLDPE)
      contacts.js         Friction table + collision groups
    tests/
      vibration-psd.js    ISTA 3E PSD → time-domain accel → displacement pipeline
      edge-drop.js        Rotational edge-drop kinematics
      compression.js      Quasi-static top-load platen
      sequencer.js        Orchestrates the full ISTA 3E sequence
    analysis/
      metrics.js          Per-frame + aggregate metrics, thresholds, McKee advisory
      cpk.js              Cp / Cpk / Cpu / Cpl + empirical defect rate
      sensitivity.js      Spearman rank correlation + Latin Hypercube sampling
      rng.js              PCG32 + splitmix64 seeded RNG
    runner/
      monte-carlo.js      LHS DOE runner (main-thread sequential, yields to UI)
    ui/
      viewport.js         Three.js scene, OrbitControls, pallet+box meshes
      metrics-panel.js    Live metric updates + verdict + phase banner
      charts.js           uPlot histogram, Cpk table, tornado bars
      report.js           CSV / JSON / printable HTML export
    data/
      chep-gma.js         CHEP GMA B48 geometry (mirrors chep-gma.json)
      friction-table.js   Friction pairs (FBA + published tribology)
      ista3e-psd.js       ISTA 3E truck-OTR PSD breakpoints
```

## Key algorithms

### PSD → deterministic time series

`src/tests/vibration-psd.js`.

1. Log-log interpolate between ISTA 3E breakpoints (1 Hz .. 200 Hz).
2. Build a Hermitian spectrum: for each bin `k`, `|X[k]| = N · √(S(f_k)·df/2)`.
   Phases are uniform random from a PCG32 seeded RNG.
   (The factor of `N` is critical — without it, empirical Grms is √N too small.)
3. Inverse FFT (pure-JS radix-2, 120 LOC).
4. Double-integrate (trapezoid) to velocity then displacement.
5. Zero-phase 4th-order Butterworth high-pass at 0.5 Hz (filtfilt) to remove
   integration drift.

Unit test validates that empirical Grms of a 60 s synthesized series matches
the integrated PSD Grms within 10% (typical accuracy: <1%).

### Stretch-wrap constraint

`src/physics/stretch-wrap.js`.

Perimeter boxes (identified per layer via 24-bin angular convex-hull
approximation) receive a radial inward force each physics step:

```
F_radial = k_wrap · max(0, r − r₀) · n̂   +   F_pretension / N_perimeter
k_wrap   = E_film · A_film · turns / C₀
```

LLDPE properties used: E = 250 MPa, thickness 20 µm (~80 gauge), width 0.5 m,
σ_break = 25 MPa, ε_break = 1.5. Wrap is marked broken once either strain
or stress threshold is exceeded for any segment.

### Edge drop

Pallet body is temporarily set kinematic to script the lift (1 s smoothstep
ramp to `θ = asin(dropH/leverLength)` + 0.3 s hold). On release, the body
is switched back to dynamic and gravity closes the angle. Kinetic energy and
peak angular velocity are captured.

### Monte Carlo / DOE

`src/runner/monte-carlo.js`.

- Latin Hypercube over 6 default parameters: `boxMass` (normal, σ=3%),
  `muCC` (uniform ±0.1), `wrapTensionN` (triangular, mode = nominal),
  plus ±1% box dimensional tolerance.
- Sub-seeds derived per trial via `splitmix64(rootSeed ⊕ fnv1a("trial:N"))`
  so rerunning trial N reproduces bit-for-bit (within the same Chromium build).
- Each trial uses a shorter compression (6 s) and vibration (up to 60 s) for
  throughput; frequency content of the PSD is preserved but cumulative creep
  is not.
- Cp/Cpk are computed per metric using the USL from `THRESHOLDS` in `metrics.js`.
  Empirical defect rate is also reported (honest for small N).

## Metrics and thresholds

Thresholds are industry-informed heuristics, not ISTA-specified numbers — most
ISTA 3E criteria are visual/inspection ("no primary package damage"). These
are the engineering proxies this simulator can observe directly:

| Metric | Unit | USL |
|---|---|---|
| `maxBoxDisplacementXY_mm` | mm | 25 |
| `maxLayerShear_mm` | mm | 12 |
| `boxesToppled` | count | 0 (hard fail) |
| `loadLeanAngle_deg` | deg | 3 |
| `palletCOGShift_mm` | mm | 50 |
| `wrapBroken` | bool | 0 (hard fail) |
| `compressionDeflection_mm` | mm | 10 |
| `maxBoxAccel_g` | g | advisory |
| `maxContactImpulse_Ns` | N·s | advisory |
| `dropDamageProxy_J` | J | advisory |
| `bctAdvisory_lbf` (McKee) | lbf | advisory |

Edit `THRESHOLDS` in `src/analysis/metrics.js` to match your internal program.

## Determinism

- Fixed `dt = 1/480 s`. Never variable.
- `setCanSleep(false)` on all dynamic bodies (sleep thresholds are platform-dependent).
- All stochastic calls routed through `PCG32` + `splitmix64` sub-seeds.
- No `Math.random` or `performance.now` inside physics.
- Rapier 0.14 with the compat WASM build is bit-exact within the same Chromium
  minor version. Firefox / Safari reproduce correlations but may differ at the
  4th decimal. **Pin Chromium for production Cpk.**

## Engineering data sources

- **ISTA 3E** — *Similar Packaged-Products in Unitized Loads for Truckload Shipment*,
  2017 revision. §4.4 random vibration (PSD table), §4.5 rotational edge drop,
  §4.6 compression.
- **CHEP USA GMA B48** block pallet spec sheet (2023), public PDF.
- **McKee, R. C., Gander, J. W., & Wachuta, J. R.** "Compression Strength Formula
  for Corrugated Boxes." *Paperboard Packaging*, Vol. 48, No. 8, 1963.
- **Fibre Box Association (FBA)** — *Fibre Box Handbook* for friction pairs and
  flute caliper references.
- **FEFCO** ECT reference data for B, C, BC flute.
- **Rapier3D** — deterministic-simulation documentation (dimforge.com).

## Benchmark / sanity configurations

Use these to calibrate expectations when you first open the tool:

- **Known-stable**: interlock pattern, μ=0.55, box 300×250×220 mm, 8 kg,
  6 layers, wrap 4 turns at 120 N. Should pass all hard criteria by wide
  margin. Tornado is usually dominated by `muCC` and `wrapTensionN`.
- **Known-unstable**: column pattern, μ=0.25, same box and layers, **no wrap**
  (turns = 0). Should fail on `maxBoxDisplacementXY_mm` and often `boxesToppled`
  by the end of the vibration phase.
- **Edge-drop sensitivity**: bump load mass to 250 kg (`boxMass = 15 kg`,
  12-layer column stack). Drop height switches from 9″ to 6″ at the 500 lb
  boundary per ISTA 3E. You should see a step-change in `dropDamageProxy_J`.

## Testing

Vitest unit tests live in `tests/unit/simulator/`. Run with `npm test`.

- `vibration-psd.test.js` — PSD interpolator, Grms conservation, HP filter,
  determinism.
- `cpk.test.js` — Cp/Cpk definitions against small closed-form cases.
- `sensitivity.test.js` — Spearman correlation against known monotonic inputs.
- `stack-patterns.test.js` — column count matches hand-computed values.

## Extending

- **New vibration profiles** (ASTM D4169 DC1/DC2/DC3, ISTA 6-Amazon, …): add
  a new breakpoint module under `src/data/` and expose in the config panel.
- **Custom metric thresholds** per program: edit `THRESHOLDS` in
  `src/analysis/metrics.js`; the pass/fail and Cpk tables consume it directly.
- **Web Worker parallelism** for larger batches: refactor `runner/monte-carlo.js`
  to dispatch trials via a worker pool. Requires `COEP: require-corp` on the
  `/simulator/` route only (do not apply globally; it will break CDN Three.js).
