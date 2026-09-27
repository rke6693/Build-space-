import * as THREE from 'three';
import { GRID } from '../sim/config';
import { RoadKind, type City, type Frame } from '../sim/types';
import type { HeightField } from './heightfield';

const WIDTH: Record<number, number> = { [RoadKind.Street]: 13, [RoadKind.Arterial]: 21, [RoadKind.Bridge]: 20 };

/**
 * Road network as terrain-following ribbons (one per graph edge) plus intersection pads.
 * Edge status (open / congested / closed) is written to a 1-row texture that the road
 * shader reads when the Roads layer is active. Bridge spans are built separately so they
 * can collapse.
 */
export class RoadLayer {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private statusData: Uint8Array;
  private statusTex: THREE.DataTexture;
  readonly uniforms = { uStatus: { value: null as unknown as THREE.DataTexture }, uStatusOn: { value: 0 }, uEdgeCount: { value: 1 }, uWet: { value: 0 }, uNight: { value: 0 } };
  readonly lights: THREE.InstancedMesh;
  private lightSub: Int16Array;
  private lastLight = -1;
  private bridgeGroups: THREE.Group[] = [];
  private bridgeState: number[] = [];

  constructor(private city: City, private hf: HeightField) {
    const g = city.roads;
    this.statusData = new Uint8Array(Math.max(1, g.edgeCount) * 4);
    this.statusTex = new THREE.DataTexture(this.statusData, Math.max(1, g.edgeCount), 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.statusTex.needsUpdate = true;
    this.uniforms.uStatus.value = this.statusTex;
    this.uniforms.uEdgeCount.value = g.edgeCount;

    this.material = new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.86, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aRoad;\nvarying vec4 vRoad;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRoad = aRoad;`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uStatus;
          uniform float uStatusOn;
          uniform float uEdgeCount;
          uniform float uWet;
          uniform float uNight;
          varying vec4 vRoad;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float kind = vRoad.x;
          float u = vRoad.y;
          float v = vRoad.z;
          float edge = vRoad.w;
          if (kind < 1.5) diffuseColor.rgb *= 1.12;
          float mark = 0.0;
          if (kind > 1.5 && edge >= 0.0) {
            mark += step(abs(u - 0.5), 0.018) * step(fract(v / 12.0), 0.55);
            mark += step(abs(u - 0.06), 0.012) + step(abs(u - 0.94), 0.012);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.74, 0.6), clamp(mark, 0.0, 1.0) * 0.8);
          diffuseColor.rgb *= 1.0 - 0.3 * uWet;
          vec3 stc = vec3(0.0);
          float sta = 0.0;
          if (uStatusOn > 0.5 && edge >= 0.0) {
            vec4 st = texture2D(uStatus, vec2((edge + 0.5) / uEdgeCount, 0.5));
            stc = st.rgb;
            sta = st.a;
            diffuseColor.rgb = mix(diffuseColor.rgb, stc, sta * 0.9);
          }`,
        )
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.25, uWet);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += stc * sta * 0.55 * uStatusOn;\ntotalEmissiveRadiance += vec3(0.9, 0.6, 0.3) * 0.035 * uNight * step(1.5, kind);`);
    };

    this.group.add(this.buildRibbons());
    const { mesh, sub } = this.buildStreetlights();
    this.lights = mesh;
    this.lightSub = sub;
    this.group.add(mesh);
    for (const br of city.bridges) {
      const grp = new THREE.Group();
      this.bridgeGroups.push(grp);
      this.bridgeState.push(-1);
      this.group.add(grp);
      this.buildBridge(br.id, 0);
    }
  }

  private roadY(x: number, z: number, half: number, dirX: boolean): number {
    const hf = this.hf;
    const a = hf.at(x, z);
    const b = dirX ? hf.at(x, z - half) : hf.at(x - half, z);
    const c = dirX ? hf.at(x, z + half) : hf.at(x + half, z);
    return Math.max(a, b, c) + 0.3;
  }

  private buildRibbons(): THREE.Mesh {
    const city = this.city;
    const g = city.roads;
    const pos: number[] = [];
    const road: number[] = [];
    const idx: number[] = [];
    const nodeW = new Float32Array(g.nodeCount);
    for (let e = 0; e < g.edgeCount; e++) {
      const w = WIDTH[g.edgeKind[e]] ?? 13;
      nodeW[g.edgeA[e]] = Math.max(nodeW[g.edgeA[e]], w);
      nodeW[g.edgeB[e]] = Math.max(nodeW[g.edgeB[e]], w);
    }
    const quad = (base: number) => idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    for (let e = 0; e < g.edgeCount; e++) {
      if (g.edgeKind[e] === RoadKind.Bridge) continue; // bridges are separate meshes
      const a = g.edgeA[e];
      const b = g.edgeB[e];
      const ax = g.nodeX[a];
      const az = g.nodeZ[a];
      const bx = g.nodeX[b];
      const bz = g.nodeZ[b];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const w = WIDTH[g.edgeKind[e]] ?? 13;
      const t0 = nodeW[a] / 2;
      const t1 = len - nodeW[b] / 2;
      if (t1 <= t0) continue;
      const nseg = Math.max(1, Math.ceil((t1 - t0) / 14));
      const px = -dz * (w / 2);
      const pz = dx * (w / 2);
      const dirX = Math.abs(dx) > 0.5;
      for (let k = 0; k <= nseg; k++) {
        const t = t0 + ((t1 - t0) * k) / nseg;
        const x = ax + dx * t;
        const z = az + dz * t;
        const y = this.roadY(x, z, w / 2, dirX);
        const base = pos.length / 3;
        pos.push(x + px, y, z + pz, x - px, y, z - pz);
        road.push(g.edgeKind[e], 0, t, e, g.edgeKind[e], 1, t, e);
        if (k > 0) quad(base - 2);
      }
    }
    // intersection pads
    for (let n = 0; n < g.nodeCount; n++) {
      const w = nodeW[n] || 13;
      const x = g.nodeX[n];
      const z = g.nodeZ[n];
      const y = Math.max(this.hf.at(x - w / 2, z - w / 2), this.hf.at(x + w / 2, z - w / 2), this.hf.at(x - w / 2, z + w / 2), this.hf.at(x + w / 2, z + w / 2), this.hf.at(x, z)) + 0.3;
      const base = pos.length / 3;
      pos.push(x - w / 2, y, z - w / 2, x + w / 2, y, z - w / 2, x - w / 2, y, z + w / 2, x + w / 2, y, z + w / 2);
      for (let k = 0; k < 4; k++) road.push(1, 0.5, 0, -1);
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.name = 'roads';
    return mesh;
  }

  private buildStreetlights(): { mesh: THREE.InstancedMesh; sub: Int16Array } {
    const city = this.city;
    const g = city.roads;
    const spots: number[] = [];
    for (let e = 0; e < g.edgeCount; e++) {
      if (g.edgeKind[e] !== RoadKind.Arterial) continue;
      const a = g.edgeA[e];
      const b = g.edgeB[e];
      const len = g.edgeLen[e];
      const dx = (g.nodeX[b] - g.nodeX[a]) / len;
      const dz = (g.nodeZ[b] - g.nodeZ[a]) / len;
      for (let t = 18; t < len - 10; t += 42) {
        for (const side of [-1, 1]) {
          const x = g.nodeX[a] + dx * t - dz * 12 * side;
          const z = g.nodeZ[a] + dz * t + dx * 12 * side;
          spots.push(x, z);
        }
      }
    }
    const n = spots.length / 2;
    const geo = new THREE.SphereGeometry(1.1, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: true });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const sub = new Int16Array(n);
    const m = new THREE.Matrix4();
    const bl = city.buildings;
    for (let k = 0; k < n; k++) {
      const x = spots[k * 2];
      const z = spots[k * 2 + 1];
      m.makeTranslation(x, this.hf.at(x, z) + 8, z);
      mesh.setMatrixAt(k, m);
      // serving substation: from a building in the same or a neighbouring cell
      const ci = Math.floor((x + 2048) / 32);
      const cj = Math.floor((z + 2048) / 32);
      let s = -1;
      for (let r = 0; r < 4 && s < 0; r++) {
        for (let dj = -r; dj <= r && s < 0; dj++) for (let di = -r; di <= r && s < 0; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
          const c = j * GRID + i;
          const idx = this.cellFirstBuilding(c);
          if (idx >= 0) s = bl.substation[idx];
        }
      }
      sub[k] = s;
      mesh.setColorAt(k, new THREE.Color(0, 0, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.name = 'streetlights';
    return { mesh, sub };
  }

  private cellIndex: Int32Array | null = null;
  private cellFirstBuilding(c: number): number {
    if (!this.cellIndex) {
      this.cellIndex = new Int32Array(GRID * GRID).fill(-1);
      const b = this.city.buildings;
      for (let k = 0; k < b.count; k++) if (this.cellIndex[b.cell[k]] < 0) this.cellIndex[b.cell[k]] = k;
    }
    return this.cellIndex[c];
  }

  /** Street lights glow at night where their substation is energised. */
  updateLights(night: number, energized: (sub: number) => boolean) {
    const key = Math.round(night * 20);
    const col = new THREE.Color();
    let sig = key;
    for (let s = 0; s < 64; s++) sig = sig * 3 + (energized(s) ? 1 : 0);
    if (sig === this.lastLight) return;
    this.lastLight = sig;
    for (let k = 0; k < this.lightSub.length; k++) {
      const on = this.lightSub[k] < 0 || energized(this.lightSub[k]);
      col.setRGB(1.0, 0.62, 0.3).multiplyScalar(on ? 0.1 + night * 5.5 : 0.02);
      this.lights.setColorAt(k, col);
    }
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
  }

  setStatusLayer(on: boolean) {
    this.uniforms.uStatusOn.value = on ? 1 : 0;
  }

  applyFrame(f: Frame) {
    const g = this.city.roads;
    const d = this.statusData;
    for (let e = 0; e < g.edgeCount; e++) {
      const closed = f.eClosed[e];
      const occ = f.eOcc[e] / Math.max(1, g.edgeCap[e]);
      let r = 60, gg = 200, b = 120, a = 150;
      if (closed & (1 | 16)) [r, gg, b, a] = [60, 130, 255, 255];
      else if (closed & 4) [r, gg, b, a] = [255, 90, 40, 255];
      else if (closed) [r, gg, b, a] = [235, 50, 70, 255];
      else if (occ > 0.8) [r, gg, b, a] = [245, 170, 40, 235];
      else if (occ > 0.35) [r, gg, b, a] = [220, 215, 70, 200];
      d[e * 4] = r;
      d[e * 4 + 1] = gg;
      d[e * 4 + 2] = b;
      d[e * 4 + 3] = a;
    }
    this.statusTex.needsUpdate = true;
    for (let k = 0; k < this.city.bridges.length; k++) {
      const ds = f.bridges[k] >= 4 ? 2 : f.bridges[k] >= 3 ? 1 : 0;
      if (ds !== this.bridgeState[k]) this.buildBridge(k, ds);
    }
  }

  /** Bridge geometry: deck ribbon, girder/arch/cable-stayed structure; state 2 = collapsed. */
  private buildBridge(id: number, state: number) {
    const city = this.city;
    const br = city.bridges[id];
    const grp = this.bridgeGroups[id];
    this.bridgeState[id] = state;
    for (const c of [...grp.children]) {
      grp.remove(c);
      (c as THREE.Mesh).geometry?.dispose();
    }
    const g = city.roads;
    const e = br.edge;
    const a = g.edgeA[e];
    const b = g.edgeB[e];
    const ax = g.nodeX[a];
    const az = g.nodeZ[a];
    const bx = g.nodeX[b];
    const bz = g.nodeZ[b];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    // river span in edge coordinates
    let s0 = Infinity;
    let s1 = -Infinity;
    for (const c of br.cells) {
      const cx = (c % GRID) * 32 - 2048 + 16;
      const cz = Math.floor(c / GRID) * 32 - 2048 + 16;
      const t = (cx - ax) * dx + (cz - az) * dz;
      s0 = Math.min(s0, t - 16);
      s1 = Math.max(s1, t + 16);
    }
    const w = WIDTH[RoadKind.Bridge];
    const deck = br.deckY;
    const yAt = (t: number) => {
      const x = ax + dx * t;
      const z = az + dz * t;
      const ground = this.hf.at(x, z) + 0.3;
      if (t < s0 - 60 || t > s1 + 60) return ground;
      const mid = (s0 + s1) / 2;
      const half = (s1 - s0) / 2 + 60;
      const u = 1 - Math.min(1, Math.abs(t - mid) / half);
      const arch = deck + (br.style === 'cable' ? 2 : 1) * Math.sin(u * Math.PI * 0.5);
      return Math.max(ground, Math.min(arch, ground + (deck - ground) * Math.min(1, (half - Math.abs(t - mid) + 60) / 70)));
    };
    const concrete = new THREE.MeshStandardMaterial({ color: '#8d8f93', roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: br.style === 'cable' ? '#e8ecef' : br.style === 'arch' ? '#6b4a3a' : '#5a6068', roughness: 0.5, metalness: 0.4 });
    const pos: number[] = [];
    const road: number[] = [];
    const idx: number[] = [];
    const px = -dz * (w / 2);
    const pz = dx * (w / 2);
    const nodeTrim = 11;
    const segs: [number, number][] = state === 2 ? [[nodeTrim, s0 + 6], [s1 - 6, len - nodeTrim]] : [[nodeTrim, len - nodeTrim]];
    for (const [t0, t1] of segs) {
      const n = Math.max(2, Math.ceil((t1 - t0) / 8));
      for (let k = 0; k <= n; k++) {
        const t = t0 + ((t1 - t0) * k) / n;
        const x = ax + dx * t;
        const z = az + dz * t;
        const y = yAt(t);
        const base = pos.length / 3;
        pos.push(x + px, y, z + pz, x - px, y, z - pz);
        road.push(3, 0, t, e, 3, 1, t, e);
        if (k > 0) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('aRoad', new THREE.Float32BufferAttribute(road, 4));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const ribbon = new THREE.Mesh(rg, this.material);
    ribbon.userData = { kind: 'bridge', bridge: id };
    grp.add(ribbon);

    // deck girder under the span
    const mid = (s0 + s1) / 2;
    const spanLen = s1 - s0 + 40;
    const mx = ax + dx * mid;
    const mz = az + dz * mid;
    const rotY = Math.atan2(dx, dz);
    if (state < 2) {
      const girder = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 2.2, spanLen), concrete);
      girder.position.set(mx, deck - 1.2, mz);
      girder.rotation.y = rotY;
      girder.castShadow = true;
      girder.userData = { kind: 'bridge', bridge: id };
      grp.add(girder);
      if (state === 1) girder.rotation.z = 0.035; // visibly racked
    } else {
      // collapsed span: broken deck pieces in the river
      for (let k = 0; k < 3; k++) {
        const piece = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, spanLen / 3.2), concrete);
        const t = s0 + ((k + 0.5) / 3) * (s1 - s0);
        piece.position.set(ax + dx * t, Math.min(deck - 7, 1.2) - k * 0.6, az + dz * t);
        piece.rotation.set(0.25 * (k - 1), rotY, (k % 2 ? -1 : 1) * 0.28);
        piece.castShadow = true;
        piece.userData = { kind: 'bridge', bridge: id };
        grp.add(piece);
      }
    }
    // piers
    const nPiers = Math.max(1, Math.round((s1 - s0) / 45));
    for (let k = 1; k <= nPiers; k++) {
      const t = s0 + ((s1 - s0) * k) / (nPiers + 1);
      const x = ax + dx * t;
      const z = az + dz * t;
      const bed = this.hf.at(x, z);
      const top = state === 2 ? bed + (deck - bed) * 0.45 : deck - 2.2;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, top - bed, w * 0.7), concrete);
      pier.position.set(x, (top + bed) / 2, z);
      pier.rotation.y = rotY;
      grp.add(pier);
    }
    // superstructure
    if (br.style === 'cable') {
      const pylonH = 70;
      for (const side of [-1, 1]) {
        const t = mid + side * (s1 - s0) * 0.18;
        const x = ax + dx * t;
        const z = az + dz * t;
        for (const lat of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, pylonH, 2.2), steel);
          p.position.set(x - dz * lat * (w / 2 + 1.5), deck + pylonH / 2 - 4, z + dx * lat * (w / 2 + 1.5));
          p.rotation.y = rotY;
          p.castShadow = true;
          grp.add(p);
        }
        // stay cables
        const cable: number[] = [];
        for (let k = 1; k <= 7; k++) {
          for (const dir of [-1, 1]) {
            const tt = t + dir * k * 9;
            if (state === 2 && tt > s0 && tt < s1) continue;
            for (const lat of [-1, 1]) {
              cable.push(x - dz * lat * (w / 2 + 1.5), deck + pylonH - 8 - k * 3, z + dx * lat * (w / 2 + 1.5));
              cable.push(ax + dx * tt - dz * lat * (w / 2), yAt(tt) + 0.5, az + dz * tt + dx * lat * (w / 2));
            }
          }
        }
        const cg = new THREE.BufferGeometry();
        cg.setAttribute('position', new THREE.Float32BufferAttribute(cable, 3));
        grp.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: '#dfe6ea', transparent: true, opacity: 0.8 })));
      }
    } else if (br.style === 'arch' && state < 2) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24;
        const t = s0 - 10 + u * (s1 - s0 + 20);
        pts.push(new THREE.Vector3(ax + dx * t, deck + Math.sin(u * Math.PI) * 22, az + dz * t));
      }
      for (const lat of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(-dz * lat * (w / 2), 0, dx * lat * (w / 2)))));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 1.1, 6, false), steel);
        tube.castShadow = true;
        grp.add(tube);
      }
    } else if (state < 2) {
      // truss girder sides
      for (const lat of [-1, 1]) {
        const truss = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.5, s1 - s0 + 30), steel);
        truss.position.set(mx - dz * lat * (w / 2), deck + 2.2, mz + dx * lat * (w / 2));
        truss.rotation.y = rotY;
        grp.add(truss);
      }
    }
  }

  pickables(): THREE.Object3D[] {
    return this.bridgeGroups.flatMap((g) => g.children.filter((c) => (c as THREE.Mesh).isMesh));
  }
}
