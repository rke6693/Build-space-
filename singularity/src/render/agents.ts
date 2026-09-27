import * as THREE from 'three';
import { AgentState, type Frame } from '../sim/types';
import type { HeightField } from './heightfield';

export const AGENT_COLORS: Record<number, string> = {
  [AgentState.Inside]: '#000000',
  [AgentState.Traveling]: '#bfe6ff',
  [AgentState.Evacuating]: '#ffb020',
  [AgentState.Sheltered]: '#3fd08a',
  [AgentState.Injured]: '#ff4d5e',
  [AgentState.ToHospital]: '#ff7a8a',
  [AgentState.Hospitalized]: '#ff9fb0',
  [AgentState.Trapped]: '#d0206a',
};

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
varying float vA;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * uScale / max(1.0, -mv.z);
  gl_PointSize = clamp(s, aSize > 0.0 ? 1.6 : 0.0, 9.0);
  vA = aSize > 0.0 ? 1.0 : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  if (vA < 0.5) discard;
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor * (0.6 + core * 1.6), core);
}`;

/**
 * Citizen agents as additive glowing points (one per agent = 100 residents), coloured by
 * behavioural state. Positions are smoothed between 30 Hz simulation frames.
 */
export class AgentLayer {
  readonly points: THREE.Points;
  readonly crews: THREE.Points;
  private pos: Float32Array;
  private target: Float32Array;
  private color: Float32Array;
  private size: Float32Array;
  private crewPos: Float32Array;
  private crewTarget: Float32Array;
  private crewColor: Float32Array;
  private crewSize: Float32Array;
  private count = 0;
  private crewCount = 0;
  readonly material: THREE.ShaderMaterial;
  private first = true;
  maxDrawn = 5000;

  constructor(private hf: HeightField, maxAgents: number, maxCrews: number) {
    this.pos = new Float32Array(maxAgents * 3);
    this.target = new Float32Array(maxAgents * 3);
    this.color = new Float32Array(maxAgents * 3);
    this.size = new Float32Array(maxAgents);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 900 }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000);
    this.points = new THREE.Points(g, this.material);
    this.points.renderOrder = 5;

    this.crewPos = new Float32Array(maxCrews * 3);
    this.crewTarget = new Float32Array(maxCrews * 3);
    this.crewColor = new Float32Array(maxCrews * 3);
    this.crewSize = new Float32Array(maxCrews);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(this.crewPos, 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('aColor', new THREE.BufferAttribute(this.crewColor, 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('aSize', new THREE.BufferAttribute(this.crewSize, 1).setUsage(THREE.DynamicDrawUsage));
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4000);
    this.crews = new THREE.Points(cg, this.material);
    this.crews.renderOrder = 6;
  }

  applyFrame(f: Frame) {
    const n = Math.min(f.agentsState.length, this.size.length, this.maxDrawn);
    const col = new THREE.Color();
    const palette = Object.fromEntries(Object.entries(AGENT_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
    let snap = this.first || this.count !== n;
    this.count = n;
    for (let a = 0; a < n; a++) {
      const x = f.agentsXZ[a * 2];
      const z = f.agentsXZ[a * 2 + 1];
      const y = this.hf.at(x, z) + 3.5;
      const dx = x - this.target[a * 3];
      const dz = z - this.target[a * 3 + 2];
      if (dx * dx + dz * dz > 350 * 350) snap = true;
      this.target[a * 3] = x;
      this.target[a * 3 + 1] = y;
      this.target[a * 3 + 2] = z;
      const st = f.agentsState[a];
      col.copy(palette[st] ?? palette[1]);
      this.color[a * 3] = col.r;
      this.color[a * 3 + 1] = col.g;
      this.color[a * 3 + 2] = col.b;
      this.size[a] = st === AgentState.Inside || st === AgentState.Hospitalized ? 0 : st === AgentState.Sheltered ? 7 : st === AgentState.Injured || st === AgentState.Trapped ? 13 : 10;
    }
    for (let a = n; a < this.size.length; a++) this.size[a] = 0;
    if (snap) this.pos.set(this.target);
    this.first = false;
    const g = this.points.geometry;
    (g.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, n);

    const m = Math.min(f.crewsState.length, this.crewSize.length);
    this.crewCount = m;
    for (let k = 0; k < m; k++) {
      const x = f.crewsXZ[k * 2];
      const z = f.crewsXZ[k * 2 + 1];
      const tx = this.crewTarget[k * 3];
      const tz = this.crewTarget[k * 3 + 2];
      this.crewTarget[k * 3] = x;
      this.crewTarget[k * 3 + 1] = this.hf.at(x, z) + 5;
      this.crewTarget[k * 3 + 2] = z;
      if (snap || (x - tx) ** 2 + (z - tz) ** 2 > 400 * 400) {
        this.crewPos[k * 3] = x;
        this.crewPos[k * 3 + 1] = this.crewTarget[k * 3 + 1];
        this.crewPos[k * 3 + 2] = z;
      }
      const st = f.crewsState[k];
      this.crewSize[k] = st === 0 ? 0 : 22;
      col.set(st === 4 ? '#ff00aa' : st === 2 ? '#ff5a1f' : '#ffffff');
      this.crewColor[k * 3] = col.r;
      this.crewColor[k * 3 + 1] = col.g;
      this.crewColor[k * 3 + 2] = col.b;
    }
    const cg = this.crews.geometry;
    (cg.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (cg.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    cg.setDrawRange(0, m);
  }

  animate(dt: number, time: number, pixelScale: number) {
    const k = Math.min(1, dt * 12);
    const p = this.pos;
    const t = this.target;
    for (let i = 0; i < this.count * 3; i++) p[i] += (t[i] - p[i]) * k;
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    for (let i = 0; i < this.crewCount * 3; i++) this.crewPos[i] += (this.crewTarget[i] - this.crewPos[i]) * k;
    (this.crews.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    // emergency light flashing
    for (let c = 0; c < this.crewCount; c++) {
      if (this.crewSize[c] <= 0) continue;
      const on = Math.sin(time * 14 + c) > 0;
      this.crewColor[c * 3 + 2] = on ? 1 : 0.2;
    }
    (this.crews.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uScale.value = 900 * pixelScale;
    this.material.uniforms.uTime.value = time;
  }
}
