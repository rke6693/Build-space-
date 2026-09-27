import * as THREE from 'three';
import { GRID, HALF, N_CELLS, WORLD, cellX, cellZ } from '../sim/config';
import { type City, Zone } from '../sim/types';
import { HASH_GLSL } from './glsl';
import type { HeightField } from './heightfield';

const VERT = /* glsl */ `
uniform sampler2D uWater;
uniform float uSeaLevel;
uniform float uFar;
attribute vec2 cellUV;
varying float vDepth;
varying float vKind;
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  if (uFar > 0.5) {
    p.y = uSeaLevel;
    vDepth = 40.0;
    vKind = 0.0;
  } else {
    vec4 w = texture2D(uWater, cellUV);
    p.y = w.r;
    vDepth = w.g;
    vKind = w.b;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uAmbient;
uniform vec2 uWind;
uniform float uFloodLayer;
uniform float uFlash;
varying float vDepth;
varying float vKind;
varying vec3 vWPos;
#include <fog_pars_fragment>
${HASH_GLSL}

// Sum of directional swells plus fine noise. Each octave fades out once its wavelength
// approaches the pixel footprint so distant water does not alias into speckle.
vec2 waveGrad(vec2 p, float t, float rough, float px) {
  vec2 g = vec2(0.0);
  vec2 wd = normalize(uWind + vec2(0.0001, 0.0));
  vec2 d1 = wd;
  vec2 d2 = normalize(vec2(wd.y, -wd.x) * 0.6 + wd);
  vec2 d3 = normalize(vec2(-wd.y, wd.x) * 0.8 + wd);
  vec2 d4 = normalize(vec2(0.3, 0.9));
  float k1 = 6.2831 / 55.0, k2 = 6.2831 / 23.0, k3 = 6.2831 / 11.0, k4 = 6.2831 / 5.3;
  g += d1 * k1 * 0.55 * cos(dot(d1, p) * k1 - t * 0.9) * (1.0 - smoothstep(10.0, 28.0, px));
  g += d2 * k2 * 0.25 * cos(dot(d2, p) * k2 - t * 1.5) * (1.0 - smoothstep(4.0, 12.0, px));
  g += d3 * k3 * 0.12 * cos(dot(d3, p) * k3 - t * 2.2) * (1.0 - smoothstep(2.0, 5.5, px));
  g += d4 * k4 * 0.05 * cos(dot(d4, p) * k4 - t * 3.1) * (1.0 - smoothstep(0.9, 2.6, px));
  float fine = 1.0 - smoothstep(0.5, 1.4, px);
  if (fine > 0.0) {
    float e = 0.6;
    float n0 = vnoise(p * 0.35 + t * 0.4);
    g += vec2(vnoise(p * 0.35 + vec2(e, 0.0) + t * 0.4) - n0, vnoise(p * 0.35 + vec2(0.0, e) + t * 0.4) - n0) * 0.9 * fine;
  }
  return g * rough;
}

vec3 depthRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a = vec3(0.55, 0.9, 1.0);
  vec3 b = vec3(0.1, 0.45, 1.0);
  vec3 c = vec3(0.35, 0.1, 0.75);
  vec3 d = vec3(0.9, 0.1, 0.45);
  if (t < 0.33) return mix(a, b, t / 0.33);
  if (t < 0.66) return mix(b, c, (t - 0.33) / 0.33);
  return mix(c, d, (t - 0.66) / 0.34);
}

void main() {
  if (vDepth < 0.02) discard;
  float windAmp = clamp(length(uWind) / 14.0, 0.15, 1.6);
  float flood = step(0.5, vKind);
  float rough = mix(windAmp, 0.18 + windAmp * 0.12, flood) * mix(1.0, 0.45, smoothstep(6.0, 0.0, vDepth) * (1.0 - flood));
  float px = length(fwidth(vWPos.xz));
  vec2 g = waveGrad(vWPos.xz, uTime, rough, px);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWPos);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  fres = min(fres, 0.75);
  vec3 R = reflect(-V, n);
  vec3 refl = mix(uHorizon, uSky, clamp(R.y * 2.2 + 0.1, 0.0, 1.0));
  // night: keep a faint moonlit sheen so the sea still reads against the land
  float night = 1.0 - smoothstep(-0.08, 0.12, uSunDir.y);
  refl = max(refl, vec3(0.018, 0.026, 0.042) * night);
  vec3 moonDir = normalize(vec3(-0.4, 0.8, 0.3));
  float moonSpec = pow(max(dot(reflect(-moonDir, n), V), 0.0), mix(160.0, 40.0, smoothstep(1.0, 20.0, px)));
  // distant water is rougher at pixel scale: widen the sun lobe instead of aliasing it
  float shin = mix(380.0, 60.0, smoothstep(1.0, 20.0, px));
  float spec = pow(max(dot(reflect(-uSunDir, n), V), 0.0), shin) * mix(1.0, 0.35, smoothstep(1.0, 20.0, px));
  vec3 deep = vec3(0.006, 0.035, 0.05);
  vec3 shallow = vec3(0.02, 0.16, 0.17);
  vec3 sea = mix(deep, shallow, exp(-vDepth / 5.0));
  vec3 murk = vec3(0.13, 0.11, 0.075) * (0.85 + 0.3 * vnoise(vWPos.xz * 0.05));
  vec3 body = mix(sea, murk, flood);
  vec3 lit = body * (uAmbient + uSunColor * max(uSunDir.y, 0.0) * 0.45);
  vec3 col = mix(lit, refl, fres * mix(1.0, 0.6, flood)) + uSunColor * spec * 5.0 + vec3(0.35, 0.42, 0.6) * moonSpec * night * 0.8;
  // shoreline foam and whitecaps
  float foamNoise = vnoise(vWPos.xz * 0.12 + uTime * 0.3);
  float foam = (1.0 - flood) * smoothstep(0.7, 0.05, vDepth) * smoothstep(0.35, 0.8, foamNoise);
  foam += (1.0 - flood) * smoothstep(1.2, 1.6, windAmp) * smoothstep(0.78, 0.95, vnoise(vWPos.xz * 0.04 - uTime * 0.2));
  foam += flood * 0.35 * smoothstep(0.25, 0.02, vDepth) * foamNoise;
  col = mix(col, vec3(0.8) * (uAmbient + uSunColor * 0.5), clamp(foam, 0.0, 1.0) * 0.55);
  col += uFlash * vec3(0.5, 0.55, 0.7) * fres;
  float alpha = mix(0.93, 0.88, flood) * smoothstep(0.02, 0.22, vDepth);
  if (uFloodLayer > 0.5 && flood > 0.5) {
    vec3 ramp = depthRamp(vDepth / 3.0);
    float contour = 1.0 - smoothstep(0.0, 0.05, abs(fract(vDepth * 2.0) - 0.5) - 0.44);
    col = mix(col, ramp * (0.55 + uAmbient * 0.6), 0.75) * (1.0 - 0.35 * contour);
    alpha = max(alpha, 0.85);
  }
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

/**
 * Water surfaces: the simulated grid (sea, river and floodwater share one mesh whose
 * vertices sit on cell centres and read the solver output), plus a far sea around the
 * domain and a static upstream river beyond the map edge.
 */
export class WaterLayer {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private tex: THREE.DataTexture;
  private data = new Float32Array(N_CELLS * 4);
  private kind = new Float32Array(N_CELLS);
  private surf = new Float32Array(N_CELLS);
  private material: THREE.ShaderMaterial;

  constructor(private city: City, hf: HeightField) {
    this.tex = new THREE.DataTexture(this.data, GRID, GRID, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    for (let c = 0; c < N_CELLS; c++) this.kind[c] = city.zone[c] === Zone.Ocean || city.zone[c] === Zone.River ? 0 : 1;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uWater: { value: this.tex },
        uSeaLevel: { value: 0 },
        uFar: { value: 0 },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color(1, 1, 1) },
        uSky: { value: new THREE.Color('#5d7fa8') },
        uHorizon: { value: new THREE.Color('#b8c4d0') },
        uAmbient: { value: new THREE.Color(0.3, 0.3, 0.35) },
        uWind: { value: new THREE.Vector2(3, 2) },
        uFloodLayer: { value: 0 },
        uFlash: { value: 0 },
      },
    ]);
    this.uniforms.uWater.value = this.tex;
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, fog: true, depthWrite: true });

    // Grid mesh: domain boundary + cell centres so it meets the far sea without a seam.
    const coords = [-HALF, ...Array.from({ length: GRID }, (_, i) => cellX(i)), HALF];
    const n = coords.length;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = coords[i];
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = j === 0 ? -HALF : j === n - 1 ? HALF : cellZ(j - 1);
        const ci = Math.min(GRID - 1, Math.max(0, i - 1));
        const cj = Math.min(GRID - 1, Math.max(0, j - 1));
        uv[k * 2] = (ci + 0.5) / GRID;
        uv[k * 2 + 1] = (cj + 0.5) / GRID;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('cellUV', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), WORLD);
    const grid = new THREE.Mesh(g, this.material);
    grid.renderOrder = 2;
    grid.name = 'water';
    this.group.add(grid);

    // Far sea: four slabs around the domain (south half only needs it, but a ring is cheap).
    const farMat = this.material.clone();
    farMat.uniforms = this.uniforms;
    const farUniforms = { ...this.uniforms, uFar: { value: 1 } };
    farMat.uniforms = farUniforms;
    const EXT = 22000;
    const slabs: [number, number, number, number][] = [
      [-EXT, HALF, EXT, EXT], // south
      [-EXT, -EXT, -HALF, HALF], // west
      [HALF, -EXT, EXT, HALF], // east
    ];
    for (const [x0, z0, x1, z1] of slabs) {
      const pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 8);
      pg.rotateX(-Math.PI / 2);
      pg.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      pg.setAttribute('cellUV', new THREE.BufferAttribute(new Float32Array((pg.attributes.position.count) * 2), 2));
      const m = new THREE.Mesh(pg, farMat);
      m.renderOrder = 1;
      this.group.add(m);
    }
    // Upstream river beyond the northern edge (static, visual only).
    const pts: number[] = [];
    const tm = hf.tm;
    const riv: number[] = [];
    for (let z = -HALF - 12000, k = 0; z <= -HALF + 40; z += 60, k++) {
      const x = tm.riverX(z);
      const hw = tm.riverHalfWidth(-HALF) + 6;
      const y = hf.far(x, z) + 1.6;
      pts.push(x - hw, Math.max(y, 17), z, x + hw, Math.max(y, 17), z);
      if (k > 0) {
        const a = (k - 1) * 2;
        riv.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    rg.setAttribute('cellUV', new THREE.BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
    rg.setIndex(riv);
    const riverMat = this.material.clone();
    const riverUniforms = { ...this.uniforms, uFar: { value: 1 }, uSeaLevel: { value: 0 } };
    riverMat.uniforms = riverUniforms;
    riverMat.vertexShader = VERT.replace('p.y = uSeaLevel;', 'p.y = position.y;');
    this.group.add(new THREE.Mesh(rg, riverMat));
  }

  /** Converts solver depths into a render surface; dry cells are tucked under the terrain. */
  update(water: Float32Array, levee: Float32Array, settlement: Float32Array) {
    const city = this.city;
    const surf = this.surf;
    const d = this.data;
    for (let c = 0; c < N_CELLS; c++) {
      const z = city.terrain[c] - settlement[c] + (city.leveeHeight[c] > 0 ? Math.min(levee[c], 0.5) : 0);
      surf[c] = water[c] > 0.015 ? z + water[c] : NaN;
    }
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const c = j * GRID + i;
        let s = surf[c];
        const depth = water[c];
        if (Number.isNaN(s)) {
          // dry: slope the surface down just below the lowest wet neighbour
          let m = -Infinity;
          if (i > 0 && !Number.isNaN(surf[c - 1])) m = Math.max(m, surf[c - 1]);
          if (i < GRID - 1 && !Number.isNaN(surf[c + 1])) m = Math.max(m, surf[c + 1]);
          if (j > 0 && !Number.isNaN(surf[c - GRID])) m = Math.max(m, surf[c - GRID]);
          if (j < GRID - 1 && !Number.isNaN(surf[c + GRID])) m = Math.max(m, surf[c + GRID]);
          s = m > -Infinity ? Math.min(m - 0.25, city.terrain[c] - 0.3) : city.terrain[c] - 4;
        }
        d[c * 4] = s;
        d[c * 4 + 1] = depth;
        d[c * 4 + 2] = this.kind[c];
        d[c * 4 + 3] = 1;
      }
    }
    this.tex.needsUpdate = true;
  }

  setSeaLevel(y: number) {
    this.uniforms.uSeaLevel.value = y;
  }
}
