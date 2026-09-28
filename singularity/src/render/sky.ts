import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { WORLD, WX_GRID } from '../sim/config';
import { clamp, smoothstep } from '../sim/math';
import type { EnvEffective } from '../sim/types';
import { HASH_GLSL } from './glsl';

const CLOUD_VERT = /* glsl */ `
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uField;
uniform vec2 uOffset;
uniform float uCover;
uniform float uStorm;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uSunDir;
uniform float uFlash;
uniform float uFade;
uniform float uWorld;
uniform float uLayer;
varying vec3 vWPos;
#include <fog_pars_fragment>
${HASH_GLSL}
void main() {
  vec2 p = vWPos.xz;
  vec2 fuv = clamp(p / uWorld + 0.5, 0.0, 1.0);
  float field = texture2D(uField, fuv).r;
  float edge = smoothstep(0.62, 0.45, length(p / uWorld));
  float base = fbm2((p + uOffset) * 0.00042 + uLayer * 7.1);
  float detail = fbm2((p + uOffset * 1.3) * 0.0019 + 3.7);
  float dens = base * 0.75 + detail * 0.35;
  float cov = mix(uCover, max(uCover, field), 0.6);
  float d = smoothstep(1.0 - cov, 1.0 - cov + 0.28, dens);
  d *= mix(1.0, edge, 0.0);
  if (d < 0.01) discard;
  float thick = d * (0.6 + 0.8 * uStorm);
  vec3 lit = uAmbient * 1.4 + uSunColor * (0.35 + 0.65 * max(uSunDir.y, 0.0)) * (1.0 - thick * 0.55);
  vec3 col = mix(lit, lit * vec3(0.55, 0.58, 0.64), clamp(uStorm * 1.2, 0.0, 1.0) * thick);
  col += uFlash * vec3(0.9, 0.9, 1.0) * d;
  float alpha = clamp(d * (0.75 + 0.25 * uStorm), 0.0, 0.96) * uFade;
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

export interface SkyState {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  skyColor: THREE.Color;
  horizon: THREE.Color;
  ambient: THREE.Color;
  night: number;
  sunElevation: number;
}

/**
 * Atmosphere: Preetham sky, sun/moon/hemisphere lights, stars, a procedural cloud deck
 * modulated by the simulated cloud field, and fog density tied to simulated visibility.
 */
export class SkyLayer {
  readonly group = new THREE.Group();
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  readonly moon: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  readonly state: SkyState = {
    sunDir: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(),
    skyColor: new THREE.Color(),
    horizon: new THREE.Color(),
    ambient: new THREE.Color(),
    night: 0,
    sunElevation: 0,
  };
  private stars: THREE.Points;
  private clouds: THREE.Mesh[] = [];
  private cloudUniforms: Record<string, THREE.IUniform>;
  private fieldTex: THREE.DataTexture;
  private fieldData = new Uint8Array(WX_GRID * WX_GRID * 4);
  private cloudOffset = new THREE.Vector2();
  private pmrem: THREE.PMREMGenerator | null = null;
  private envScene = new THREE.Scene();
  private envMat: THREE.ShaderMaterial;
  private lastEnvKey = '';
  private hasState = false;
  envTarget: THREE.WebGLRenderTarget | null = null;

  constructor(private scene: THREE.Scene, layers: number) {
    this.sky = new Sky();
    this.sky.scale.setScalar(60000);
    // the Preetham sun disk reaches ~1e6, beyond half-float range; clamp so HDR targets stay finite
    SkyLayer.clampSky(this.sky, 60);
    this.group.add(this.sky);
    // Image-based lighting comes from a controlled gradient dome (zenith/horizon/ground + soft
    // sun lobe) that follows the same palette as the fog and lights. Capturing the Preetham
    // sky directly is far too hot for IBL (its sun disk alone exceeds half-float range).
    this.envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGround: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunColor;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(uHorizon, uGround, smoothstep(0.0, 0.25, -y));
          float s = max(dot(d, uSunDir), 0.0);
          c += uSunColor * (pow(s, 24.0) * 1.6 + pow(s, 4.0) * 0.25) * step(-0.05, y);
          gl_FragColor = vec4(min(c, vec3(8.0)), 1.0);
        }`,
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.envMat));

    this.sun = new THREE.DirectionalLight('#ffffff', 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -2300;
    sc.right = 2300;
    sc.top = 2300;
    sc.bottom = -2300;
    sc.near = 100;
    sc.far = 9000;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.5;
    this.group.add(this.sun, this.sun.target);
    this.moon = new THREE.DirectionalLight('#8fa6d8', 0.0);
    this.group.add(this.moon, this.moon.target);
    this.hemi = new THREE.HemisphereLight('#9fb8d8', '#3a3a30', 0.6);
    this.group.add(this.hemi);

    this.fog = new THREE.FogExp2('#aab6c4', 0.00012);
    scene.fog = this.fog;

    // stars
    const n = 2200;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const u = (k * 0.618034) % 1;
      const v = ((k * 0.7548777) % 1) * 0.92 + 0.08;
      const th = u * Math.PI * 2;
      const ph = Math.acos(1 - v);
      pos[k * 3] = Math.sin(ph) * Math.cos(th) * 40000;
      pos[k * 3 + 1] = Math.cos(ph) * 40000;
      pos[k * 3 + 2] = Math.sin(ph) * Math.sin(th) * 40000;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cfd8ff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    // clouds
    this.fieldTex = new THREE.DataTexture(this.fieldData, WX_GRID, WX_GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.fieldTex.magFilter = THREE.LinearFilter;
    this.fieldTex.minFilter = THREE.LinearFilter;
    this.fieldTex.needsUpdate = true;
    this.cloudUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uField: { value: null },
        uOffset: { value: new THREE.Vector2() },
        uCover: { value: 0.3 },
        uStorm: { value: 0 },
        uSunColor: { value: new THREE.Color() },
        uAmbient: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() },
        uFlash: { value: 0 },
        uFade: { value: 1 },
        uWorld: { value: WORLD },
        uLayer: { value: 0 },
      },
    ]);
    this.cloudUniforms.uField.value = this.fieldTex;
    for (let l = 0; l < layers; l++) {
      const u = { ...this.cloudUniforms, uLayer: { value: l } };
      const mat = new THREE.ShaderMaterial({ vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, uniforms: u, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide });
      const g = new THREE.PlaneGeometry(26000, 26000, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.y = 2300 + l * 450;
      m.renderOrder = 20 + l;
      m.frustumCulled = false;
      this.clouds.push(m);
      this.group.add(m);
    }
    scene.add(this.group);
  }

  private static clampSky(sky: Sky, max: number) {
    const m = sky.material;
    m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', `gl_FragColor = vec4( clamp( retColor, 0.0, ${max.toFixed(1)} ), 1.0 );`);
    m.needsUpdate = true;
  }

  /** Solar geometry from local time (simple mid-latitude autumn model). */
  static sunFor(hours: number): { elevation: number; azimuth: number } {
    const sunrise = 6.6;
    const sunset = 18.9;
    const dayLen = sunset - sunrise;
    const u = (hours - sunrise) / dayLen;
    const elevation = u >= 0 && u <= 1 ? Math.sin(u * Math.PI) * 48 : -Math.sin(((hours - sunset + 24) % 24) / (24 - dayLen) * Math.PI) * 30;
    const azimuth = 90 + u * 180; // east → south → west
    return { elevation, azimuth };
  }

  update(eff: EnvEffective, dt: number, camera: THREE.Camera, flash: number) {
    this.hasState = true;
    const { elevation, azimuth } = SkyLayer.sunFor(eff.timeOfDay);
    const st = this.state;
    st.sunElevation = elevation;
    const el = THREE.MathUtils.degToRad(Math.max(elevation, -4));
    const az = THREE.MathUtils.degToRad(azimuth);
    // world: x east, z south ⇒ azimuth measured from north (-z) clockwise
    st.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    const storm = eff.stormIntensity;
    const cover = clamp(eff.cloudCover * 0.8 + storm * 0.4, 0, 1);
    st.night = smoothstep(6, -7, elevation);
    const day = 1 - st.night;
    const low = smoothstep(22, 2, elevation) * day;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(st.sunDir);
    u.turbidity.value = 2.5 + cover * 6 + storm * 6;
    u.rayleigh.value = 0.8 + low * 2.2 - cover * 0.4;
    u.mieCoefficient.value = 0.004 + cover * 0.012;
    u.mieDirectionalG.value = 0.82;

    st.sunColor.setRGB(1, 0.96, 0.9).lerp(new THREE.Color(1.0, 0.55, 0.25), low).multiplyScalar(day * (1 - cover * 0.72));
    st.skyColor.set('#4f7cb6').lerp(new THREE.Color('#2a3f63'), low * 0.5).lerp(new THREE.Color('#5d6670'), cover * 0.8).lerp(new THREE.Color('#050912'), st.night);
    st.horizon.set('#c7d3df').lerp(new THREE.Color('#f0a46b'), low * 0.8).lerp(new THREE.Color('#7e8791'), cover * 0.75).lerp(new THREE.Color('#0d1320'), st.night * 0.93);
    st.ambient.setRGB(0.28, 0.31, 0.36).lerp(new THREE.Color(0.18, 0.18, 0.2), cover).multiplyScalar(0.25 + 0.75 * day).add(new THREE.Color(0.02, 0.025, 0.045));

    this.sun.color.copy(st.sunColor);
    this.sun.intensity = elevation > -2 ? 3.2 * day * (1 - cover * 0.65) : 0;
    this.sun.position.copy(st.sunDir).multiplyScalar(5000);
    this.sun.target.position.set(0, 0, 0);
    this.moon.intensity = st.night * 0.35 * (1 - cover * 0.6);
    this.moon.position.set(-2000, 4000, 1500);
    this.hemi.color.copy(st.skyColor).lerp(new THREE.Color('#ffffff'), 0.25);
    this.hemi.groundColor.set('#3b362c').multiplyScalar(0.3 + day * 0.7);
    this.hemi.intensity = 0.25 + day * 0.85 + flash * 3.5;

    // fog: visibility → density; colour follows the horizon
    const vis = Math.max(0.15, eff.visibilityKm);
    // visibility drives the haze, but capped so the city stays legible at analysis distances
    const murk = Math.pow(1 - clamp(vis / 25, 0, 1), 1.5);
    // rain and haze sit low: looking down from altitude crosses less of it
    const aloft = 1 - 0.6 * smoothstep(400, 2600, camera.position.y);
    this.fog.density = (0.00002 + 0.00026 * murk) * aloft;
    this.fog.color.copy(st.horizon).lerp(new THREE.Color('#a9b4c0'), (0.35 + cover * 0.3) * (0.1 + 0.9 * day));
    if (flash > 0) this.fog.color.lerp(new THREE.Color('#c9d2ff'), flash * 0.4);

    (this.stars.material as THREE.PointsMaterial).opacity = st.night * (1 - cover) * 0.9;

    // clouds
    this.cloudOffset.x += eff.windX * dt * 20;
    this.cloudOffset.y += eff.windZ * dt * 20;
    const cu = this.cloudUniforms;
    const fade = 1 - smoothstep(1700, 2600, camera.position.y) * 0.85;
    for (const m of this.clouds) {
      const uu = (m.material as THREE.ShaderMaterial).uniforms;
      uu.uOffset.value.copy(this.cloudOffset);
      uu.uCover.value = clamp(0.12 + cover * 0.85, 0, 0.97);
      uu.uStorm.value = storm;
      uu.uSunColor.value.copy(st.sunColor).add(new THREE.Color(0.05, 0.05, 0.07));
      uu.uAmbient.value.copy(st.ambient);
      uu.uSunDir.value.copy(st.sunDir);
      uu.uFlash.value = flash;
      uu.uFade.value = fade * (m === this.clouds[1] ? storm : 1);
    }
    void cu;
  }

  setCloudField(clouds: Float32Array) {
    for (let k = 0; k < clouds.length; k++) this.fieldData[k * 4] = Math.min(255, clouds[k] * 255);
    this.fieldTex.needsUpdate = true;
  }

  setCloudsVisible(v: boolean) {
    for (const m of this.clouds) m.visible = v;
  }

  /** Regenerates the image-based lighting when the sky changed noticeably. */
  /** Returns false while there is no sky state yet (nothing captured). */
  updateEnvironment(renderer: THREE.WebGLRenderer, enabled: boolean): boolean {
    if (!enabled) {
      this.scene.environment = null;
      return true;
    }
    if (!this.hasState) return false;
    const st = this.state;
    // the ambient term keeps following night/day even when the capture is reused
    this.scene.environmentIntensity = 0.3 + 0.5 * (1 - st.night);
    const key = [st.sunDir.x.toFixed(2), st.sunDir.y.toFixed(2), st.skyColor.getHexString(), st.horizon.getHexString(), st.sunColor.getHexString()].join('|');
    if (key === this.lastEnvKey) return true;
    this.lastEnvKey = key;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    const eu = this.envMat.uniforms;
    eu.uTop.value.copy(st.skyColor);
    eu.uHorizon.value.copy(st.horizon);
    eu.uGround.value.set('#3b3a34').multiplyScalar(0.25 + 0.6 * (1 - st.night));
    eu.uSunDir.value.copy(st.sunDir);
    eu.uSunColor.value.copy(st.sunColor);
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
    this.scene.environment = this.envTarget.texture;
    old?.dispose();
    return true;
  }
}
