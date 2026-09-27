import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID, cellX, cellZ } from '../sim/config';
import type { Asset, City, Frame } from '../sim/types';
import type { HeightField } from './heightfield';

const STATUS_COLORS = { ok: new THREE.Color('#3fd0a0'), backup: new THREE.Color('#ffb020'), down: new THREE.Color('#ff3b4f'), idle: new THREE.Color('#4a5563') };

function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}
function cyl(r: number, h: number, x = 0, y = 0, z = 0, seg = 12, r2 = r): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r2, r, h, seg);
  g.translate(x, y + h / 2, z);
  return g;
}
const strip = (g: THREE.BufferGeometry) => {
  // mergeGeometries needs identical attribute sets
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  return n;
};
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map(strip))!;

/**
 * Critical infrastructure meshes with live status beacons (green = normal, amber = backup
 * power / degraded, red = down), transmission lines with pylons, and the polder levee wall
 * whose segments visibly lower when the embankment settles, erodes or breaches.
 */
export class InfraLayer {
  readonly group = new THREE.Group();
  readonly beacons: THREE.InstancedMesh;
  readonly rings: THREE.InstancedMesh;
  private beaconAssets: number[] = [];
  private lineMats: THREE.LineBasicMaterial[] = [];
  private lineObjs: THREE.LineSegments[] = [];
  private leveeMesh: THREE.InstancedMesh;
  private leveeCells: number[];
  private towerLights: THREE.InstancedMesh;
  private towerIds: number[] = [];
  private plantSmoke: THREE.Points | null = null;
  private lastLevee: Float32Array;
  readonly pickMeshes: THREE.Object3D[] = [];
  private powerLayer = false;

  constructor(private city: City, hf: HeightField) {
    const concrete = new THREE.MeshStandardMaterial({ color: '#a4a7ab', roughness: 0.85 });
    const metal = new THREE.MeshStandardMaterial({ color: '#7b848d', roughness: 0.45, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#3b4148', roughness: 0.6, metalness: 0.3 });
    const blueRoof = new THREE.MeshStandardMaterial({ color: '#3a6a8f', roughness: 0.6 });
    const white = new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.5, metalness: 0.2 });

    for (const a of city.assets) {
      const y = hf.at(a.x, a.z);
      let obj: THREE.Object3D | null = null;
      switch (a.kind) {
        case 'plant':
          obj = this.plant(concrete, metal, white);
          break;
        case 'tx':
        case 'sub':
          obj = this.substation(a.kind === 'tx' ? 1.5 : 1, concrete, metal, dark);
          break;
        case 'import': {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(pylonGeometry(48), metal));
          obj = g;
          break;
        }
        case 'pump':
          obj = this.pump(concrete, blueRoof, metal, a);
          break;
        case 'water':
          obj = this.waterworks(concrete, white, metal);
          break;
        case 'tower':
          obj = this.tower(metal, a);
          break;
        default:
          break; // buildings render hospitals, shelters, stations, exchange, EOC
      }
      if (obj) {
        obj.position.set(a.x, y, a.z);
        obj.traverse((o) => {
          o.userData = { kind: 'asset', asset: a.id };
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            this.pickMeshes.push(o);
          }
        });
        this.group.add(obj);
      }
      this.beaconAssets.push(a.id);
    }

    // Status beacons (floating diamonds) and ground rings shown with the power layer.
    const bg = new THREE.OctahedronGeometry(4, 0);
    this.beacons = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ toneMapped: false }), this.beaconAssets.length);
    const rg = new THREE.RingGeometry(30, 36, 40);
    rg.rotateX(-Math.PI / 2);
    this.rings = new THREE.InstancedMesh(rg, new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85, depthWrite: false }), this.beaconAssets.length);
    const m = new THREE.Matrix4();
    this.beaconAssets.forEach((id, k) => {
      const a = city.assets[id];
      const bh = a.building >= 0 ? city.buildings.h[a.building] + 14 : a.kind === 'tower' ? 104 : a.kind === 'plant' ? 90 : a.kind === 'import' ? 58 : 28;
      m.makeTranslation(a.x, hf.at(a.x, a.z) + bh, a.z);
      this.beacons.setMatrixAt(k, m);
      m.makeTranslation(a.x, hf.at(a.x, a.z) + 1.5, a.z);
      this.rings.setMatrixAt(k, m);
      this.beacons.setColorAt(k, STATUS_COLORS.ok);
      this.rings.setColorAt(k, STATUS_COLORS.ok);
    });
    this.beacons.computeBoundingSphere();
    this.rings.computeBoundingSphere();
    this.rings.visible = false;
    this.group.add(this.beacons, this.rings);

    // Aviation lights on cell towers.
    this.towerIds = city.assets.filter((a) => a.kind === 'tower').map((a) => a.id);
    this.towerLights = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), this.towerIds.length);
    this.towerIds.forEach((id, k) => {
      const a = city.assets[id];
      m.makeTranslation(a.x, hf.at(a.x, a.z) + 96, a.z);
      this.towerLights.setMatrixAt(k, m);
      this.towerLights.setColorAt(k, new THREE.Color(3, 0.1, 0.1));
    });
    this.group.add(this.towerLights);

    // Transmission lines: pylons + sagging conductors.
    const pylonG = pylonGeometry(36);
    let nPylons = 0;
    for (const l of city.lines) nPylons += l.points.length / 2;
    const pylons = new THREE.InstancedMesh(pylonG, metal, nPylons);
    let pi = 0;
    for (const l of city.lines) {
      const pts = l.points;
      const wire: number[] = [];
      for (let k = 0; k < pts.length; k += 2) {
        const x = pts[k];
        const z = pts[k + 1];
        const y = hf.at(x, z);
        const next = k + 2 < pts.length ? [pts[k + 2], pts[k + 3]] : [pts[k - 2], pts[k - 1]];
        const rot = Math.atan2(next[0] - x, next[1] - z);
        m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(1, 1, 1));
        pylons.setMatrixAt(pi++, m);
        if (k + 2 < pts.length) {
          const x2 = pts[k + 2];
          const z2 = pts[k + 3];
          const y2 = hf.at(x2, z2);
          const len = Math.hypot(x2 - x, z2 - z);
          const ox = ((z2 - z) / len) * 6;
          const oz = (-(x2 - x) / len) * 6;
          for (const side of [-1, 0, 1]) {
            const top = side === 0 ? 36 : 30;
            let px = x + ox * side;
            let pz = z + oz * side;
            let py = y + top;
            for (let s = 1; s <= 8; s++) {
              const u = s / 8;
              const nx = x + (x2 - x) * u + ox * side;
              const nz = z + (z2 - z) * u + oz * side;
              const ny = y + (y2 - y) * u + top - Math.sin(u * Math.PI) * 5;
              wire.push(px, py, pz, nx, ny, nz);
              px = nx;
              pz = nz;
              py = ny;
            }
          }
        }
      }
      const wg = new THREE.BufferGeometry();
      wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
      const mat = new THREE.LineBasicMaterial({ color: '#2d3238', transparent: true, opacity: 0.9 });
      const ls = new THREE.LineSegments(wg, mat);
      ls.userData = { kind: 'line', line: l.id };
      this.lineMats.push(mat);
      this.lineObjs.push(ls);
      this.group.add(ls);
    }
    pylons.castShadow = true;
    pylons.computeBoundingSphere();
    this.group.add(pylons);

    // Levee wall: one instanced block per levee cell, height follows the simulated crest.
    this.leveeCells = [];
    for (let c = 0; c < GRID * GRID; c++) if (city.leveeHeight[c] > 0) this.leveeCells.push(c);
    this.lastLevee = new Float32Array(this.leveeCells.length).fill(-1);
    const lg = new THREE.BoxGeometry(1, 1, 1);
    lg.translate(0, 0.5, 0);
    this.leveeMesh = new THREE.InstancedMesh(lg, new THREE.MeshStandardMaterial({ color: '#9c9a90', roughness: 0.9 }), this.leveeCells.length);
    this.leveeMesh.castShadow = true;
    this.leveeMesh.receiveShadow = true;
    this.leveeMesh.userData = { kind: 'levee' };
    this.group.add(this.leveeMesh);
    this.pickMeshes.push(this.leveeMesh);
  }

  private plant(concrete: THREE.Material, metal: THREE.Material, white: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(merge([box(90, 28, 44), box(40, 18, 30, -60, 0, 10), box(30, 12, 60, 55, 0, -5)]), concrete));
    g.add(new THREE.Mesh(merge([cyl(4.2, 78, -20, 0, -14, 16, 3.2), cyl(4.2, 78, 5, 0, -14, 16, 3.2)]), white));
    g.add(new THREE.Mesh(merge([cyl(9, 16, 30, 0, 28), cyl(9, 16, 52, 0, 28), box(8, 30, 8, -40, 0, -30)]), metal));
    // exhaust plume (visual only; turned off when the plant is down)
    const n = 160;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      seed[k] = Math.random();
      pos[k * 3] = k % 2 ? -20 : 5;
      pos[k * 3 + 1] = 78;
      pos[k * 3 + 2] = -14;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(3, 1) }, uLight: { value: new THREE.Color(0.8, 0.8, 0.8) } },
      vertexShader: `attribute float aSeed; uniform float uTime; uniform vec2 uWind; varying float vA;
        void main(){ float life = fract(uTime*0.05 + aSeed); vec3 p = position + vec3(uWind.x*life*40.0 + (aSeed-0.5)*6.0, life*90.0, uWind.y*life*40.0);
        vA = (1.0-life)*0.35; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = (18.0 + life*70.0) * (300.0 / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uLight; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(uLight, vA*smoothstep(0.5,0.1,d)); }`,
    });
    this.plantSmoke = new THREE.Points(pg, mat);
    this.plantSmoke.frustumCulled = false;
    g.add(this.plantSmoke);
    return g;
  }

  private substation(scale: number, concrete: THREE.Material, metal: THREE.Material, dark: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(box(46 * scale, 0.6, 40 * scale), concrete));
    const tr: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) tr.push(box(6, 5, 4, (i - 1) * 12 * scale, 0.6, (j - 0.5) * 14 * scale));
    g.add(new THREE.Mesh(merge(tr), dark));
    const gantry: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) gantry.push(box(0.8, 14, 0.8, (i - 1.5) * 12 * scale, 0.6, -16 * scale), box(0.8, 14, 0.8, (i - 1.5) * 12 * scale, 0.6, 16 * scale));
    gantry.push(box(40 * scale, 0.8, 0.8, 0, 13.5, -16 * scale), box(40 * scale, 0.8, 0.8, 0, 13.5, 16 * scale));
    g.add(new THREE.Mesh(merge(gantry), metal));
    return g;
  }

  private pump(concrete: THREE.Material, roof: THREE.Material, metal: THREE.Material, a: Asset): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(box(26, 9, 16), concrete));
    g.add(new THREE.Mesh(box(27, 1.2, 17, 0, 9), roof));
    // discharge pipes towards the sea (south)
    const seaward = this.city.levees.length ? Math.sign(this.city.levees[0].z - a.z) || 1 : 1;
    const pipes: THREE.BufferGeometry[] = [];
    for (let k = -1; k <= 1; k++) {
      const p = new THREE.CylinderGeometry(1.1, 1.1, 60, 8);
      p.rotateX(Math.PI / 2);
      p.translate(k * 5, 6, seaward * 36);
      pipes.push(p);
    }
    g.add(new THREE.Mesh(merge(pipes), metal));
    return g;
  }

  private waterworks(concrete: THREE.Material, white: THREE.Material, metal: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(box(50, 10, 26, 0, 0, -26), concrete));
    g.add(new THREE.Mesh(merge([cyl(11, 9, -24, 0, 16, 24), cyl(11, 9, 4, 0, 16, 24), cyl(11, 9, 32, 0, 16, 24)]), white));
    g.add(new THREE.Mesh(cyl(4, 26, 30, 0, -30), metal));
    return g;
  }

  private tower(metal: THREE.Material, _a: Asset): THREE.Group {
    void _a;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(cyl(2.8, 96, 0, 0, 0, 4, 0.8), metal));
    g.add(new THREE.Mesh(merge([box(6, 3, 1, 0, 80, 1.5), box(1, 3, 6, 1.5, 84, 0), box(6, 3, 1, 0, 88, -1.5)]), metal));
    return g;
  }

  setPowerLayer(on: boolean) {
    this.powerLayer = on;
    this.rings.visible = on;
    for (const m of this.lineMats) m.color.set(on ? '#3ad6ff' : '#2d3238');
  }

  applyFrame(f: Frame, night: number, time: number) {
    const col = new THREE.Color();
    this.beaconAssets.forEach((id, k) => {
      const a = f.assets[id];
      const s = !a ? STATUS_COLORS.idle : a.status === 0 ? STATUS_COLORS.down : a.status === 1 || a.onBackup ? STATUS_COLORS.backup : STATUS_COLORS.ok;
      col.copy(s).multiplyScalar(1.4 + night * 1.6);
      this.beacons.setColorAt(k, col);
      this.rings.setColorAt(k, s);
    });
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    // conductors: damaged or de-energised lines
    this.city.lines.forEach((l, k) => {
      const damaged = f.lines[l.id] === 1;
      const live = f.assets[l.a]?.energized && !damaged;
      const mat = this.lineMats[k];
      if (damaged) mat.color.set('#ff3b4f');
      else if (this.powerLayer) mat.color.set(live ? '#3ad6ff' : '#5a6270');
      else mat.color.set('#2d3238');
    });
    // aviation lights blink where the tower is up
    const blink = Math.sin(time * 3.2) > 0.2 ? 1 : 0.15;
    this.towerIds.forEach((id, k) => {
      const up = f.assets[id]?.status > 0;
      this.towerLights.setColorAt(k, col.setRGB(up ? 3 * blink : 0.05, up ? 0.08 * blink : 0.02, up ? 0.06 * blink : 0.02));
    });
    if (this.towerLights.instanceColor) this.towerLights.instanceColor.needsUpdate = true;
    // plant plume only while generating
    const plant = this.city.assets.find((a) => a.kind === 'plant');
    if (this.plantSmoke && plant) this.plantSmoke.visible = (f.assets[plant.id]?.status ?? 0) > 0;
    // levee wall height
    const m = new THREE.Matrix4();
    let changed = false;
    this.leveeCells.forEach((c, k) => {
      const h = f.levee[c];
      if (Math.abs(h - this.lastLevee[k]) < 0.01) return;
      this.lastLevee[k] = h;
      changed = true;
      const x = cellX(c % GRID);
      const z = cellZ(Math.floor(c / GRID));
      const base = this.city.terrain[c] - f.settlement[c];
      m.compose(new THREE.Vector3(x, base - 1, z), new THREE.Quaternion(), new THREE.Vector3(33, Math.max(0.05, h + 1), 33));
      this.leveeMesh.setMatrixAt(k, m);
    });
    if (changed) {
      this.leveeMesh.instanceMatrix.needsUpdate = true;
      this.leveeMesh.computeBoundingSphere();
    }
  }

  animate(time: number, wind: THREE.Vector2) {
    if (this.plantSmoke) {
      const u = (this.plantSmoke.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = time;
      u.uWind.value.copy(wind).multiplyScalar(0.15);
    }
  }

  leveeCell(instanceId: number): number {
    return this.leveeCells[instanceId] ?? -1;
  }
}

export function pylonGeometry(h: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const legs = [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ];
  for (const [x, z] of legs) {
    const g = new THREE.BoxGeometry(0.6, h, 0.6);
    g.translate(0, h / 2, 0);
    // taper legs towards the top
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h;
      p.setX(i, p.getX(i) + x * (1 - t * 0.8));
      p.setZ(i, p.getZ(i) + z * (1 - t * 0.8));
    }
    parts.push(g);
  }
  parts.push(box(16, 0.8, 1, 0, h - 6, 0), box(12, 0.8, 1, 0, h - 1, 0), box(1.2, 1.2, 1.2, 0, h, 0));
  for (let k = 1; k < 5; k++) parts.push(box(6 - k * 0.9, 0.4, 0.4, 0, (h * k) / 5.5, 3 - k * 0.5), box(6 - k * 0.9, 0.4, 0.4, 0, (h * k) / 5.5, -3 + k * 0.5));
  const g = merge(parts);
  g.computeVertexNormals();
  return g;
}
