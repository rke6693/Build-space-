import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, GRID, HALF, N_CELLS, cellX, cellZ } from '../sim/config';
import { TerrainModel } from '../sim/city/terrainModel';
import { Rng } from '../sim/rng';
import { type City, Zone } from '../sim/types';
import type { HeightField } from './heightfield';

const clean = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
};

/** Trees, harbour cranes, container stacks, ships and tank farms (visual context). */
export class PropsLayer {
  readonly group = new THREE.Group();
  private treeChunks: { mesh: THREE.InstancedMesh; cells: Int32Array; center: THREE.Vector3; baseColors: Float32Array }[] = [];
  private lastBurned = new Uint8Array(N_CELLS);

  constructor(private city: City, hf: HeightField, treeScale: number) {
    const rng = Rng.stream(city.seed, 'props');
    this.buildTrees(hf, rng, treeScale);
    this.buildHarbor(hf, rng);
  }

  private buildTrees(hf: HeightField, rng: Rng, scale: number) {
    const city = this.city;
    const foliage = new THREE.IcosahedronGeometry(1, 0);
    foliage.scale(1, 1.25, 1);
    foliage.translate(0, 1.6, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.1, 5);
    trunk.translate(0, 0.55, 0);
    const geo = mergeGeometries([clean(foliage), clean(trunk)])!;
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const CH = 4;
    const per: { x: number; y: number; z: number; s: number; c: number; col: THREE.Color }[][] = Array.from({ length: CH * CH }, () => []);
    const greens = ['#2f5a2b', '#3d6b33', '#27492a', '#4a7a3a', '#35602f'].map((c) => new THREE.Color(c));
    for (let c = 0; c < N_CELLS; c++) {
      const z = city.zone[c];
      let n = 0;
      if (z === Zone.Forest) n = 7;
      else if (z === Zone.Park) n = 4;
      else if (z === Zone.Residential && !city.road[c]) n = rng.chance(0.55) ? 1 : 0;
      else if (z === Zone.Shore && city.leveeHeight[c] === 0) n = rng.chance(0.2) ? 1 : 0;
      n = Math.round(n * scale + (rng.next() < (n * scale) % 1 ? 1 : 0));
      if (city.road[c]) n = 0;
      for (let k = 0; k < n; k++) {
        const x = cellX(c % GRID) + (rng.next() - 0.5) * CELL * 0.9;
        const zz = cellZ((c / GRID) | 0) + (rng.next() - 0.5) * CELL * 0.9;
        const y = hf.at(x, zz);
        if (y < 0.5) continue;
        const s = (z === Zone.Forest ? 6 : 4.5) * (0.7 + rng.next() * 0.7);
        const ci = Math.min(CH - 1, Math.floor((x + HALF) / (2 * HALF / CH)));
        const cj = Math.min(CH - 1, Math.floor((zz + HALF) / (2 * HALF / CH)));
        per[cj * CH + ci].push({ x, y, z: zz, s, c, col: greens[rng.int(greens.length)] });
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    per.forEach((list, idx) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const cells = new Int32Array(list.length);
      const baseColors = new Float32Array(list.length * 3);
      list.forEach((t, k) => {
        q.setFromEuler(new THREE.Euler(0, t.s * 7.1, 0));
        m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * 0.55, t.s, t.s * 0.55));
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, t.col);
        cells[k] = t.c;
        baseColors.set([t.col.r, t.col.g, t.col.b], k * 3);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      const cx = ((idx % CH) + 0.5) * (2 * HALF / CH) - HALF;
      const cz = (Math.floor(idx / CH) + 0.5) * (2 * HALF / CH) - HALF;
      this.treeChunks.push({ mesh, cells, center: new THREE.Vector3(cx, 20, cz), baseColors });
      this.group.add(mesh);
    });
  }

  private buildHarbor(hf: HeightField, rng: Rng) {
    const city = this.city;
    const tm = hf.tm;
    // Containers on piers and port cells next to water.
    const spots: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const palette = ['#b83a2e', '#2e5f9a', '#1f7a6d', '#d38a2a', '#e1e1dc', '#6a3f8a', '#8a8f2e'].map((c) => new THREE.Color(c));
    for (let c = 0; c < N_CELLS; c++) {
      if (city.zone[c] !== Zone.Port || city.road[c]) continue;
      const x0 = cellX(c % GRID);
      const z0 = cellZ((c / GRID) | 0);
      const onPier = tm.inPier(x0, z0);
      if (!onPier && rng.next() > 0.35) continue;
      if (!onPier && city.buildings && hasBuilding(city, c)) continue;
      const y0 = hf.at(x0, z0);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          const stack = 1 + rng.int(4);
          for (let s = 0; s < stack; s++) {
            const m = new THREE.Matrix4().compose(
              new THREE.Vector3(x0 - 7 + col * 14, y0 + 1.3 + s * 2.6, z0 - 9 + row * 9),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, onPier ? Math.PI / 2 : 0, 0)),
              new THREE.Vector3(12.2, 2.55, 2.45),
            );
            spots.push(m);
            colors.push(palette[rng.int(palette.length)]);
          }
        }
      }
    }
    if (spots.length) {
      const g = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 }), spots.length);
      spots.forEach((m, k) => {
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, colors[k]);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    // Gantry cranes along each pier.
    const craneMat = new THREE.MeshStandardMaterial({ color: '#c8452f', roughness: 0.5, metalness: 0.4 });
    const crane = craneGeometry();
    const cranes: THREE.Matrix4[] = [];
    for (const px of TerrainModel.PIERS) {
      const zTop = tm.baseCoast(px);
      for (let k = 0; k < 3; k++) {
        for (const side of [-1, 1]) {
          const z = zTop + 60 + k * 90;
          const x = px + side * 44;
          if (tm.inland(x, z) > -5 && !tm.inPier(px, z)) continue;
          cranes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 3.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, side > 0 ? 0 : Math.PI, 0)), new THREE.Vector3(1, 1, 1)));
        }
      }
    }
    if (cranes.length) {
      const mesh = new THREE.InstancedMesh(crane, craneMat, cranes.length);
      cranes.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
    // Two container ships moored in the basin.
    const hull = new THREE.MeshStandardMaterial({ color: '#23313d', roughness: 0.7 });
    const deckMat = new THREE.MeshStandardMaterial({ color: '#e9ecef', roughness: 0.6 });
    for (let k = 0; k < 2; k++) {
      const px = (TerrainModel.PIERS[k] + TerrainModel.PIERS[k + 1]) / 2;
      const z = tm.baseCoast(px) + 170;
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 210), hull);
      h.position.y = 1;
      g.add(h);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(28, 18, 14), deckMat);
      bridge.position.set(0, 16, -88);
      g.add(bridge);
      const cont = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 150), new THREE.MeshStandardMaterial({ color: k ? '#2e5f9a' : '#b83a2e', roughness: 0.6 }));
      cont.position.set(0, 12, 10);
      g.add(cont);
      g.position.set(px, 0, z);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      this.group.add(g);
    }
    // Tank farm in the industrial belt.
    const tanks: THREE.Matrix4[] = [];
    for (let c = 0; c < N_CELLS; c++) {
      if (city.zone[c] !== Zone.Industrial || city.road[c] || hasBuilding(city, c)) continue;
      if (rng.next() > 0.6) continue;
      const x = cellX(c % GRID);
      const z = cellZ((c / GRID) | 0);
      tanks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, hf.at(x, z), z), new THREE.Quaternion(), new THREE.Vector3(1, 0.8 + rng.next() * 0.6, 1)));
    }
    if (tanks.length) {
      const tg = new THREE.CylinderGeometry(11, 11, 14, 20);
      tg.translate(0, 7, 0);
      const mesh = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#d6d8d4', roughness: 0.45, metalness: 0.5 }), tanks.length);
      tanks.forEach((m, k) => mesh.setMatrixAt(k, m));
      mesh.castShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  /** Char trees in burnt cells; hide distant tree chunks (LOD). */
  update(burned: Uint8Array | null, burn: Float32Array | null, camera: THREE.Camera, maxDist: number) {
    for (const ch of this.treeChunks) ch.mesh.visible = camera.position.distanceTo(ch.center) < maxDist;
    if (!burned || !burn) return;
    let changed = false;
    for (let c = 0; c < N_CELLS; c++) {
      const v = burned[c] || burn[c] > 0.3 ? 1 : 0;
      if (v !== this.lastBurned[c]) {
        this.lastBurned[c] = v;
        changed = true;
      }
    }
    if (!changed) return;
    const col = new THREE.Color();
    for (const ch of this.treeChunks) {
      let any = false;
      for (let k = 0; k < ch.cells.length; k++) {
        const b = this.lastBurned[ch.cells[k]];
        if (b) col.setRGB(0.06, 0.05, 0.045);
        else col.setRGB(ch.baseColors[k * 3], ch.baseColors[k * 3 + 1], ch.baseColors[k * 3 + 2]);
        ch.mesh.setColorAt(k, col);
        any = true;
      }
      if (any && ch.mesh.instanceColor) ch.mesh.instanceColor.needsUpdate = true;
    }
  }
}

let cellHasBuilding: Uint8Array | null = null;
function hasBuilding(city: City, c: number): boolean {
  if (!cellHasBuilding) {
    cellHasBuilding = new Uint8Array(N_CELLS);
    for (let k = 0; k < city.buildings.count; k++) cellHasBuilding[city.buildings.cell[k]] = 1;
  }
  return cellHasBuilding[c] === 1;
}

function craneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y + h / 2, z);
    parts.push(clean(g));
  };
  for (const x of [-9, 9]) for (const z of [-7, 7]) add(1.6, 46, 1.6, x, 0, z);
  add(20, 2, 16, 0, 44, 0);
  add(4, 2.4, 95, 0, 46, 20);
  add(8, 6, 10, 0, 40, -12);
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return g;
}
