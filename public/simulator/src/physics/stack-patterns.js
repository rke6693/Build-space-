// Parametric stack pattern generators. All dimensions in meters.
//
// Returns an array of { x, z, rotY } positions per layer. The caller (sequencer/
// scene builder) stacks layers vertically using the box height. Patterns:
//   - column:    identical grid on every layer (worst-case for stability)
//   - interlock: alternate layers rotate 90° (or mirror) to break vertical columns
//   - pinwheel:  classic 5-per-layer rotation for 48x40 with ~10x10 boxes

const PALLET_L = 1.219;  // 48 in
const PALLET_W = 1.016;  // 40 in

export function layoutLayer(pattern, layerIndex, box) {
  switch (pattern) {
    case 'column':    return layerColumn(box);
    case 'interlock': return (layerIndex % 2 === 0) ? layerColumn(box) : layerInterlockSwapped(box);
    case 'pinwheel':  return layerPinwheel(box, layerIndex);
    default: return layerColumn(box);
  }
}

export function estimateLayerCount(pattern, box) {
  return layoutLayer(pattern, 0, box).length;
}

// Simple grid, box L along pallet L, box W along pallet W.
function layerColumn({ L, W }) {
  const nL = Math.floor(PALLET_L / L);
  const nW = Math.floor(PALLET_W / W);
  const offsetX = -(nL * L) / 2 + L / 2;
  const offsetZ = -(nW * W) / 2 + W / 2;
  const out = [];
  for (let i = 0; i < nL; i++) {
    for (let j = 0; j < nW; j++) {
      out.push({ x: offsetX + i * L, z: offsetZ + j * W, rotY: 0 });
    }
  }
  return out;
}

// For interlock we try a 90°-rotated grid; if that changes the count we offset
// instead to preserve box count consistency across layers.
function layerInterlockSwapped({ L, W }) {
  const nL = Math.floor(PALLET_L / W); // swapped
  const nW = Math.floor(PALLET_W / L);
  if (nL * nW !== Math.floor(PALLET_L / L) * Math.floor(PALLET_W / W)) {
    // Fall back to a half-brick offset on X.
    return layerColumnOffset({ L, W }, L / 2, 0);
  }
  const offsetX = -(nL * W) / 2 + W / 2;
  const offsetZ = -(nW * L) / 2 + L / 2;
  const out = [];
  for (let i = 0; i < nL; i++) {
    for (let j = 0; j < nW; j++) {
      out.push({ x: offsetX + i * W, z: offsetZ + j * L, rotY: Math.PI / 2 });
    }
  }
  return out;
}

function layerColumnOffset(box, dx, dz) {
  return layerColumn(box).map(p => ({
    x: clamp(p.x + dx, -PALLET_L / 2 + box.L / 2, PALLET_L / 2 - box.L / 2),
    z: clamp(p.z + dz, -PALLET_W / 2 + box.W / 2, PALLET_W / 2 - box.W / 2),
    rotY: p.rotY,
  }));
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// Pinwheel: classic 5-carton tessellation. Works cleanly when the box is roughly
// square and fits the 48x40 footprint in a 5-per-layer pattern. For mismatched
// dimensions we fall back to interlock and the UI should warn.
function layerPinwheel({ L, W }, layerIndex) {
  // Idealised pinwheel for a 10x10 inch box (0.254 m) or similar square box.
  // If box is far from square, degrade gracefully.
  const ratio = Math.max(L, W) / Math.min(L, W);
  if (ratio > 1.3 || Math.min(L, W) < 0.18 || Math.max(L, W) > 0.36) {
    return layerInterlockSwapped({ L, W });
  }
  const s = Math.min(L, W);
  // Four rim boxes pinwheeled around a center box.
  const layer = [
    { x: -PALLET_L / 2 + L / 2, z: -PALLET_W / 2 + W / 2, rotY: 0 },
    { x:  PALLET_L / 2 - L / 2, z:  PALLET_W / 2 - W / 2, rotY: 0 },
    { x: -PALLET_L / 2 + W / 2, z:  PALLET_W / 2 - L / 2, rotY: Math.PI / 2 },
    { x:  PALLET_L / 2 - W / 2, z: -PALLET_W / 2 + L / 2, rotY: Math.PI / 2 },
    { x: 0, z: 0, rotY: layerIndex % 2 === 0 ? 0 : Math.PI / 2 },
  ];
  // Mirror every other layer for true interlock.
  if (layerIndex % 2 === 1) {
    return layer.map(p => ({ x: -p.x, z: -p.z, rotY: p.rotY + Math.PI / 2 }));
  }
  return layer;
}
