import * as THREE from 'three';
import { GRID, HALF, N_CELLS, cellX, cellZ } from '../sim/config';
import { VS } from '../sim/systems/earthquake';
import type { City, Frame, Strike } from '../sim/types';
import type { HeightField } from './heightfield';

const FIRE_VERT = /* glsl */ `
attribute float aSeed;
attribute float aInt;
uniform float uTime;
uniform vec2 uWind;
uniform float uScale;
varying float vLife;
varying float vInt;
void main() {
  float life = fract(uTime * (0.5 + aSeed * 0.6) + aSeed * 7.13);
  vLife = life;
  vInt = aInt;
  float rise = life * (10.0 + 30.0 * aInt);
  vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * life * 1.5 + vec3(sin(aSeed * 40.0 + uTime * 3.0) * 2.5, rise, cos(aSeed * 33.0 + uTime * 2.1) * 2.5);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (1.0 - life * 0.7) * (8.0 + 20.0 * aInt);
  gl_PointSize = aInt > 0.0 ? clamp(size * uScale / -mv.z, 1.0, 90.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FRAG = /* glsl */ `
varying float vLife;
varying float vInt;
void main() {
  if (vInt <= 0.0) discard;
  // tapered tongue: wide at the base, narrow tip (gl_PointCoord.y grows downwards)
  vec2 p = gl_PointCoord - 0.5;
  float up = 0.5 - p.y;               // 0 at bottom, 1 at top
  float halfW = mix(0.36, 0.05, up) * (1.0 - vLife * 0.4);
  float m = smoothstep(halfW, halfW * 0.25, abs(p.x)) * smoothstep(1.0, 0.7, up) * smoothstep(0.0, 0.12, up);
  if (m < 0.01) discard;
  float heat = (1.0 - vLife) * (1.0 - up * 0.6);
  vec3 c = mix(vec3(0.55, 0.07, 0.01), vec3(1.0, 0.36, 0.05), smoothstep(0.1, 0.5, heat));
  c = mix(c, vec3(1.25, 0.9, 0.45), smoothstep(0.6, 0.95, heat) * smoothstep(0.1, 0.0, abs(p.x)));
  float a = m * (1.0 - vLife * 0.8) * min(1.0, vInt * 1.4);
  gl_FragColor = vec4(c * 2.2, clamp(a * 1.2, 0.0, 1.0));
}`;
const SMOKE_VERT = /* glsl */ `
attribute float aSeed;
attribute float aInt;
uniform float uTime;
uniform vec2 uWind;
uniform float uScale;
varying float vLife;
varying float vInt;
void main() {
  float life = fract(uTime * (0.035 + aSeed * 0.03) + aSeed * 3.7);
  vLife = life;
  vInt = aInt;
  vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * life * 55.0 + vec3(sin(aSeed * 21.0) * 30.0 * life, life * (80.0 + 160.0 * aInt), cos(aSeed * 17.0) * 30.0 * life);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (40.0 + 180.0 * life) * (0.6 + aInt);
  gl_PointSize = aInt > 0.0 ? clamp(size * uScale / -mv.z, 1.0, 240.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FRAG = /* glsl */ `
uniform vec3 uLight;
varying float vLife;
varying float vInt;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5 || vInt <= 0.0) discard;
  float soft = smoothstep(0.5, 0.0, d);
  float a = soft * soft * sin(vLife * 3.14159) * min(0.62, vInt * 0.75);
  // young smoke is lit from below by the flames; older smoke is a grey-brown pall
  vec3 col = uLight * mix(vec3(0.3, 0.28, 0.26), vec3(0.2, 0.19, 0.18), vLife) + vec3(0.5, 0.18, 0.04) * pow(1.0 - vLife, 6.0) * vInt;
  gl_FragColor = vec4(col, a);
}`;
const RAIN_VERT = /* glsl */ `
attribute vec3 aSeed;
attribute float aEnd;
uniform vec3 uCam;
uniform float uTime;
uniform vec2 uWind;
uniform float uBox;
varying float vA;
void main() {
  float H = 420.0;
  float y = mod(aSeed.y * H - uTime * 26.0 * (0.8 + aSeed.z * 0.4), H) + uCam.y - H * 0.55;
  vec3 p = vec3(uCam.x + (aSeed.x - 0.5) * uBox, y, uCam.z + (aSeed.z - 0.5) * uBox);
  vec3 dir = normalize(vec3(uWind.x * 0.12, -1.0, uWind.y * 0.12));
  p += dir * aEnd * 5.0;
  vA = 1.0 - aEnd * 0.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() { gl_FragColor = vec4(uColor, uOpacity * vA); }`;
const DUST_VERT = /* glsl */ `
attribute float aSeed;
attribute float aStart;
uniform float uTime;
uniform float uScale;
varying float vLife;
void main() {
  float age = uTime - aStart;
  vLife = clamp(age / 9.0, 0.0, 1.0);
  vec3 dir = normalize(vec3(sin(aSeed * 91.0), 0.25 + fract(aSeed * 13.0), cos(aSeed * 77.0)));
  vec3 p = position + dir * (1.0 - exp(-age * 0.7)) * 45.0 + vec3(0.0, age * 3.0, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = age < 0.0 || age > 9.0 ? 0.0 : clamp((30.0 + age * 18.0) * uScale / -mv.z, 1.0, 200.0);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */ `
uniform vec3 uLight;
varying float vLife;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * (1.0 - vLife) * 0.55;
  gl_FragColor = vec4(uLight * vec3(0.62, 0.56, 0.48), a);
}`;

function points(n: number, vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending, extra: Record<string, number> = { aSeed: 1, aInt: 1 }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  for (const [k, size] of Object.entries(extra)) {
    const arr = new Float32Array(n * size);
    if (k === 'aSeed') for (let i = 0; i < n; i++) arr[i] = (i * 0.61803398875) % 1;
    g.setAttribute(k, new THREE.BufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage));
  }
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20000);
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

/**
 * Hazard visuals driven by simulation fields: flames where cells burn, smoke from the
 * advected smoke field, rain proportional to rainfall, lightning at simulated strike
 * locations, expanding seismic wavefronts and dust from collapsing buildings.
 */
export class EffectsLayer {
  readonly group = new THREE.Group();
  readonly fire: THREE.Points;
  readonly smoke: THREE.Points;
  readonly rain: THREE.LineSegments;
  readonly dust: THREE.Points;
  readonly fireLights: THREE.PointLight[] = [];
  private fireBase: number[] = [];
  private cellRoof: Float32Array;
  private rainCount: number;
  private bolts: { obj: THREE.LineSegments; born: number }[] = [];
  private seenStrike = -1;
  private rings = new Map<number, THREE.Mesh>();
  private dustCursor = 0;
  flash = 0;
  private fireN: number;
  private smokeN: number;

  constructor(city: City, private hf: HeightField, particleScale: number, fireLights: number) {
    this.fireN = Math.round(3500 * particleScale);
    this.smokeN = Math.round(2600 * particleScale);
    this.cellRoof = new Float32Array(N_CELLS);
    for (let c = 0; c < N_CELLS; c++) this.cellRoof[c] = city.terrain[c];
    const b = city.buildings;
    for (let k = 0; k < b.count; k++) {
      const c = b.cell[k];
      this.cellRoof[c] = Math.max(this.cellRoof[c], b.baseY[k] + Math.min(b.h[k], 16));
    }
    const common = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uScale: { value: 900 } };
    // normal (not additive) blending keeps flames saturated orange against sunlit ground
    this.fire = points(this.fireN, FIRE_VERT, FIRE_FRAG, { ...common }, THREE.NormalBlending);
    this.smoke = points(this.smokeN, SMOKE_VERT, SMOKE_FRAG, { uTime: common.uTime, uWind: common.uWind, uScale: common.uScale, uLight: { value: new THREE.Color(0.7, 0.7, 0.72) } }, THREE.NormalBlending);
    this.fire.renderOrder = 8;
    this.smoke.renderOrder = 9;
    this.group.add(this.fire, this.smoke);

    this.rainCount = Math.round(7000 * particleScale);
    const rg = new THREE.BufferGeometry();
    const seed = new Float32Array(this.rainCount * 2 * 3);
    const end = new Float32Array(this.rainCount * 2);
    for (let k = 0; k < this.rainCount; k++) {
      const s = [((k * 0.754877666) % 1), ((k * 0.569840291) % 1), ((k * 0.3179) % 1)];
      seed.set(s, k * 6);
      seed.set(s, k * 6 + 3);
      end[k * 2 + 1] = 1;
    }
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.rainCount * 2 * 3), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rain = new THREE.LineSegments(
      rg,
      new THREE.ShaderMaterial({
        vertexShader: RAIN_VERT,
        fragmentShader: RAIN_FRAG,
        uniforms: { uCam: { value: new THREE.Vector3() }, uTime: common.uTime, uWind: common.uWind, uBox: { value: 520 }, uColor: { value: new THREE.Color(0.7, 0.75, 0.85) }, uOpacity: { value: 0.3 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.geometry.setDrawRange(0, 0);
    this.group.add(this.rain);

    this.dust = points(1600, DUST_VERT, DUST_FRAG, { uTime: common.uTime, uScale: common.uScale, uLight: { value: new THREE.Color(1, 1, 1) } }, THREE.NormalBlending, { aSeed: 1, aStart: 1 });
    const starts = this.dust.geometry.getAttribute('aStart') as THREE.BufferAttribute;
    for (let i = 0; i < 1600; i++) starts.setX(i, -100);
    this.group.add(this.dust);

    for (let k = 0; k < fireLights; k++) {
      const l = new THREE.PointLight('#ff7a2a', 0, 700, 2);
      l.visible = false;
      this.fireLights.push(l);
      this.group.add(l);
    }
  }

  applyFrame(f: Frame, time: number) {
    // ---- flames
    const burning: number[] = [];
    let total = 0;
    for (let c = 0; c < N_CELLS; c++) {
      const b = f.burn[c];
      if (b > 0.03) {
        burning.push(c);
        total += b;
      }
    }
    const fp = this.fire.geometry.getAttribute('position') as THREE.BufferAttribute;
    const fi = this.fire.geometry.getAttribute('aInt') as THREE.BufferAttribute;
    let k = 0;
    if (burning.length) {
      const per = this.fireN / Math.max(1, total);
      for (const c of burning) {
        const n = Math.max(3, Math.round(f.burn[c] * per));
        const x0 = cellX(c % GRID);
        const z0 = cellZ((c / GRID) | 0);
        const y0 = this.cellRoof[c];
        for (let q = 0; q < n && k < this.fireN; q++, k++) {
          const s = (k * 0.618034) % 1;
          fp.setXYZ(k, x0 + (s - 0.5) * 28, y0 - 2 + ((k * 0.3819) % 1) * 4, z0 + (((k * 0.7548) % 1) - 0.5) * 28);
          fi.setX(k, f.burn[c]);
        }
      }
    }
    for (let q = k; q < this.fireN; q++) fi.setX(q, 0);
    fp.needsUpdate = true;
    fi.needsUpdate = true;

    // ---- smoke from the advected field
    const sp = this.smoke.geometry.getAttribute('position') as THREE.BufferAttribute;
    const si = this.smoke.geometry.getAttribute('aInt') as THREE.BufferAttribute;
    let s = 0;
    let stot = 0;
    const smokey: number[] = [];
    for (let c = 0; c < N_CELLS; c++) {
      if (f.smoke[c] > 0.04) {
        smokey.push(c);
        stot += f.smoke[c];
      }
    }
    if (smokey.length) {
      const per = this.smokeN / stot;
      for (const c of smokey) {
        const n = Math.max(1, Math.round(f.smoke[c] * per * 0.9));
        const x0 = cellX(c % GRID);
        const z0 = cellZ((c / GRID) | 0);
        for (let q = 0; q < n && s < this.smokeN; q++, s++) {
          sp.setXYZ(s, x0 + (((s * 0.618) % 1) - 0.5) * 30, this.cellRoof[c] + 6, z0 + (((s * 0.381) % 1) - 0.5) * 30);
          si.setX(s, Math.min(1.3, f.smoke[c] * 2.6));
        }
      }
    }
    for (let q = s; q < this.smokeN; q++) si.setX(q, 0);
    sp.needsUpdate = true;
    si.needsUpdate = true;

    // ---- fire lights at the largest incidents
    const inc = [...f.incidents].sort((a, b) => b.burning - a.burning);
    this.fireLights.forEach((l, i) => {
      const it = inc[i];
      if (!it || it.burning < 2) {
        l.visible = false;
        return;
      }
      l.visible = true;
      l.position.set(it.x, this.hf.at(it.x, it.z) + 60, it.z);
      // inverse-square: ~6 lx-equivalent at 100 m for a large incident (sun ≈ 3)
      this.fireBase[i] = Math.min(6e4, 1e4 + it.burning * 1.5e3);
      l.intensity = this.fireBase[i];
    });

    // ---- rain density
    const rain = f.eff.rainfall;
    const count = Math.round(Math.min(1, rain / 60) * this.rainCount);
    this.rain.geometry.setDrawRange(0, count * 2);
    (this.rain.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.18 + Math.min(0.25, rain / 200);

    // ---- lightning
    for (const st of f.strikes) if (st.tick > this.seenStrike && f.tick - st.tick < 30) this.spawnBolt(st, time);
    if (f.strikes.length) this.seenStrike = Math.max(this.seenStrike, ...f.strikes.map((x) => x.tick));

    // ---- seismic wavefronts
    const seen = new Set<number>();
    for (const q of f.quakes) {
      seen.add(q.id);
      let ring = this.rings.get(q.id);
      if (!ring) {
        const g = new THREE.RingGeometry(0.97, 1, 128);
        g.rotateX(-Math.PI / 2);
        ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: q.aftershock ? '#c49bff' : '#e6d2ff', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        ring.renderOrder = 10;
        this.rings.set(q.id, ring);
        this.group.add(ring);
      }
      const r2 = (VS * q.elapsed) ** 2 - (q.depthKm * 1000) ** 2;
      const r = r2 > 0 ? Math.sqrt(r2) : 1;
      ring.position.set(q.x, 30, q.z);
      ring.scale.setScalar(Math.max(1, r));
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - q.elapsed / (q.duration * 4 + 8)) * (r2 > 0 ? 1 : 0);
    }
    for (const [id, ring] of this.rings) {
      if (!seen.has(id)) {
        this.group.remove(ring);
        ring.geometry.dispose();
        this.rings.delete(id);
      }
    }
  }

  /** Dust burst at a collapsing building. */
  spawnDust(x: number, y: number, z: number, time: number, n = 24) {
    const p = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const st = this.dust.geometry.getAttribute('aStart') as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      const k = this.dustCursor;
      this.dustCursor = (this.dustCursor + 1) % p.count;
      p.setXYZ(k, x, y + 4, z);
      st.setX(k, time + i * 0.03);
    }
    p.needsUpdate = true;
    st.needsUpdate = true;
  }

  private spawnBolt(s: Strike, time: number) {
    const pts: number[] = [];
    const top = 1500;
    const ground = this.hf.at(s.x, s.z) + 2;
    const branch = (x: number, y: number, z: number, to: number, spread: number, depth: number) => {
      let px = x;
      let py = y;
      let pz = z;
      const steps = 18;
      for (let i = 1; i <= steps; i++) {
        const ny = y + ((to - y) * i) / steps;
        const nx = px + (Math.sin(s.eventId * 13.1 + i * 7.3 + depth) * spread) / (i < steps ? 1 : 1e9);
        const nz = pz + (Math.cos(s.eventId * 9.7 + i * 5.1 + depth) * spread) / (i < steps ? 1 : 1e9);
        const tx = i === steps && depth === 0 ? s.x : nx;
        const tz = i === steps && depth === 0 ? s.z : nz;
        pts.push(px, py, pz, tx, ny, tz);
        if (depth < 1 && i % 6 === 3) branch(tx, ny, tz, ny - 300, spread * 0.8, depth + 1);
        px = tx;
        py = ny;
        pz = tz;
      }
    };
    branch(s.x + 120, top, s.z - 80, ground, 38, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 3.2, 4), transparent: true, opacity: 1, toneMapped: false }));
    obj.frustumCulled = false;
    this.group.add(obj);
    this.bolts.push({ obj, born: time });
    this.flash = 1;
  }

  animate(time: number, dt: number, camera: THREE.Camera, wind: THREE.Vector2, pixelScale: number) {
    const u = (this.fire.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = time;
    u.uWind.value.copy(wind);
    u.uScale.value = 900 * pixelScale;
    const ru = (this.rain.material as THREE.ShaderMaterial).uniforms;
    ru.uCam.value.copy(camera.position);
    // flicker around the frame-set base (a multiplicative walk would drift while paused)
    this.fireLights.forEach((l, i) => {
      if (l.visible) l.intensity = this.fireBase[i] * (0.86 + 0.14 * Math.sin(time * 13 + i * 2.1) * Math.sin(time * 7.3 + i));
    });
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const age = time - b.born;
      (b.obj.material as THREE.LineBasicMaterial).opacity = age < 0.35 ? (Math.sin(age * 90) > -0.3 ? 1 : 0.2) : Math.max(0, 1 - (age - 0.35) * 4);
      if (age > 0.7) {
        this.group.remove(b.obj);
        b.obj.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 5);
  }

  setSmokeLight(c: THREE.Color) {
    (this.smoke.material as THREE.ShaderMaterial).uniforms.uLight.value.copy(c);
    (this.dust.material as THREE.ShaderMaterial).uniforms.uLight.value.copy(c);
  }
}

export { HALF };
