// Collision groups + friction pair helper. Rapier uses 16-bit membership / 16-bit filter.
import { FRICTION_TABLE as frictionTable } from '../data/friction-table.js';

export const GROUP = {
  PALLET:   0b0000_0000_0000_0001,
  BOX:      0b0000_0000_0000_0010,
  GROUND:   0b0000_0000_0000_0100,
  PLATEN:   0b0000_0000_0000_1000,
  WRAP:     0b0000_0000_0001_0000,
};

export function interactionBits(membership, filter) {
  // Rapier: (membership << 16) | filter
  return (membership << 16) | (filter & 0xffff);
}

export const FRICTION = frictionTable.pairs;
export const RESTITUTION = frictionTable.restitution_typical;

export function muForPair(materialA, materialB, kinetic = false) {
  const key = [materialA, materialB].sort().join('_');
  // Simple lookup with a couple aliases.
  const table = {
    corrugated_corrugated: 'corrugated_corrugated_rough',
    corrugated_wood:       'corrugated_painted_wood',
  };
  const lookup = table[key] || key;
  const entry = FRICTION[lookup] || FRICTION.corrugated_corrugated_rough;
  return kinetic ? entry.mu_kinetic : entry.mu_static;
}
