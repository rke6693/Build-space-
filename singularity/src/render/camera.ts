import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { HeightField } from './heightfield';

export interface CameraPose {
  target: THREE.Vector3;
  distance: number;
  polar: number; // radians from vertical
  azimuth: number; // radians around y
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Orbital camera with smooth programmatic transitions and a scripted opening shot. The
 * camera never dips below the terrain, and can be shaken by the simulated ground motion.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private tween: { from: CameraPose; to: CameraPose; t0: number; dur: number; onDone?: () => void } | null = null;
  private intro: { curve: THREE.CatmullRomCurve3; look: THREE.CatmullRomCurve3; elapsed: number; dur: number; onDone: () => void } | null = null;
  shake = 0;
  external = false; // director drives the camera
  private shakeOffset = new THREE.Vector3();

  constructor(dom: HTMLElement, private hf: HeightField) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 2, 60000);
    this.camera.position.set(-2600, 1700, 3600);
    this.controls = new OrbitControls(this.camera, dom);
    this.controls.target.set(0, 20, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 9500;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.screenSpacePanning = false;
    this.controls.zoomSpeed = 1.1;
    this.controls.rotateSpeed = 0.55;
    this.controls.panSpeed = 0.9;
    this.controls.update();
  }

  getPose(): CameraPose {
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    return { target: this.controls.target.clone(), distance: s.radius, polar: s.phi, azimuth: s.theta };
  }

  applyPose(p: CameraPose) {
    const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(p.distance, p.polar, p.azimuth));
    this.controls.target.copy(p.target);
    this.camera.position.copy(p.target).add(off);
    this.camera.lookAt(p.target);
  }

  flyTo(to: Partial<CameraPose> & { target: THREE.Vector3 }, dur = 1.6, onDone?: () => void) {
    const from = this.getPose();
    const full: CameraPose = {
      target: to.target.clone(),
      distance: to.distance ?? from.distance,
      polar: to.polar ?? from.polar,
      azimuth: to.azimuth ?? from.azimuth,
    };
    // take the short way around
    let da = full.azimuth - from.azimuth;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    full.azimuth = from.azimuth + da;
    this.intro = null;
    this.tween = { from, to: full, t0: performance.now(), dur: dur * 1000, onDone };
  }

  /** Opening shot: low over the sea towards the skyline, then up to an orbital overview. */
  playIntro(onDone: () => void) {
    const pts = [
      new THREE.Vector3(2600, 45, 2900),
      new THREE.Vector3(1300, 70, 1500),
      new THREE.Vector3(250, 160, 1050),
      new THREE.Vector3(-900, 480, 1400),
      new THREE.Vector3(-2300, 1500, 2900),
    ];
    const look = [
      new THREE.Vector3(200, 120, 300),
      new THREE.Vector3(150, 140, 200),
      new THREE.Vector3(0, 110, -100),
      new THREE.Vector3(-100, 40, -300),
      new THREE.Vector3(0, 20, -250),
    ];
    this.tween = null;
    this.intro = { curve: new THREE.CatmullRomCurve3(pts), look: new THREE.CatmullRomCurve3(look), elapsed: 0, dur: 11000, onDone };
    this.controls.enabled = false;
  }

  skipIntro() {
    if (!this.intro) return;
    const done = this.intro.onDone;
    this.intro = null;
    this.controls.enabled = true;
    this.controls.target.set(0, 20, -250);
    this.camera.position.set(-2300, 1500, 2900);
    done();
  }

  get introPlaying(): boolean {
    return this.intro !== null;
  }

  update(dt: number) {
    const now = performance.now();
    this.camera.position.sub(this.shakeOffset);
    if (this.intro) {
      // advance by rendered frame time (capped) so a slow first frame or shader compile
      // cannot swallow the opening shot
      this.intro.elapsed += Math.min(dt, 1 / 8) * 1000;
      const t = Math.min(1, this.intro.elapsed / this.intro.dur);
      const e = ease(t);
      this.camera.position.copy(this.intro.curve.getPoint(e));
      const look = this.intro.look.getPoint(e);
      this.camera.lookAt(look);
      this.controls.target.copy(look);
      if (t >= 1) {
        const done = this.intro.onDone;
        this.intro = null;
        this.controls.enabled = true;
        done();
      }
    } else if (this.tween) {
      const t = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = ease(t);
      const a = this.tween.from;
      const b = this.tween.to;
      this.applyPose({
        target: a.target.clone().lerp(b.target, e),
        distance: a.distance + (b.distance - a.distance) * e,
        polar: a.polar + (b.polar - a.polar) * e,
        azimuth: a.azimuth + (b.azimuth - a.azimuth) * e,
      });
      if (t >= 1) {
        const done = this.tween.onDone;
        this.tween = null;
        done?.();
      }
    } else if (!this.external) {
      this.controls.update(dt);
    }
    // keep the target within the city region and the camera above ground
    const tg = this.controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -3200, 3200);
    tg.z = THREE.MathUtils.clamp(tg.z, -3200, 3600);
    const ground = this.hf.at(this.camera.position.x, this.camera.position.z);
    const minY = Math.max(ground, 0) + 12;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    // simulated ground motion shakes the camera (amplitude grows as the camera gets closer)
    if (this.shake > 0.005 && !this.intro) {
      const d = this.camera.position.distanceTo(tg);
      const amp = Math.min(6, this.shake * 40) * THREE.MathUtils.clamp(900 / d, 0.15, 1.5);
      this.shakeOffset.set((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp * 0.6, (Math.random() - 0.5) * amp);
    } else this.shakeOffset.set(0, 0, 0);
    this.camera.position.add(this.shakeOffset);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / Math.max(1, h);
    // portrait screens: widen the vertical field of view so the city still fits across
    this.camera.fov = THREE.MathUtils.clamp(45 / Math.sqrt(Math.min(1, this.camera.aspect)), 45, 68);
    this.camera.updateProjectionMatrix();
  }
}
