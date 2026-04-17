// Corrugated brown box as a single cuboid rigid body.
// Carton wall stiffness is NOT simulated (rigid-body limitation); an advisory
// McKee BCT value is computed separately in analysis/metrics.js.

import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP, interactionBits, muForPair, RESTITUTION } from './contacts.js';

export function spawnBox(world, {
  L, W, H,              // meters
  mass,                 // kg
  position,             // { x, y, z } — center
  rotationY = 0,        // radians
  material = 'corrugated',
  friction = null,      // override; defaults to corrugated-corrugated pair
  restitution = RESTITUTION.corrugated_corrugated,
  label = '',
} = {}) {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(position.x, position.y, position.z)
    .setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) })
    .setAdditionalMass(mass)
    .setCanSleep(false)
    .setLinearDamping(0.02)
    .setAngularDamping(0.05);
  const body = world.createRigidBody(desc);
  const mu = friction ?? muForPair('corrugated', 'corrugated');
  const collider = RAPIER.ColliderDesc.cuboid(L / 2, H / 2, W / 2)
    .setFriction(mu)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setRestitution(restitution)
    .setDensity(mass / Math.max(1e-9, L * W * H))
    .setCollisionGroups(interactionBits(GROUP.BOX, GROUP.BOX | GROUP.PALLET | GROUP.GROUND | GROUP.PLATEN | GROUP.WRAP));
  world.createCollider(collider, body);
  return {
    body,
    dims: { L, W, H },
    mass,
    material,
    label,
    initialPos: { ...position },
    initialRot: rotationY,
  };
}

// Ground plane for free-fall sanity demo + to catch debris after wrap failure.
export function spawnGround(world, { y = -0.05, friction = 0.9 } = {}) {
  const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, y - 0.05, 0);
  const body = world.createRigidBody(desc);
  const collider = RAPIER.ColliderDesc.cuboid(50, 0.05, 50)
    .setFriction(friction)
    .setRestitution(0.0)
    .setCollisionGroups(interactionBits(GROUP.GROUND, GROUP.PALLET | GROUP.BOX | GROUP.PLATEN));
  world.createCollider(collider, body);
  return { body };
}
