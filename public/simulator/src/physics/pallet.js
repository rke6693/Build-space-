// CHEP GMA 48x40 block pallet as a compound collider.
// Sources:
//   - CHEP USA GMA B48 spec sheet, 2023 (public PDF).
//   - FBA Fibre Box Handbook (carton/pallet friction pairs).
// Geometry is simplified but dimensionally correct: 7 top-deck boards, 5 bottom-deck
// boards, 9 blocks (4 corner, 4 edge, 1 center). All dimensions in meters.

import RAPIER from '@dimforge/rapier3d-compat';
import { CHEP_GMA as chepSpec } from '../data/chep-gma.js';
import { GROUP, interactionBits } from './contacts.js';

const MM = 0.001;

export function getCHEPSpec() { return chepSpec; }

// Build a compound of cuboid colliders representing the pallet. Returns the list
// of ColliderDesc objects plus the overall bounding box for placement.
export function buildCHEPPalletColliders({ centerY = null } = {}) {
  const L = chepSpec.outer_mm.length * MM;   // 1.219 m
  const W = chepSpec.outer_mm.width  * MM;   // 1.016 m
  const H = chepSpec.outer_mm.height * MM;   // 0.142 m
  const deckT = chepSpec.topDeck.boardThickness_mm * MM;
  const bottomT = chepSpec.bottomDeck.boardThickness_mm * MM;
  const blockH = H - deckT - bottomT;        // ~0.110 m of block between decks

  // If centerY is null, the pallet sits with its bottom deck at y=0.
  const bottomDeckCenterY = (centerY ?? H / 2 - H / 2) + bottomT / 2;
  const topDeckCenterY = (centerY ?? H / 2 - H / 2) + bottomT + blockH + deckT / 2;
  const blocksCenterY = (centerY ?? H / 2 - H / 2) + bottomT + blockH / 2;

  const colliders = [];
  const friction = chepSpec.friction_painted_wood.mu_static;
  const restitution = 0.08;
  const mat = d => d
    .setFriction(friction)
    .setRestitution(restitution)
    .setCollisionGroups(interactionBits(GROUP.PALLET, GROUP.BOX | GROUP.GROUND | GROUP.PLATEN));

  // Top deck: 7 boards running along X (pallet length 48"), stacked in Z across width 40".
  const topWidths = chepSpec.topDeck.boardWidth_mm.map(w => w * MM);
  const topSum = topWidths.reduce((a, b) => a + b, 0);
  const topGap = (W - topSum) / (topWidths.length - 1);
  {
    let z = -W / 2;
    for (const bw of topWidths) {
      const cz = z + bw / 2;
      colliders.push(mat(RAPIER.ColliderDesc.cuboid(L / 2, deckT / 2, bw / 2))
        .setTranslation(0, topDeckCenterY, cz));
      z += bw + topGap;
    }
  }

  // Bottom deck: 5 boards likewise.
  const botWidths = chepSpec.bottomDeck.boardWidth_mm.map(w => w * MM);
  const botSum = botWidths.reduce((a, b) => a + b, 0);
  const botGap = (W - botSum) / (botWidths.length - 1);
  {
    let z = -W / 2;
    for (const bw of botWidths) {
      const cz = z + bw / 2;
      colliders.push(mat(RAPIER.ColliderDesc.cuboid(L / 2, bottomT / 2, bw / 2))
        .setTranslation(0, bottomDeckCenterY, cz));
      z += bw + botGap;
    }
  }

  // 9 blocks arranged in a 3x3 grid. Corner + center = square, edges along length = elongated.
  const cbl = chepSpec.blocks.cornerBlock_mm.l * MM;
  const cbw = chepSpec.blocks.cornerBlock_mm.w * MM;
  const ebl = chepSpec.blocks.edgeBlock_mm.l  * MM;
  const ebw = chepSpec.blocks.edgeBlock_mm.w  * MM;

  const xs = [-L / 2 + cbl / 2, 0, L / 2 - cbl / 2];
  const zs = [-W / 2 + cbw / 2, 0, W / 2 - cbw / 2];

  for (let ix = 0; ix < 3; ix++) {
    for (let iz = 0; iz < 3; iz++) {
      const isCenter = ix === 1 && iz === 1;
      const isEdge   = (ix === 1) !== (iz === 1); // exactly one index is middle
      const bx = xs[ix], bz = zs[iz];
      let halfL = cbl / 2, halfW = cbw / 2;
      if (isEdge && ix === 1) halfL = ebl / 2;
      if (isEdge && iz === 1) halfW = ebl / 2;
      if (isCenter) { halfL = cbl / 2; halfW = cbw / 2; }
      colliders.push(mat(RAPIER.ColliderDesc.cuboid(halfL, blockH / 2, halfW))
        .setTranslation(bx, blocksCenterY, bz));
    }
  }

  return {
    colliders,
    outer: { L, W, H },
    topSurfaceY: (centerY ?? 0) + bottomT + blockH + deckT,
    // Total volume for mass calc (rough — assumes solid geometry, overestimates).
    approxMass: chepSpec.mass_kg_nominal,
  };
}

// Attach compound colliders to a body. If kinematic, the pallet is driven by vibration.
export function spawnCHEPPallet(world, { kinematic = false, position = { x: 0, y: 0, z: 0 } } = {}) {
  const desc = kinematic
    ? RAPIER.RigidBodyDesc.kinematicPositionBased()
    : RAPIER.RigidBodyDesc.dynamic().setAdditionalMass(getCHEPSpec().mass_kg_nominal);
  desc.setTranslation(position.x, position.y, position.z);
  desc.setCanSleep(false); // determinism
  const body = world.createRigidBody(desc);
  const { colliders, outer, topSurfaceY } = buildCHEPPalletColliders({ centerY: 0 });
  for (const c of colliders) world.createCollider(c, body);
  return { body, outer, topSurfaceY: position.y + topSurfaceY };
}
