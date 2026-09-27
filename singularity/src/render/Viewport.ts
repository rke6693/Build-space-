import * as THREE from 'three';
import { GRID, HALF, N_CELLS, cellX, cellZ } from '../sim/config';
import type { City, Frame, SimEvent } from '../sim/types';
import type { SimClient } from '../worker/client';
import { AgentLayer } from './agents';
import { BuildingLayer, type BuildingTint } from './buildings';
import { CameraRig } from './camera';
import { type Caption, Director } from './director';
import { EffectsLayer } from './effects';
import { HeightField } from './heightfield';
import { InfraLayer } from './infra';
import { type GroundOverlay, cellSubstations, writeOverlay } from './overlays';
import { PostFX } from './post';
import { PropsLayer } from './props';
import { AdaptiveQuality, type QualityLevel, type QualitySettings, qualitySettings } from './quality';
import { RoadLayer } from './roads';
import { SkyLayer } from './sky';
import { TerrainLayer } from './terrain';
import { WaterLayer } from './water';

export interface Layers {
  population: boolean;
  flood: boolean;
  fire: boolean;
  damage: boolean;
  power: boolean;
  roads: boolean;
  weather: boolean;
  shaking: boolean;
  soil: boolean;
  labels: boolean;
}

export const DEFAULT_LAYERS: Layers = { population: true, flood: false, fire: false, damage: false, power: false, roads: false, weather: true, shaking: false, soil: false, labels: true };

export type Selection =
  | { kind: 'building'; id: number }
  | { kind: 'asset'; id: number }
  | { kind: 'bridge'; id: number }
  | { kind: 'levee'; id: number }
  | { kind: 'line'; id: number }
  | { kind: 'cell'; id: number; x: number; z: number };

export interface LabelInfo {
  key: string;
  text: string;
  kind: string;
  x: number;
  y: number;
  status: number; // 0 down, 1 degraded, 2 ok
  selection: Selection;
  important: boolean;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  quality: QualityLevel;
  autoQuality: boolean;
  particles: number;
  agentsVisible: number;
  pixelRatio: number;
}

export interface ViewportCallbacks {
  onSelect: (s: Selection | null) => void;
  onPlace: (x: number, z: number) => void;
  onHover: (text: string | null, x: number, y: number) => void;
  onLabels: (labels: LabelInfo[]) => void;
  onCaption: (c: Caption | null) => void;
  onIntroDone: () => void;
  getSpeed: () => number;
  setSpeed: (s: number) => void;
}

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly hf: HeightField;
  readonly rig: CameraRig;
  readonly director: Director;
  private terrain: TerrainLayer;
  private water: WaterLayer;
  private buildings: BuildingLayer;
  private roads: RoadLayer;
  private infra: InfraLayer;
  private props: PropsLayer;
  private agents: AgentLayer;
  private effects: EffectsLayer;
  private sky: SkyLayer;
  private post: PostFX | null = null;
  private quality: QualitySettings;
  private adaptive: AdaptiveQuality;
  private layers: Layers = { ...DEFAULT_LAYERS };
  private overlay: GroundOverlay = 'none';
  private lastFrameSeq = -1;
  private frame: Frame | null = null;
  private prevBState: Uint8Array | null = null;
  private raf = 0;
  private last = performance.now();
  private time = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private stats: RenderStats;
  private placement = false;
  private raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number; t: number } | null = null;
  private lastHover = 0;
  private labelTimer = 0;
  private labelDefs: { key: string; text: string; kind: string; pos: THREE.Vector3; selection: Selection; asset: number; bridge: number; levee: number; important: boolean }[] = [];
  private cellSub: Int16Array;
  private cellMaxDS = new Uint8Array(N_CELLS);
  private overlayDirty = true;
  private exposure = 1;
  private cinematic = false;
  private disposed = false;
  private placeMarker: THREE.Mesh;
  private selMarker: THREE.Mesh;
  private windVec = new THREE.Vector2();
  private envTimer = 0;
  private shakeGain = 1;

  constructor(private container: HTMLElement, readonly city: City, private client: SimClient, private cb: ViewportCallbacks, quality: QualityLevel = 'high') {
    this.hf = new HeightField(city.seed);
    const dpr = window.devicePixelRatio || 1;
    this.quality = qualitySettings(quality, dpr);
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'viewport-canvas';
    this.renderer.domElement.setAttribute('aria-label', '3D city viewport. Drag to orbit, right-drag to pan, scroll to zoom.');
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#0b1018');

    this.rig = new CameraRig(this.renderer.domElement, this.hf);
    this.director = new Director(this.rig, this.hf, { getSpeed: cb.getSpeed, setSpeed: cb.setSpeed, onCaption: cb.onCaption });
    this.sky = new SkyLayer(this.scene, this.quality.cloudLayers);
    this.terrain = new TerrainLayer(city, this.hf);
    this.water = new WaterLayer(city, this.hf);
    this.buildings = new BuildingLayer(city);
    this.roads = new RoadLayer(city, this.hf);
    this.infra = new InfraLayer(city, this.hf);
    this.props = new PropsLayer(city, this.hf, this.quality.treeScale);
    this.agents = new AgentLayer(this.hf, 5000, 64);
    this.effects = new EffectsLayer(city, this.hf, this.quality.particleScale, this.quality.fireLights);
    this.scene.add(this.terrain.group, this.water.group, this.buildings.group, this.roads.group, this.infra.group, this.props.group, this.agents.points, this.agents.crews, this.effects.group);
    this.sky.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.cellSub = cellSubstations(city);

    const pm = new THREE.RingGeometry(40, 52, 48);
    pm.rotateX(-Math.PI / 2);
    this.placeMarker = new THREE.Mesh(pm, new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.placeMarker.visible = false;
    this.placeMarker.renderOrder = 30;
    const sm = new THREE.RingGeometry(26, 31, 48);
    sm.rotateX(-Math.PI / 2);
    this.selMarker = new THREE.Mesh(sm, new THREE.MeshBasicMaterial({ color: '#5ad1e6', transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }));
    this.selMarker.visible = false;
    this.selMarker.renderOrder = 31;
    this.scene.add(this.placeMarker, this.selMarker);

    this.buildLabelDefs();
    if (this.quality.post) this.post = new PostFX(this.renderer, this.scene, this.rig.camera);
    this.adaptive = new AdaptiveQuality(quality, (l) => this.setQuality(l, true));
    this.stats = { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, quality, autoQuality: true, particles: 0, agentsVisible: 0, pixelRatio: this.quality.pixelRatio };

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerleave', () => cb.onHover(null, 0, 0));
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ public API
  playIntro() {
    this.rig.playIntro(() => this.cb.onIntroDone());
  }
  /** Ends the opening shot (or, when none is running, just signals that the scene is ready). */
  skipIntro() {
    if (this.rig.introPlaying) this.rig.skipIntro();
    else this.cb.onIntroDone();
  }
  get introPlaying() {
    return this.rig.introPlaying;
  }

  setLayers(l: Layers) {
    this.layers = { ...l };
    this.agents.points.visible = l.population;
    this.agents.crews.visible = l.population;
    this.water.uniforms.uFloodLayer.value = l.flood ? 1 : 0;
    this.roads.setStatusLayer(l.roads);
    this.infra.setPowerLayer(l.power);
    this.sky.setCloudsVisible(l.weather);
    this.effects.rain.visible = l.weather;
    const tint: BuildingTint = l.damage ? 'damage' : l.power ? 'power' : 'none';
    this.buildings.setTint(tint);
    this.overlay = l.shaking ? 'shaking' : l.fire ? 'fire' : l.soil ? 'soil' : l.damage ? 'damage' : l.power ? 'power' : 'none';
    this.overlayDirty = true;
  }

  get groundOverlay(): GroundOverlay {
    return this.layers.flood && this.overlay === 'none' ? 'flood' : this.overlay;
  }

  setQuality(level: QualityLevel, fromAuto = false) {
    if (!fromAuto) {
      this.adaptive.enabled = false;
      this.adaptive.level = level;
    }
    const dpr = window.devicePixelRatio || 1;
    this.quality = qualitySettings(level, dpr);
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.sky.sun.castShadow = this.quality.shadows;
    if (this.sky.sun.shadow.map) {
      this.sky.sun.shadow.map.dispose();
      this.sky.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sky.sun.shadow.mapSize.set(this.quality.shadowMapSize, this.quality.shadowMapSize);
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && 'needsUpdate' in m) m.needsUpdate = true;
    });
    if (this.quality.post && !this.post) this.post = new PostFX(this.renderer, this.scene, this.rig.camera);
    if (!this.quality.post && this.post) {
      this.post.dispose();
      this.post = null;
    }
    this.agents.maxDrawn = this.quality.maxAgents;
    this.stats.quality = level;
    this.stats.autoQuality = this.adaptive.enabled;
    this.onResize();
  }

  setAutoQuality(on: boolean) {
    this.adaptive.enabled = on;
    this.stats.autoQuality = on;
  }

  setCinematic(on: boolean) {
    this.cinematic = on;
    this.director.setActive(on);
  }

  setPlacement(on: boolean) {
    this.placement = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
    if (!on) this.placeMarker.visible = false;
  }

  showPlacement(x: number, z: number) {
    this.placeMarker.position.set(x, this.hf.at(x, z) + 3, z);
    this.placeMarker.visible = true;
  }

  hidePlacement() {
    this.placeMarker.visible = false;
  }

  select(s: Selection | null) {
    this.buildings.setSelected(s?.kind === 'building' ? s.id : -1);
    const p = s ? this.positionOf(s) : null;
    if (p) {
      this.selMarker.position.set(p.x, this.hf.at(p.x, p.z) + 2, p.z);
      this.selMarker.visible = true;
    } else this.selMarker.visible = false;
  }

  positionOf(s: Selection): { x: number; z: number; r: number } | null {
    const city = this.city;
    switch (s.kind) {
      case 'building':
        return { x: city.buildings.x[s.id], z: city.buildings.z[s.id], r: Math.max(180, city.buildings.h[s.id] * 3) };
      case 'asset':
        return { x: city.assets[s.id].x, z: city.assets[s.id].z, r: 420 };
      case 'bridge':
        return { x: city.bridges[s.id].x, z: city.bridges[s.id].z, r: 500 };
      case 'levee':
        return { x: city.levees[s.id].x, z: city.levees[s.id].z, r: 700 };
      case 'line': {
        const l = city.lines[s.id];
        return { x: (l.points[0] + l.points[l.points.length - 2]) / 2, z: (l.points[1] + l.points[l.points.length - 1]) / 2, r: 1200 };
      }
      case 'cell':
        return { x: s.x, z: s.z, r: 400 };
    }
  }

  focus(x: number, z: number, radius = 600) {
    if (this.cinematic) return;
    this.rig.flyTo({ target: new THREE.Vector3(x, this.hf.at(x, z) + 10, z), distance: Math.max(160, radius * 2.2), polar: 0.95 }, 1.5);
  }

  focusEvent(ev: SimEvent) {
    this.focus(ev.x, ev.z, ev.radius ?? 600);
  }

  overview() {
    this.rig.flyTo({ target: new THREE.Vector3(0, 20, -250), distance: 4600, polar: 0.95, azimuth: -0.65 }, 1.8);
  }

  topDown() {
    this.rig.flyTo({ target: new THREE.Vector3(0, 0, 0), distance: 5200, polar: 0.02 }, 1.6);
  }

  onEvents(evs: SimEvent[]) {
    this.director.onEvents(evs);
  }

  getStats(): RenderStats {
    return this.stats;
  }

  heightAt(x: number, z: number): number {
    return this.hf.at(x, z);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.rig.controls.dispose();
    this.post?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ internals
  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.rig.resize(w, h);
    this.post?.setSize(w, h, this.quality.pixelRatio);
  };

  private buildLabelDefs() {
    const city = this.city;
    const imp = new Set(['hospital', 'plant', 'water', 'hub', 'pump', 'sub', 'tx', 'shelter', 'fire']);
    for (const a of city.assets) {
      if (!imp.has(a.kind)) continue;
      const y = this.hf.at(a.x, a.z) + (a.building >= 0 ? city.buildings.h[a.building] + 30 : a.kind === 'plant' ? 100 : 40);
      const short = a.name.replace(' Substation', ' Sub').replace('Eastport Pump Station', 'Pump').replace(' 230 kV', '').replace(' — ', ' · ');
      this.labelDefs.push({ key: `a${a.id}`, text: short, kind: a.kind, pos: new THREE.Vector3(a.x, y, a.z), selection: { kind: 'asset', id: a.id }, asset: a.id, bridge: -1, levee: -1, important: a.kind === 'hospital' || a.kind === 'plant' || a.kind === 'pump' });
    }
    for (const b of city.bridges) {
      this.labelDefs.push({ key: `b${b.id}`, text: b.name, kind: 'bridge', pos: new THREE.Vector3(b.x, b.deckY + 30, b.z), selection: { kind: 'bridge', id: b.id }, asset: -1, bridge: b.id, levee: -1, important: true });
    }
    for (const l of city.levees) {
      this.labelDefs.push({ key: `l${l.id}`, text: l.name, kind: 'levee', pos: new THREE.Vector3(l.x, 20, l.z), selection: { kind: 'levee', id: l.id }, asset: -1, bridge: -1, levee: l.id, important: false });
    }
  }

  private emitLabels() {
    if (!this.layers.labels || this.rig.introPlaying) {
      this.cb.onLabels([]);
      return;
    }
    const cam = this.rig.camera;
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    const v = new THREE.Vector3();
    const out: LabelInfo[] = [];
    const f = this.frame;
    const dist = cam.position.distanceTo(this.rig.controls.target);
    for (const d of this.labelDefs) {
      v.copy(d.pos).project(cam);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
      const camD = cam.position.distanceTo(d.pos);
      if (!d.important && camD > 3600) continue;
      if (camD > 7500) continue;
      let status = 2;
      if (f) {
        if (d.asset >= 0) status = f.assets[d.asset]?.status ?? 2;
        else if (d.bridge >= 0) status = f.bridges[d.bridge] >= 3 ? 0 : f.bridges[d.bridge] === 2 ? 1 : 2;
        else if (d.levee >= 0) status = f.levees[d.levee] === 2 ? 0 : f.levees[d.levee] === 1 ? 1 : 2;
      }
      out.push({ key: d.key, text: d.text, kind: d.kind, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, status, selection: d.selection, important: d.important || status < 2 || dist < 1500 });
    }
    this.cb.onLabels(out);
  }

  private ndc(e: PointerEvent): THREE.Vector2 {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (this.rig.introPlaying) this.rig.skipIntro();
  };

  private onPointerUp = (e: PointerEvent) => {
    const d = this.pointerDown;
    this.pointerDown = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.button !== 0) return;
    const hit = this.pick(this.ndc(e), true);
    if (this.placement) {
      if (hit?.point) {
        this.showPlacement(hit.point.x, hit.point.z);
        this.cb.onPlace(hit.point.x, hit.point.z);
      }
      return;
    }
    this.cb.onSelect(hit?.selection ?? null);
  };

  private onPointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - this.lastHover < 90 || this.pointerDown) return;
    this.lastHover = now;
    if (this.placement) {
      const hit = this.pick(this.ndc(e), false, true);
      if (hit?.point) this.showPlacement(hit.point.x, hit.point.z);
      this.cb.onHover(hit?.point ? `x ${hit.point.x.toFixed(0)} m, z ${hit.point.z.toFixed(0)} m — click to place` : null, e.clientX, e.clientY);
      return;
    }
    const hit = this.pick(this.ndc(e), false);
    this.cb.onHover(hit ? hit.label : null, e.clientX, e.clientY);
  };

  private pick(ndc: THREE.Vector2, includeTerrain: boolean, terrainOnly = false): { selection: Selection; point: THREE.Vector3; label: string } | null {
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const city = this.city;
    const cands: THREE.Object3D[] = terrainOnly ? [] : [...this.buildings.pickables(), ...this.infra.pickMeshes, ...this.roads.pickables()];
    if (includeTerrain || terrainOnly) cands.push(this.terrain.mesh);
    const hits = this.raycaster.intersectObjects(cands, false);
    for (const h of hits) {
      const ud = h.object.userData as { kind?: string; asset?: number; bridge?: number };
      if (h.object === this.terrain.mesh) {
        const c = cellOf(h.point.x, h.point.z);
        return { selection: { kind: 'cell', id: c, x: h.point.x, z: h.point.z }, point: h.point, label: 'Ground' };
      }
      if (ud.kind === 'buildings' || ud.kind === 'roofs') {
        const b = this.buildings.buildingFromHit(h.object, h.instanceId ?? -1);
        if (b < 0) continue;
        const asset = city.buildings.asset[b];
        if (asset >= 0) return { selection: { kind: 'asset', id: asset }, point: h.point, label: city.assets[asset].name };
        return { selection: { kind: 'building', id: b }, point: h.point, label: `Building #${b}` };
      }
      if (ud.kind === 'asset' && ud.asset !== undefined) return { selection: { kind: 'asset', id: ud.asset }, point: h.point, label: city.assets[ud.asset].name };
      if (ud.kind === 'bridge' && ud.bridge !== undefined) return { selection: { kind: 'bridge', id: ud.bridge }, point: h.point, label: city.bridges[ud.bridge].name };
      if (ud.kind === 'levee') {
        const c = this.infra.leveeCell(h.instanceId ?? -1);
        const seg = c >= 0 ? city.leveeSegment[c] : -1;
        if (seg >= 0) return { selection: { kind: 'levee', id: seg }, point: h.point, label: city.levees[seg].name };
      }
    }
    return null;
  }

  private applyFrame(f: Frame) {
    const prev = this.prevBState;
    const b = this.city.buildings;
    // dust where buildings just collapsed
    if (prev && prev.length === f.bState.length) {
      let spawned = 0;
      for (let k = 0; k < b.count && spawned < 40; k++) {
        if ((f.bState[k] & 7) >= 4 && (prev[k] & 7) < 4) {
          this.effects.spawnDust(b.x[k], b.baseY[k], b.z[k], this.time, b.h[k] > 40 ? 40 : 18);
          spawned++;
        }
      }
    }
    this.prevBState = f.bState.slice();
    this.buildings.applyFrame(f, (a) => f.assets[a]?.energized ?? 1);
    this.water.update(f.water, f.levee, f.settlement);
    this.water.setSeaLevel(f.eff.seaSurface);
    this.terrain.updateGround(f.settlement, f.shaking);
    this.roads.applyFrame(f);
    this.infra.applyFrame(f, this.sky.state.night, this.time);
    this.agents.applyFrame(f);
    this.effects.applyFrame(f, this.time);
    this.sky.setCloudField(f.clouds);
    this.props.update(null, f.burn, this.rig.camera, 3800);
    // cell max damage for the damage overlay
    this.cellMaxDS.fill(0);
    for (let k = 0; k < b.count; k++) {
      const ds = f.bState[k] & 7;
      if (ds > this.cellMaxDS[b.cell[k]]) this.cellMaxDS[b.cell[k]] = ds;
    }
    this.overlayDirty = true;
    // camera shake from the ground motion at the camera target
    const t = this.rig.controls.target;
    this.rig.shake = f.shaking[cellOf(t.x, t.z)] * this.shakeGain;
    const anyShake = f.quakes.length > 0;
    this.buildings.uniforms.uShakeGain.value = anyShake ? 1 : 0;
    this.terrain.uniforms.uShakeGain.value = anyShake ? 1.6 : 0;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dtMs = Math.min(100, now - this.last);
    const dt = dtMs / 1000;
    this.last = now;
    this.time += dt;

    // new simulation frame?
    if (this.client.frameSeq !== this.lastFrameSeq && this.client.frame) {
      this.lastFrameSeq = this.client.frameSeq;
      this.frame = this.client.frame;
      this.applyFrame(this.frame);
    }
    const f = this.frame;

    this.director.update(now);
    this.rig.update(dt);
    // dynamic near plane keeps depth precision high at city scale
    const cam = this.rig.camera;
    const dTarget = cam.position.distanceTo(this.rig.controls.target);
    const near = THREE.MathUtils.clamp(dTarget * 0.015, 1.5, 120);
    if (Math.abs(near - cam.near) > 0.5) {
      cam.near = near;
      cam.updateProjectionMatrix();
    }

    if (f) {
      this.windVec.set(f.eff.windX, f.eff.windZ);
      this.sky.update(f.eff, dt, cam, this.effects.flash);
    }
    const sky = this.sky.state;
    // shared uniforms
    this.water.uniforms.uTime.value = this.time;
    this.water.uniforms.uSunDir.value.copy(sky.sunDir);
    this.water.uniforms.uSunColor.value.copy(sky.sunColor);
    this.water.uniforms.uSky.value.copy(sky.skyColor);
    this.water.uniforms.uHorizon.value.copy(sky.horizon);
    this.water.uniforms.uAmbient.value.copy(sky.ambient);
    this.water.uniforms.uWind.value.copy(this.windVec);
    this.water.uniforms.uFlash.value = this.effects.flash;
    this.buildings.uniforms.uTime.value = this.time;
    this.buildings.uniforms.uNight.value = Math.min(1, sky.night * 1.1 + (f ? f.eff.stormIntensity * 0.25 : 0));
    this.terrain.uniforms.uTime.value = this.time;
    const wet = f ? Math.min(1, f.eff.rainfall / 25) : 0;
    this.terrain.uniforms.uWet.value = wet;
    this.roads.uniforms.uWet.value = wet;
    this.roads.uniforms.uNight.value = sky.night;
    if (f) this.roads.updateLights(sky.night, (s) => (f.assets[s]?.energized ?? 1) === 1);
    const pixelScale = this.renderer.getPixelRatio() * (this.renderer.domElement.clientHeight / 900);
    this.agents.animate(dt, this.time, pixelScale);
    this.effects.animate(this.time, dt, cam, this.windVec, pixelScale);
    this.effects.setSmokeLight(new THREE.Color().copy(sky.ambient).multiplyScalar(1.6).add(sky.sunColor.clone().multiplyScalar(0.35)));
    this.infra.animate(this.time, this.windVec);
    this.props.update(null, null, cam, 3800);

    if (this.overlayDirty && f) {
      const on = writeOverlay(this.overlay, this.terrain.overlayData, f, this.city, this.cellSub, this.cellMaxDS);
      this.terrain.setOverlay(on);
      this.terrain.markOverlayDirty();
      this.overlayDirty = false;
    }

    // dynamic exposure: brighter at night / under storm cloud, eased; flashes bloom
    const target = (0.92 + sky.night * 0.75 + (f ? f.eff.stormIntensity * 0.25 : 0)) * (this.cinematic ? 0.94 : 1);
    this.exposure += (target - this.exposure) * Math.min(1, dt * (this.cinematic ? 0.8 : 2.5));
    this.renderer.toneMappingExposure = this.exposure + this.effects.flash * 0.6;
    if (this.post) {
      this.post.bloom.strength = 0.35 + sky.night * 0.3 + this.effects.flash * 0.6;
      const g = this.post.grade.uniforms;
      g.uVignette.value = this.cinematic ? 0.62 : 0.32;
      g.uSaturation.value = this.cinematic ? 0.92 : 1.04;
      g.uContrast.value = this.cinematic ? 1.1 : 1.03;
      g.uTint.value.setRGB(this.cinematic ? 1.02 : 1, 1, this.cinematic ? 1.04 : 1);
    }

    // IBL refresh on wall-clock time (frame dt is clamped, so slow devices would lag behind)
    if (now >= this.envTimer) {
      if (this.sky.updateEnvironment(this.renderer, this.quality.envMap)) this.envTimer = now + 2500;
    }

    if (this.post) this.post.render(dt);
    else this.renderer.render(this.scene, cam);

    // stats & labels
    this.fpsAcc += dtMs;
    this.fpsN++;
    if (this.fpsAcc > 500) {
      const info = this.renderer.info;
      this.stats.fps = (this.fpsN * 1000) / this.fpsAcc;
      this.stats.frameMs = this.fpsAcc / this.fpsN;
      this.stats.drawCalls = info.render.calls;
      this.stats.triangles = info.render.triangles;
      this.stats.geometries = info.memory.geometries;
      this.stats.textures = info.memory.textures;
      this.stats.pixelRatio = this.renderer.getPixelRatio();
      this.stats.agentsVisible = f ? Math.min(f.agentsState.length, this.agents.maxDrawn) : 0;
      this.stats.particles = f ? f.burn.reduce((a, v) => a + (v > 0.03 ? 1 : 0), 0) : 0;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (!this.rig.introPlaying) this.adaptive.frame(dtMs, now);
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.emitLabels();
      this.labelTimer = 0.1;
    }
  };
}

export function cellOf(x: number, z: number): number {
  const i = Math.min(GRID - 1, Math.max(0, Math.floor((x + HALF) / 32)));
  const j = Math.min(GRID - 1, Math.max(0, Math.floor((z + HALF) / 32)));
  return j * GRID + i;
}

export { cellX, cellZ };
