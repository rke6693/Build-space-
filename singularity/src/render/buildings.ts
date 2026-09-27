import * as THREE from 'three';
import { GRID, HALF, N_CELLS, WORLD } from '../sim/config';
import { BType, type City, type Frame } from '../sim/types';
import { DAMAGE_COLORS } from '../ui/format';
import { HASH_GLSL } from './glsl';

const CHUNKS = 4;
const CHUNK_SIZE = WORLD / CHUNKS;

const STYLE_COLORS: string[][] = [
  ['#5f6f80', '#566676', '#6b7a88', '#4f5d6c'], // 0 glass curtain wall
  ['#b9b3a8', '#a9a59e', '#c8c2b5', '#9ea3a8', '#bfb6a3'], // 1 concrete
  ['#8d5a44', '#7a4a3a', '#9b6a4f', '#a57c5b', '#865f4b'], // 2 historic brick
  ['#8a8f94', '#6e7a86', '#9a8f7e', '#7d8b7a', '#8f8a85'], // 3 industrial cladding
  ['#2c3743'], // 4 landmark tower
  ['#e4e0d6', '#d9dde0'], // 5 civic / critical facility
  ['#d8cfc0', '#c9b8a0', '#b8c4c8', '#e2d6c2', '#a9b39c', '#cdb7a4'], // 6 house walls
];
const ROOF_COLORS = ['#6b4a3a', '#4a4f57', '#7a5c48', '#3f4a52', '#5b3f33'];
const FLOOR_H = [3.8, 3.2, 3.6, 6.5, 4.0, 4.2, 2.8];

export type BuildingTint = 'none' | 'damage' | 'power';

interface Chunk {
  body: THREE.InstancedMesh;
  roof: THREE.InstancedMesh | null;
  ids: number[]; // building index per body instance
  roofIds: number[];
  roofSlot: Int32Array; // body instance -> roof instance or -1
  center: THREE.Vector3;
}

/**
 * Buildings are unit boxes instanced per 1 km chunk (so frustum culling works per chunk)
 * with a shared, patched MeshStandardMaterial. All per-building visual state lives in
 * instanced attributes updated from simulation frames.
 */
export class BuildingLayer {
  readonly group = new THREE.Group();
  readonly chunks: Chunk[] = [];
  readonly uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uShake: { value: null as unknown as THREE.DataTexture },
    uShakeGain: { value: 0 },
    uWorld: { value: WORLD },
  };
  private shakeData = new Uint8Array(N_CELLS * 4);
  private shakeTex: THREE.DataTexture;
  private chunkOf: Int32Array; // building -> chunk
  private slotOf: Int32Array; // building -> instance slot within chunk
  private lastState: Uint8Array;
  private tint: BuildingTint = 'none';
  private selected = -1;
  readonly material: THREE.MeshStandardMaterial;
  readonly roofMaterial: THREE.MeshStandardMaterial;
  private seeds: Float32Array;

  constructor(private city: City) {
    this.shakeTex = new THREE.DataTexture(this.shakeData, GRID, GRID, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.shakeTex.magFilter = THREE.LinearFilter;
    this.shakeTex.minFilter = THREE.LinearFilter;
    this.shakeTex.needsUpdate = true;
    this.uniforms.uShake.value = this.shakeTex;

    this.material = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.08 });
    this.material.onBeforeCompile = (shader) => this.patch(shader, true);
    this.material.customProgramCacheKey = () => 'buildings-v1';
    this.roofMaterial = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 });
    this.roofMaterial.onBeforeCompile = (shader) => this.patch(shader, false);
    this.roofMaterial.customProgramCacheKey = () => 'roofs-v1';

    const b = city.buildings;
    this.chunkOf = new Int32Array(b.count);
    this.slotOf = new Int32Array(b.count);
    this.lastState = new Uint8Array(b.count).fill(255);
    this.seeds = new Float32Array(b.count);
    const lists: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
    for (let k = 0; k < b.count; k++) {
      const ci = Math.min(CHUNKS - 1, Math.max(0, Math.floor((b.x[k] + HALF) / CHUNK_SIZE)));
      const cj = Math.min(CHUNKS - 1, Math.max(0, Math.floor((b.z[k] + HALF) / CHUNK_SIZE)));
      lists[cj * CHUNKS + ci].push(k);
      this.seeds[k] = ((k * 2654435761) % 1000) / 1000;
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const prism = makeRoofGeometry();
    const color = new THREE.Color();
    lists.forEach((ids, idx) => {
      const n = ids.length;
      if (!n) return;
      const body = new THREE.InstancedMesh(box, this.material, n);
      body.castShadow = true;
      body.receiveShadow = true;
      const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      const aStyle = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
      const aOverlay = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      aInfo.setUsage(THREE.DynamicDrawUsage);
      aStyle.setUsage(THREE.DynamicDrawUsage);
      aOverlay.setUsage(THREE.DynamicDrawUsage);
      body.geometry = box.clone();
      body.geometry.setAttribute('aInfo', aInfo);
      body.geometry.setAttribute('aStyle', aStyle);
      body.geometry.setAttribute('aOverlay', aOverlay);
      const roofIds = ids.filter((k) => b.type[k] === BType.House);
      let roof: THREE.InstancedMesh | null = null;
      if (roofIds.length) {
        roof = new THREE.InstancedMesh(prism.clone(), this.roofMaterial, roofIds.length);
        roof.castShadow = true;
        roof.receiveShadow = true;
        const rInfo = new THREE.InstancedBufferAttribute(new Float32Array(roofIds.length * 4), 4);
        const rStyle = new THREE.InstancedBufferAttribute(new Float32Array(roofIds.length * 4), 4);
        const rOverlay = new THREE.InstancedBufferAttribute(new Float32Array(roofIds.length * 3), 3);
        roof.geometry.setAttribute('aInfo', rInfo);
        roof.geometry.setAttribute('aStyle', rStyle);
        roof.geometry.setAttribute('aOverlay', rOverlay);
      }
      const roofSlot = new Int32Array(n).fill(-1);
      const cx = ((idx % CHUNKS) + 0.5) * CHUNK_SIZE - HALF;
      const cz = (Math.floor(idx / CHUNKS) + 0.5) * CHUNK_SIZE - HALF;
      const chunk: Chunk = { body, roof, ids, roofIds, roofSlot, center: new THREE.Vector3(cx, 30, cz) };
      let r = 0;
      ids.forEach((k, slot) => {
        this.chunkOf[k] = this.chunks.length;
        this.slotOf[k] = slot;
        const style = b.style[k];
        const pal = STYLE_COLORS[style] ?? STYLE_COLORS[1];
        color.set(pal[Math.floor(this.seeds[k] * pal.length) % pal.length]);
        body.setColorAt(slot, color);
        aStyle.setXYZW(slot, style, FLOOR_H[style] ?? 3.5, 0, 0);
        aInfo.setXYZW(slot, 1, 0, 0, this.seeds[k]);
        if (b.type[k] === BType.House && roof) {
          roofSlot[slot] = r;
          color.set(ROOF_COLORS[Math.floor(this.seeds[k] * 7) % ROOF_COLORS.length]);
          roof.setColorAt(r, color);
          (roof.geometry.getAttribute('aStyle') as THREE.InstancedBufferAttribute).setXYZW(r, 7, 3, 0, 0);
          (roof.geometry.getAttribute('aInfo') as THREE.InstancedBufferAttribute).setXYZW(r, 1, 0, 0, this.seeds[k]);
          r++;
        }
        this.writeMatrix(chunk, slot, k, 0);
      });
      body.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      body.computeBoundingSphere();
      body.userData = { kind: 'buildings', chunk: this.chunks.length };
      this.group.add(body);
      if (roof) {
        roof.instanceMatrix.needsUpdate = true;
        if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
        roof.computeBoundingSphere();
        roof.userData = { kind: 'roofs', chunk: this.chunks.length };
        this.group.add(roof);
      }
      this.chunks.push(chunk);
    });
  }

  private patch(shader: THREE.WebGLProgramParametersWithUniforms, facade: boolean) {
    Object.assign(shader.uniforms, this.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aInfo;
        attribute vec4 aStyle;
        attribute vec3 aOverlay;
        uniform sampler2D uShake;
        uniform float uShakeGain;
        uniform float uTime;
        uniform float uWorld;
        varying vec4 vInfo;
        varying vec4 vStyle;
        varying vec3 vOverlay;
        varying vec3 vLocal;
        varying vec3 vScale;
        varying vec3 vWN;
        varying vec3 vWP;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = vec4(transformed, 1.0);
        mat4 imx = instanceMatrix;
        vec4 wp = modelMatrix * imx * mvPosition;
        float hgt = clamp(position.y, 0.0, 1.0);
        vec3 sc = vec3(length(imx[0].xyz), length(imx[1].xyz), length(imx[2].xyz));
        vec2 suv = clamp(imx[3].xz / uWorld + 0.5, 0.0, 1.0);
        float sh = texture2D(uShake, suv).r;
        float sway = sh * uShakeGain * hgt * hgt * min(sc.y, 180.0) * 0.012;
        wp.x += sway * sin(uTime * (7.0 + aInfo.w * 5.0));
        wp.z += sway * cos(uTime * (6.1 + aInfo.w * 4.0));
        vInfo = aInfo;
        vStyle = aStyle;
        vOverlay = aOverlay;
        vLocal = position;
        vScale = sc;
        vWN = normalize(mat3(modelMatrix * imx) * objectNormal);
        vWP = wp.xyz;
        mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uNight;
        varying vec4 vInfo;
        varying vec4 vStyle;
        varying vec3 vOverlay;
        varying vec3 vLocal;
        varying vec3 vScale;
        varying vec3 vWN;
        varying vec3 vWP;
        ${HASH_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float style = vStyle.x;
        float damage = vInfo.y;
        float fire = vInfo.z;
        float power = vInfo.x;
        float side = 1.0 - step(0.5, abs(vWN.y));
        float win = 0.0;
        float lit = 0.0;
        float winAA = 1.0;
        vec2 wid = vec2(0.0);
        ${
          facade
            ? `
        if (side > 0.5) {
          float fu = abs(vWN.x) > 0.5 ? (vLocal.z + 0.5) * vScale.z : (vLocal.x + 0.5) * vScale.x;
          float fv = vLocal.y * vScale.y;
          float floorH = vStyle.y;
          float winW = style < 0.5 || style > 3.5 && style < 4.5 ? 2.2 : style > 5.5 ? 3.4 : 3.0;
          vec2 cc = vec2(fu / winW, fv / floorH);
          vec2 f = fract(cc);
          wid = floor(cc);
          float fillX = style < 0.5 || (style > 3.5 && style < 4.5) ? 0.9 : style > 2.5 && style < 3.5 ? 0.5 : 0.62;
          float fillY = style < 0.5 || (style > 3.5 && style < 4.5) ? 0.82 : 0.55;
          float wx = step(0.5 - fillX * 0.5, f.x) * step(f.x, 0.5 + fillX * 0.5);
          float wy = step(0.5 - fillY * 0.5, f.y) * step(f.y, 0.5 + fillY * 0.5);
          win = wx * wy;
          if (style > 2.5 && style < 3.5) win *= step(0.62, f.y) * step(mod(wid.y, 2.0), 0.5); // industrial clerestory band
          if (fv < 1.2 || fv > vScale.y - 0.8) win = 0.0;
          float aa = clamp(1.6 - max(fwidth(cc.x), fwidth(cc.y)) * 2.2, 0.0, 1.0);
          winAA = aa;
          float avgCover = fillX * fillY * 0.8;
          win = mix(avgCover, win, aa);
          float rnd = hash12(wid + vInfo.w * 173.0 + (abs(vWN.x) > 0.5 ? 31.0 : 0.0));
          float occupancy = style > 5.5 ? 0.55 : style > 2.5 && style < 3.5 ? 0.25 : style > 4.5 && style < 5.5 ? 0.6 : 0.45;
          lit = step(1.0 - occupancy, rnd);
          lit = mix(occupancy, lit, aa);
          vec3 glass = style < 0.5 || (style > 3.5 && style < 4.5) ? vec3(0.11, 0.16, 0.22) : vec3(0.08, 0.09, 0.1);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.85);
        }`
            : ''
        }
        // roofs: darker, with a little texture
        if (side < 0.5 && vWN.y > 0.5) diffuseColor.rgb *= 0.72 + 0.2 * vnoise(vWP.xz * 0.35);
        // damage soot and dust
        diffuseColor.rgb *= 1.0 - 0.55 * clamp(damage, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vOverlay, vStyle.z);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, win * (style < 0.5 || (style > 3.5 && style < 4.5) ? 1.0 : 0.6));`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.55, win * (style < 0.5 || (style > 3.5 && style < 4.5) ? 1.0 : 0.2));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), step(0.7, hash12(wid * 1.7 + vInfo.w * 11.0)) * step(style, 0.5));
        // unresolved (distant) windows average out; keep their summed glow modest so
        // facades read as lit windows rather than uniformly glowing slabs
        totalEmissiveRadiance += warm * win * lit * uNight * power * (1.0 - damage) * mix(0.35, 1.35, winAA);
        // landmark crown lighting
        if (style > 3.5 && style < 4.5) totalEmissiveRadiance += vec3(0.4, 0.75, 1.0) * uNight * power * step(0.94, vLocal.y) * 1.1;
        // fire glow: lower floors flicker orange
        float flick = 0.65 + 0.35 * sin(uTime * 17.0 + vWP.y * 0.4 + vInfo.w * 30.0) * sin(uTime * 7.3 + vWP.x);
        totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * fire * flick * (1.2 - clamp(vLocal.y, 0.0, 1.0)) * 2.2;
        // analysis tint and selection
        totalEmissiveRadiance += vOverlay * vStyle.z * 0.3;
        float rim = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
        totalEmissiveRadiance += vec3(0.35, 0.85, 1.0) * vStyle.w * (0.35 + 0.65 * rim);`,
      );
  }

  private writeMatrix(chunk: Chunk, slot: number, k: number, ds: number) {
    const b = this.city.buildings;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const seed = this.seeds[k];
    const isHouse = b.type[k] === BType.House;
    let h = isHouse ? b.h[k] * 0.66 : b.h[k];
    let w = b.w[k];
    let d = b.d[k];
    if (ds >= 4) {
      h = Math.min(7, Math.max(2.2, b.h[k] * 0.12));
      w *= 1.25;
      d *= 1.25;
      q.setFromEuler(new THREE.Euler((seed - 0.5) * 0.18, seed * 3, (0.5 - seed) * 0.16));
    } else if (ds === 3) {
      q.setFromEuler(new THREE.Euler((seed - 0.5) * 0.07, 0, (seed * 7 % 1 - 0.5) * 0.07));
      h *= 0.97;
    }
    p.set(b.x[k], b.baseY[k], b.z[k]);
    s.set(w, h, d);
    m.compose(p, q, s);
    chunk.body.setMatrixAt(slot, m);
    const rs = chunk.roofSlot[slot];
    if (rs >= 0 && chunk.roof) {
      const rh = b.h[k] * 0.34 + 1.2;
      const alongX = w >= d;
      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, alongX ? 0 : Math.PI / 2, 0));
      rq.premultiply(q);
      const rp = new THREE.Vector3(0, h, 0).applyQuaternion(q).add(p);
      const rsz = ds >= 4 ? new THREE.Vector3(0.001, 0.001, 0.001) : new THREE.Vector3((alongX ? w : d) + 0.8, rh, (alongX ? d : w) + 0.8);
      m.compose(rp, rq, rsz);
      chunk.roof.setMatrixAt(rs, m);
    }
  }

  setTint(t: BuildingTint) {
    if (t === this.tint) return;
    this.tint = t;
    this.lastState.fill(255); // force re-evaluation on next frame
  }

  setSelected(k: number) {
    const prev = this.selected;
    this.selected = k;
    for (const b of [prev, k]) {
      if (b < 0) continue;
      const chunk = this.chunks[this.chunkOf[b]];
      const slot = this.slotOf[b];
      const st = chunk.body.geometry.getAttribute('aStyle') as THREE.InstancedBufferAttribute;
      st.setW(slot, b === k ? 1 : 0);
      st.needsUpdate = true;
    }
  }

  /** Applies a simulation frame; only changed instances are rewritten. */
  applyFrame(f: Frame, assetPower: (asset: number) => number) {
    const b = this.city.buildings;
    const tint = this.tint;
    const col = new THREE.Color();
    const dirty = new Set<number>();
    const matrixDirty = new Set<number>();
    for (let k = 0; k < b.count; k++) {
      let st = f.bState[k];
      if (b.asset[k] >= 0) st = (st & ~16) | (assetPower(b.asset[k]) ? 16 : 0);
      if (st === this.lastState[k]) continue;
      const prev = this.lastState[k];
      this.lastState[k] = st;
      const ci = this.chunkOf[k];
      const chunk = this.chunks[ci];
      const slot = this.slotOf[k];
      const ds = st & 7;
      if (prev === 255 || (prev & 7) !== ds) {
        this.writeMatrix(chunk, slot, k, ds);
        matrixDirty.add(ci);
      }
      const info = chunk.body.geometry.getAttribute('aInfo') as THREE.InstancedBufferAttribute;
      const style = chunk.body.geometry.getAttribute('aStyle') as THREE.InstancedBufferAttribute;
      const ov = chunk.body.geometry.getAttribute('aOverlay') as THREE.InstancedBufferAttribute;
      const powered = st & 16 ? 1 : 0;
      const burning = st & 8 ? 1 : 0;
      info.setXYZ(slot, powered, Math.min(1, f.bDamage[k] * 1.3), burning);
      let mix = 0;
      if (tint === 'damage') {
        mix = 0.85;
        damageColor(ds, col);
      } else if (tint === 'power') {
        mix = 0.8;
        col.set(powered ? '#35c7e8' : '#3a2f35');
        if (!powered) col.set('#7a2c3a');
      }
      ov.setXYZ(slot, col.r, col.g, col.b);
      style.setZ(slot, mix);
      dirty.add(ci);
      const rs = chunk.roofSlot[slot];
      if (rs >= 0 && chunk.roof) {
        const ri = chunk.roof.geometry.getAttribute('aInfo') as THREE.InstancedBufferAttribute;
        const rst = chunk.roof.geometry.getAttribute('aStyle') as THREE.InstancedBufferAttribute;
        const rov = chunk.roof.geometry.getAttribute('aOverlay') as THREE.InstancedBufferAttribute;
        ri.setXYZ(rs, powered, Math.min(1, f.bDamage[k] * 1.3), burning);
        rov.setXYZ(rs, col.r, col.g, col.b);
        rst.setZ(rs, mix);
      }
    }
    for (const ci of dirty) {
      const ch = this.chunks[ci];
      for (const name of ['aInfo', 'aStyle', 'aOverlay']) {
        (ch.body.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
        if (ch.roof) (ch.roof.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
    }
    for (const ci of matrixDirty) {
      const ch = this.chunks[ci];
      ch.body.instanceMatrix.needsUpdate = true;
      ch.body.computeBoundingSphere();
      if (ch.roof) {
        ch.roof.instanceMatrix.needsUpdate = true;
        ch.roof.computeBoundingSphere();
      }
    }
    // shaking field for sway
    const sd = this.shakeData;
    let any = false;
    for (let c = 0; c < N_CELLS; c++) {
      const v = Math.min(255, f.shaking[c] * 255);
      if (v > 0) any = true;
      sd[c * 4] = v;
    }
    if (any || this.uniforms.uShakeGain.value > 0) this.shakeTex.needsUpdate = true;
  }

  /** Building index from a raycast hit on a chunk mesh. */
  buildingFromHit(obj: THREE.Object3D, instanceId: number): number {
    const ud = obj.userData as { kind?: string; chunk?: number };
    if (ud.chunk === undefined) return -1;
    const ch = this.chunks[ud.chunk];
    if (ud.kind === 'buildings') return ch.ids[instanceId] ?? -1;
    if (ud.kind === 'roofs') return ch.roofIds[instanceId] ?? -1;
    return -1;
  }

  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const c of this.chunks) {
      out.push(c.body);
      if (c.roof) out.push(c.roof);
    }
    return out;
  }
}

export function damageColor(ds: number, out: THREE.Color): THREE.Color {
  return out.set(DAMAGE_COLORS[ds] ?? DAMAGE_COLORS[0]);
}

function makeRoofGeometry(): THREE.BufferGeometry {
  // Unit gabled roof: base 1x1 at y=0, ridge along x at y=1.
  const v = [
    // two slopes
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
    0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
    // gable ends
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
