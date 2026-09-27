import { CELL, GRID, PEOPLE_PER_AGENT, STEP_SECONDS, TICKS_PER_SECOND_1X } from '../sim/config';
import { ECONOMIC_DISCLAIMER } from '../sim/export';
import { IconClose } from './icons';
import { store, useUI } from './store';

/** Plain-language disclosure of every model approximation. */
export function ModelNotes() {
  const open = useUI((s) => s.showNotes);
  if (!open) return null;
  const close = () => store.set({ showNotes: false });
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="notes-title" onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal">
        <div className="modal-head">
          <h2 id="notes-title">How the simulation works — and what it simplifies</h2>
          <button className="icon-btn" aria-label="Close" onClick={close} autoFocus>
            <IconClose />
          </button>
        </div>
        <div className="modal-body notes">
          <p>
            Singularity is an explanatory model, not an engineering or emergency-planning tool. Every quantity shown is computed by the models below; nothing is scripted. Numbers are plausible in magnitude but uncalibrated for any real city.
          </p>
          <h3>Time, grid and determinism</h3>
          <ul>
            <li>Fixed timestep of {STEP_SECONDS} simulated seconds; 1× playback = {TICKS_PER_SECOND_1X} steps per real second ({(STEP_SECONDS * TICKS_PER_SECOND_1X) / 60} simulated minute per second). The simulation runs in a Web Worker, decoupled from rendering.</li>
            <li>Hazard fields live on a {GRID} × {GRID} grid of {CELL} m cells (4.1 km square). Everything smaller than a cell is averaged.</li>
            <li>All randomness comes from seeded generators stored in the state, or from stateless hashes of seed + ids. Same seed + same timestamped commands ⇒ bit-identical state on the same browser engine. Across different browsers, transcendental functions may differ in the last bits.</li>
            <li>Replay restores the nearest full-state keyframe and re-runs the simulation; stored checksums are compared at each keyframe crossed ("verified"). Issuing a command in the past starts a new branch and discards the recorded future.</li>
          </ul>
          <h3>Earthquakes</h3>
          <ul>
            <li>Peak ground acceleration from a simplified attenuation law with near-source saturation, amplified by soft/saturated soils; shaking arrives at the S-wave speed (3.5 km/s) with a magnitude-dependent duration envelope.</li>
            <li>Building damage uses HAZUS-style lognormal fragility curves by structural class (illustrative medians); PGA is a crude predictor for tall buildings. Prior damage weakens buildings for aftershocks.</li>
            <li>Liquefaction settlement is an empirical function of peak PGA, soil susceptibility and saturation; embankments slump more than open ground.</li>
            <li>Aftershocks follow Omori–Utsu decay and Gutenberg–Richter magnitudes (Reasenberg–Jones generic parameters). Visual ground and building sway are exaggerated for visibility but driven by the simulated acceleration field.</li>
          </ul>
          <h3>Floods</h3>
          <ul>
            <li>Local-inertial shallow-water approximation (Bates et al. 2010) with Manning friction and a positivity limiter: mass-conservative apart from explicit sources and sinks, but no advection or turbulence.</li>
            <li>Rain (modulated by a moving cloud field), infiltration, street drains, polder pumps (need power), river inflow, tide + surge as a fixed sea level, levee overtopping erosion and breaches. Hills are depression-filled so rain drains realistically.</li>
          </ul>
          <h3>Fire</h3>
          <ul>
            <li>Cellular fire: burning cells radiate heat to neighbours with a downwind bias; cells ignite past a moisture- and temperature-dependent threshold; firebrands spot fires downwind in strong wind. Rain, floodwater and crews suppress fires; crews need open roads, and hydrants need the water works to be powered.</li>
          </ul>
          <h3>Weather</h3>
          <ul>
            <li>Storms are trapezoidal intensity profiles adding rain, wind (replacing ambient wind), surge and lightning. Lightning locations are sampled under dense cloud and snap to tall structures. Wind damage uses lognormal gust fragilities per structural class and for lines and towers.</li>
          </ul>
          <h3>Infrastructure and cascades</h3>
          <ul>
            <li>Power flow is graph reachability from live generation over intact lines (no load flow or voltage). Consumers fall back to generators/batteries with finite autonomy. Telecom towers need the exchange; hospitals need power and water; pumps need power.</li>
            <li>Every status change is logged as an event citing the events that caused it, which is how the causal chains are built.</li>
          </ul>
          <h3>Population</h3>
          <ul>
            <li>Each agent represents {PEOPLE_PER_AGENT} residents. Agents commute on the road graph (zone routing tables + greedy final approach), slow down on congested edges, evacuate on orders (instant with mobile coverage, word of mouth otherwise) or when a hazard reaches them, and seek shelters or hospitals. Injuries are simulated counts from exposure and building damage; the model does not simulate fatalities.</li>
          </ul>
          <h3>Economics</h3>
          <p>{ECONOMIC_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
