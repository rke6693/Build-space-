import * as THREE from 'three';
import { STEP_SECONDS } from '../sim/config';
import type { SimEvent } from '../sim/types';
import type { CameraPose, CameraRig } from './camera';
import type { HeightField } from './heightfield';

type ShotKind = 'establish' | 'aerial' | 'event' | 'flyby' | 'street';

interface Shot {
  kind: ShotKind;
  target: THREE.Vector3;
  distance: number;
  polar: number;
  azimuth: number;
  azRate: number; // rad/s orbit
  push: number; // fractional dolly-in over the shot
  duration: number; // s
  score: number;
  event?: SimEvent;
}

export interface Caption {
  title: string;
  detail: string;
  tick: number;
  category: string;
}

export interface DirectorHost {
  getSpeed(): number;
  setSpeed(s: number): void;
  onCaption(c: Caption | null): void;
}

const TYPE_BONUS: Partial<Record<SimEvent['type'], number>> = {
  earthquake: 34,
  bridge_collapse: 28,
  levee_breach: 28,
  levee_overtop: 20,
  hospital_isolated: 22,
  fire_major: 20,
  flood_zone: 18,
  pump_failure: 17,
  backup_exhausted: 15,
  building_collapse: 16,
  comm_outage: 12,
  water_outage: 12,
  power_loss: 9,
  substation_damage: 12,
  storm: 14,
  casualties: 10,
  evac_order: 8,
  line_failure: 6,
};
const DILATE = new Set<SimEvent['type']>(['earthquake', 'bridge_collapse', 'levee_breach', 'fire_major']);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Cinematic director: scores incoming simulation events, frames the most significant ones
 * with eased camera moves (orbit + dolly), slows simulated time for pivotal moments and
 * falls back to establishing / aerial / fly-by shots when nothing is happening.
 */
export class Director {
  active = false;
  private queue: { ev: SimEvent; score: number }[] = [];
  private shot: Shot | null = null;
  private t0 = 0;
  private from: CameraPose | null = null;
  private idleIdx = 0;
  private dilateUntil = 0;
  private savedSpeed: number | null = null;
  private recent = new Set<number>();

  constructor(private rig: CameraRig, private hf: HeightField, private host: DirectorHost) {}

  setActive(on: boolean) {
    this.active = on;
    this.rig.external = on;
    if (!on) {
      this.shot = null;
      this.host.onCaption(null);
      this.restoreSpeed();
      // hand the current view back to the orbit controls
      const p = this.rig.getPose();
      this.rig.controls.target.copy(p.target);
    } else {
      this.shot = null;
      this.queue = [];
    }
  }

  onEvents(evs: SimEvent[]) {
    for (const ev of evs) {
      if (ev.severity < 2 || ev.type === 'lightning') continue;
      const score = ev.severity * 10 + (TYPE_BONUS[ev.type] ?? 0);
      this.queue.push({ ev, score });
    }
    // keep the most recent, highest-scoring candidates
    this.queue.sort((a, b) => b.score - a.score || b.ev.id - a.ev.id);
    if (this.queue.length > 12) this.queue.length = 12;
  }

  private nextShot(now: number): Shot {
    const cand = this.queue.shift();
    if (cand) {
      const ev = cand.ev;
      this.recent.add(ev.id);
      const quake = ev.type === 'earthquake' || ev.type === 'aftershock';
      // epicentres are often offshore: frame the city side of the rupture, not open sea
      const ex = quake ? THREE.MathUtils.clamp(ev.x, -1300, 1300) : ev.x;
      const ez = quake ? THREE.MathUtils.clamp(ev.z, -1300, 1300) : ev.z;
      const r = quake ? 3400 : Math.min(4500, Math.max(260, (ev.radius ?? 700) * 2.1));
      const target = new THREE.Vector3(ex, this.hf.at(ex, ez) + Math.min(80, r * 0.04), ez);
      const az = ((ev.id * 2.399963) % (Math.PI * 2)) - Math.PI;
      const shot: Shot = {
        kind: 'event',
        target,
        distance: r,
        polar: quake ? 0.95 : 1.05 + ((ev.id * 0.37) % 0.2),
        azimuth: az,
        azRate: 0.035 * (ev.id % 2 ? 1 : -1),
        push: 0.22,
        duration: 9,
        score: cand.score,
        event: ev,
      };
      if (DILATE.has(ev.type)) this.dilate(now, ev.type === 'earthquake' ? 9000 : 6000);
      this.host.onCaption({ title: ev.title, detail: ev.detail, tick: ev.tick, category: ev.category });
      return shot;
    }
    this.host.onCaption(null);
    const kinds: ShotKind[] = ['establish', 'flyby', 'aerial', 'establish', 'street'];
    const kind = kinds[this.idleIdx++ % kinds.length];
    switch (kind) {
      case 'aerial':
        return { kind, target: new THREE.Vector3(200, 0, -150), distance: 3600, polar: 0.28, azimuth: this.idleIdx * 0.7, azRate: 0.02, push: 0.1, duration: 14, score: 0 };
      case 'flyby':
        return { kind, target: new THREE.Vector3(250, 60, 350), distance: 900, polar: 1.3, azimuth: -0.4, azRate: 0.05, push: 0.25, duration: 14, score: 0 };
      case 'street':
        return { kind, target: new THREE.Vector3(120, 90, 120), distance: 420, polar: 1.36, azimuth: 2.2, azRate: -0.045, push: 0.15, duration: 12, score: 0 };
      default:
        return { kind: 'establish', target: new THREE.Vector3(0, 20, -250), distance: 4200, polar: 1.05, azimuth: -0.6 + this.idleIdx * 0.5, azRate: 0.025, push: 0.12, duration: 16, score: 0 };
    }
  }

  private dilate(now: number, ms: number) {
    if (this.savedSpeed === null) this.savedSpeed = this.host.getSpeed();
    this.host.setSpeed(0.25);
    this.dilateUntil = now + ms;
  }

  private restoreSpeed() {
    if (this.savedSpeed !== null) {
      if (this.host.getSpeed() === 0.25) this.host.setSpeed(this.savedSpeed);
      this.savedSpeed = null;
    }
  }

  update(now: number) {
    if (!this.active) return;
    if (this.dilateUntil && now > this.dilateUntil) {
      this.dilateUntil = 0;
      this.restoreSpeed();
    }
    const elapsed = this.shot ? (now - this.t0) / 1000 : Infinity;
    const best = this.queue[0];
    const interrupt = best && this.shot && elapsed > 3.5 && best.score > this.shot.score + 12;
    if (!this.shot || elapsed > this.shot.duration || interrupt) {
      this.from = this.rig.getPose();
      this.shot = this.nextShot(now);
      this.t0 = now;
    }
    const s = this.shot;
    const t = (now - this.t0) / 1000;
    const u = Math.min(1, t / s.duration);
    const pose: CameraPose = {
      target: s.target.clone(),
      distance: s.distance * (1 - s.push * u),
      polar: s.polar,
      azimuth: s.azimuth + s.azRate * t,
    };
    const blend = this.from ? ease(Math.min(1, t / 2.6)) : 1;
    if (this.from && blend < 1) {
      let da = pose.azimuth - this.from.azimuth;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.rig.applyPose({
        target: this.from.target.clone().lerp(pose.target, blend),
        distance: this.from.distance + (pose.distance - this.from.distance) * blend,
        polar: this.from.polar + (pose.polar - this.from.polar) * blend,
        azimuth: this.from.azimuth + da * blend,
      });
    } else this.rig.applyPose(pose);
  }

  static captionTime(tick: number): string {
    const t = tick * STEP_SECONDS;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = Math.floor(t % 60);
    return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
}
