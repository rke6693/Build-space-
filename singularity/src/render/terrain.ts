import * as THREE from 'three';
import { GRID, HALF, N_CELLS, WORLD } from '../sim/config';
import { type City, Zone } from '../sim/types';
import { HASH_GLSL } from './glsl';
import type { HeightField } from './heightfield';

const ZONE_COLORS: Record<number, string> = {
  [Zone.Ocean]: '#3b3a31',
  [Zone.River]: '#453f33',
  [Zone.Shore]: '#b9a987',
  [Zone.Park]: '#4a7236',
  [Zone.Forest]: '#2c4a27',
  [Zone.Residential]: '#6b6e64',
  [Zone.Commercial]: '#5d5f62',
  [Zone.Downtown]: '#57595d',
  [Zone.Industrial]: '#67625a',
  [Zone.Port]: '#5b5b57',
};

export interface TerrainUniforms {
  uOverlay: { value: THREE.DataTexture };
  uOverlayOn: { value: number };
  uGround: { value: THREE.DataTexture }; // r: settlement, g: live shaking
  uShakeGain: { value: number };
  uTime: { value: number };
  uWet: { value: number };
}

/**
 * Terrain: a 257² heightfield mesh for the simulated domain (zone-coloured, with a
 * fragment-shader detail layer and an analysis overlay), a skirt hiding T-junction cracks,
 * and a coarse far landscape that continues the coast and rises into mountains.
 */
export class TerrainLayer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly uniforms: TerrainUniforms;
  readonly overlayData = new Uint8Array(N_CELLS * 4);
  readonly groundData = new Uint8Array(N_CELLS * 4);
  private overlayTex: THREE.DataTexture;
  private groundTex: THREE.DataTexture;

  constructor(city: City, hf: HeightField) {
    this.overlayTex = new THREE.DataTexture(this.overlayData, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.overlayTex.magFilter = THREE.LinearFilter;
    this.overlayTex.minFilter = THREE.LinearFilter;
    this.overlayTex.needsUpdate = true;
    this.groundTex = new THREE.DataTexture(this.groundData, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.groundTex.magFilter = THREE.LinearFilter;
    this.groundTex.minFilter = THREE.LinearFilter;
    this.groundTex.needsUpdate = true;
    this.uniforms = {
      uOverlay: { value: this.overlayTex },
      uOverlayOn: { value: 0 },
      uGround: { value: this.groundTex },
      uShakeGain: { value: 0 },
      uTime: { value: 0 },
      uWet: { value: 0 },
    };

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.uniforms.uWorld = { value: WORLD };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uGround;
          uniform float uShakeGain;
          uniform float uTime;
          uniform float uWorld;
          varying vec3 vWPos;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec2 guv = transformed.xz / uWorld + 0.5;
          float inside = step(0.0, guv.x) * step(guv.x, 1.0) * step(0.0, guv.y) * step(guv.y, 1.0);
          vec4 gd = texture2D(uGround, clamp(guv, 0.0, 1.0)) * inside;
          transformed.y -= gd.r * 1.28;
          // exaggerated visual of the simulated ground acceleration field
          transformed.y += gd.g * uShakeGain * sin(uTime * 13.0 + transformed.x * 0.02 + transformed.z * 0.017);
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uOverlay;
          uniform float uOverlayOn;
          uniform float uWet;
          uniform float uWorld;
          varying vec3 vWPos;
          ${HASH_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float n1 = fbm2(vWPos.xz * 0.018);
          float n2 = vnoise(vWPos.xz * 0.21);
          diffuseColor.rgb *= 0.82 + 0.3 * n1 + 0.08 * n2;
          diffuseColor.rgb *= 1.0 - 0.28 * uWet;
          vec2 ouv = vWPos.xz / uWorld + 0.5;
          float oin = step(0.0, ouv.x) * step(ouv.x, 1.0) * step(0.0, ouv.y) * step(ouv.y, 1.0);
          vec4 ov = texture2D(uOverlay, ouv) * oin;
          diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a * uOverlayOn);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.45, uWet);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += ov.rgb * ov.a * uOverlayOn * 0.22;`,
        );
    };

    // ---------------- domain mesh
    const res = hf.res;
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, res - 1, res - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const zc: Record<number, THREE.Color> = {};
    for (const [k, v] of Object.entries(ZONE_COLORS)) zc[Number(k)] = new THREE.Color(v);
    const levee = new THREE.Color('#5a7443');
    const rock = new THREE.Color('#6a6258');
    const tmp = new THREE.Color();
    const acc = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const i = v % res;
      const j = Math.floor(v / res);
      const y = hf.h[j * res + i];
      pos.setY(v, y);
      // bilinear blend of neighbouring cell colours
      const fx = (x + HALF) / (WORLD / GRID) - 0.5;
      const fz = (z + HALF) / (WORLD / GRID) - 0.5;
      const ci = Math.floor(fx);
      const cj = Math.floor(fz);
      const tx = fx - ci;
      const tz = fz - cj;
      acc.setRGB(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const ii = Math.min(GRID - 1, Math.max(0, ci + (k & 1)));
        const jj = Math.min(GRID - 1, Math.max(0, cj + (k >> 1)));
        const c = jj * GRID + ii;
        const w = (k & 1 ? tx : 1 - tx) * (k >> 1 ? tz : 1 - tz);
        let col = zc[city.zone[c]] ?? zc[Zone.Residential];
        if (city.leveeHeight[c] > 0) col = levee;
        tmp.copy(col);
        acc.r += tmp.r * w;
        acc.g += tmp.g * w;
        acc.b += tmp.b * w;
      }
      // steep ground shows rock; underwater beds darker
      const sx = hf.at(x + 8, z) - hf.at(x - 8, z);
      const sz = hf.at(x, z + 8) - hf.at(x, z - 8);
      const slope = Math.hypot(sx, sz) / 16;
      if (slope > 0.25) acc.lerp(rock, Math.min(1, (slope - 0.25) * 2.5));
      if (y < -0.5) acc.multiplyScalar(0.7);
      colors[v * 3] = acc.r;
      colors[v * 3 + 1] = acc.g;
      colors[v * 3 + 2] = acc.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.group.add(this.mesh);

    // ---------------- skirt around the domain edge
    const skirt = buildSkirt(hf, material);
    this.group.add(skirt);

    // ---------------- far landscape ring
    this.group.add(buildFar(hf, material));
  }

  setOverlay(on: boolean) {
    this.uniforms.uOverlayOn.value = on ? 1 : 0;
    if (on) this.overlayTex.needsUpdate = true;
  }

  markOverlayDirty() {
    this.overlayTex.needsUpdate = true;
  }

  updateGround(settlement: Float32Array, shaking: Float32Array) {
    const d = this.groundData;
    for (let c = 0; c < N_CELLS; c++) {
      d[c * 4] = Math.min(255, settlement[c] * 200);
      d[c * 4 + 1] = Math.min(255, shaking[c] * 255);
    }
    this.groundTex.needsUpdate = true;
  }
}

function buildSkirt(hf: HeightField, material: THREE.Material): THREE.Mesh {
  const pts: number[] = [];
  const cols: number[] = [];
  const res = hf.res;
  const edge: [number, number][] = [];
  for (let i = 0; i < res; i++) edge.push([-HALF + i * hf.step, -HALF]);
  for (let j = 1; j < res; j++) edge.push([HALF, -HALF + j * hf.step]);
  for (let i = res - 2; i >= 0; i--) edge.push([-HALF + i * hf.step, HALF]);
  for (let j = res - 2; j >= 0; j--) edge.push([-HALF, -HALF + j * hf.step]);
  const idx: number[] = [];
  for (let k = 0; k < edge.length; k++) {
    const [x, z] = edge[k];
    const y = hf.at(x, z);
    pts.push(x, y, z, x, y - 60, z);
    cols.push(0.2, 0.2, 0.18, 0.12, 0.12, 0.1);
    if (k > 0) {
      const a = (k - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.material = (material as THREE.MeshStandardMaterial).clone();
  (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  return m;
}

function buildFar(hf: HeightField, material: THREE.Material): THREE.Mesh {
  const EXT = 20480;
  const STEP = 256;
  const n = (EXT * 2) / STEP + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const sand = new THREE.Color('#b3a37f');
  const low = new THREE.Color('#4d6b35');
  const forest = new THREE.Color('#2a4225');
  const rock = new THREE.Color('#6f675c');
  const snow = new THREE.Color('#d7dade');
  const bed = new THREE.Color('#2b2f2c');
  const c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -EXT + i * STEP;
      const z = -EXT + j * STEP;
      const inside = Math.abs(x) < HALF && Math.abs(z) < HALF;
      const onEdge = !inside && Math.abs(x) <= HALF && Math.abs(z) <= HALF;
      let y = onEdge ? hf.at(x, z) : hf.far(x, z);
      if (inside) y = Math.min(hf.at(x, z), y) - 150;
      const k = (j * n + i) * 3;
      pos[k] = x;
      pos[k + 1] = y;
      pos[k + 2] = z;
      if (y < -0.5) c.copy(bed);
      else if (y < 3) c.copy(sand);
      else if (y < 90) c.copy(low).lerp(forest, Math.min(1, y / 90));
      else if (y < 300) c.copy(forest).lerp(rock, (y - 90) / 210);
      else c.copy(rock).lerp(snow, Math.min(1, (y - 300) / 200));
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = false;
  m.name = 'far-terrain';
  return m;
}
