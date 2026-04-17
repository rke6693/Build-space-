// Three.js viewport. Renders the pallet, boxes, ground, and a subtle environment.
// Syncs transforms from Rapier every render frame.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getCHEPSpec } from '../physics/pallet.js';

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef1f5);
    this.scene.fog = new THREE.Fog(0xeef1f5, 6, 20);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
    this.camera.position.set(2.6, 2.0, 3.0);
    this.camera.lookAt(0, 0.6, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.6, 0);
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 12;

    this._lights();
    this._floor();
    this._buildPalletMesh();

    this.boxMeshes = new Map(); // key: rapier body handle -> Three Mesh
    this.palletMeshGroup = null;
    this.palletBody = null;

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x55606b, 0.55);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 5, 2.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 3.0;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 0.1; key.shadow.camera.far = 15;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc9d5e6, 0.3);
    fill.position.set(-2, 3, -2);
    this.scene.add(fill);
  }

  _floor() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd7dce3, roughness: 0.95, metalness: 0.0 });
    const geo = new THREE.PlaneGeometry(30, 30);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // Subtle grid for scale reference.
    const grid = new THREE.GridHelper(6, 24, 0xa8b2bf, 0xc1c8d1);
    grid.position.y = 0.001;
    grid.material.transparent = true;
    grid.material.opacity = 0.45;
    this.scene.add(grid);
  }

  _buildPalletMesh() {
    // Visual pallet is rebuilt when we know the pallet body; placeholder here.
    this.palletMeshGroup = new THREE.Group();
    this.scene.add(this.palletMeshGroup);
  }

  attachPallet(palletInfo) {
    // palletInfo = { body, outer, topSurfaceY }
    this.palletBody = palletInfo.body;
    this.palletMeshGroup.clear();

    const spec = getCHEPSpec();
    const MM = 0.001;
    const H = spec.outer_mm.height * MM;
    const deckT = spec.topDeck.boardThickness_mm * MM;
    const bottomT = spec.bottomDeck.boardThickness_mm * MM;
    const blockH = H - deckT - bottomT;
    const L = spec.outer_mm.length * MM;
    const W = spec.outer_mm.width  * MM;

    const woodPaint = new THREE.MeshStandardMaterial({
      color: 0x2a79c7, roughness: 0.7, metalness: 0.0,
    });
    const woodEnd = new THREE.MeshStandardMaterial({
      color: 0xb98a55, roughness: 0.85, metalness: 0.0,
    });

    // Top deck 7 boards.
    const topWidths = spec.topDeck.boardWidth_mm.map(w => w * MM);
    const topSum = topWidths.reduce((a, b) => a + b, 0);
    const topGap = (W - topSum) / (topWidths.length - 1);
    const topY = bottomT + blockH + deckT / 2 - H / 2;
    let z = -W / 2;
    for (const bw of topWidths) {
      const g = new THREE.BoxGeometry(L, deckT, bw);
      const m = new THREE.Mesh(g, woodPaint);
      m.position.set(0, topY, z + bw / 2);
      m.castShadow = true; m.receiveShadow = true;
      this.palletMeshGroup.add(m);
      z += bw + topGap;
    }
    // Bottom deck 5 boards.
    const botWidths = spec.bottomDeck.boardWidth_mm.map(w => w * MM);
    const botSum = botWidths.reduce((a, b) => a + b, 0);
    const botGap = (W - botSum) / (botWidths.length - 1);
    const botY = bottomT / 2 - H / 2;
    z = -W / 2;
    for (const bw of botWidths) {
      const g = new THREE.BoxGeometry(L, bottomT, bw);
      const m = new THREE.Mesh(g, woodPaint);
      m.position.set(0, botY, z + bw / 2);
      m.castShadow = true; m.receiveShadow = true;
      this.palletMeshGroup.add(m);
      z += bw + botGap;
    }
    // Blocks.
    const cbl = spec.blocks.cornerBlock_mm.l * MM;
    const cbw = spec.blocks.cornerBlock_mm.w * MM;
    const ebl = spec.blocks.edgeBlock_mm.l  * MM;
    const xs = [-L / 2 + cbl / 2, 0, L / 2 - cbl / 2];
    const zs = [-W / 2 + cbw / 2, 0, W / 2 - cbw / 2];
    const blockY = bottomT + blockH / 2 - H / 2;
    for (let ix = 0; ix < 3; ix++) {
      for (let iz = 0; iz < 3; iz++) {
        const isCenter = ix === 1 && iz === 1;
        const isEdge = (ix === 1) !== (iz === 1);
        let bl = cbl, bw2 = cbw;
        if (isEdge && ix === 1) bl = ebl;
        if (isEdge && iz === 1) bw2 = ebl;
        if (isCenter) { bl = cbl; bw2 = cbw; }
        const g = new THREE.BoxGeometry(bl, blockH, bw2);
        const m = new THREE.Mesh(g, woodEnd);
        m.position.set(xs[ix], blockY, zs[iz]);
        m.castShadow = true; m.receiveShadow = true;
        this.palletMeshGroup.add(m);
      }
    }
  }

  _boxMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xb6865a, roughness: 0.9, metalness: 0.02,
    });
  }

  addBox(spawned) {
    const { body, dims, label } = spawned;
    const g = new THREE.BoxGeometry(dims.L, dims.H, dims.W);
    const mesh = new THREE.Mesh(g, this._boxMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    // Faint edge highlight so stacks read clearly.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(g, 20),
      new THREE.LineBasicMaterial({ color: 0x5a3f22, transparent: true, opacity: 0.35 })
    );
    mesh.add(edges);
    if (label) mesh.name = label;
    this.scene.add(mesh);
    this.boxMeshes.set(body.handle, { body, mesh });
  }

  removeBox(body) {
    const entry = this.boxMeshes.get(body.handle);
    if (!entry) return;
    this.scene.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    this.boxMeshes.delete(body.handle);
  }

  clearBoxes() {
    for (const { mesh } of this.boxMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.boxMeshes.clear();
  }

  syncFromPhysics() {
    if (this.palletBody && this.palletMeshGroup) {
      const t = this.palletBody.translation();
      const r = this.palletBody.rotation();
      this.palletMeshGroup.position.set(t.x, t.y, t.z);
      this.palletMeshGroup.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const { body, mesh } of this.boxMeshes.values()) {
      const t = body.translation();
      const r = body.rotation();
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  focusOnPallet() {
    this.camera.position.set(2.4, 1.8, 2.8);
    this.controls.target.set(0, 0.7, 0);
  }
}
