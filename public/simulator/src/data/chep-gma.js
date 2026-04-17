// CHEP USA GMA B48 block pallet geometry. See chep-gma.json for the citation
// copy; this module mirrors the same data for portable ES-module import
// (avoids Node/browser JSON-assertion inconsistency).

export const CHEP_GMA = {
  _source: "CHEP USA GMA B48 block pallet spec (48x40 block style), 2023 public spec sheet. Dimensions rounded to nearest mm.",
  outer_mm: { length: 1219, width: 1016, height: 142 },
  outer_in: { length: 48.0, width: 40.0, height: 5.6 },
  mass_kg_nominal: 35,
  mass_kg_range: [29, 34],
  wood_density_kg_m3: 550,
  topDeck: {
    boardThickness_mm: 15.9,
    boardWidth_mm: [133, 95, 95, 95, 95, 95, 133],
    gap_mm: 45,
  },
  bottomDeck: {
    boardThickness_mm: 15.9,
    boardWidth_mm: [140, 95, 140, 95, 140],
    gap_mm: 95,
  },
  blocks: {
    cornerBlock_mm: { l: 95, w: 95, h: 95 },
    edgeBlock_mm:   { l: 229, w: 95, h: 95 },
    centerBlock_mm: { l: 95, w: 95, h: 95 },
  },
  staticLoadCapacity_kg: 2270,
  dynamicLoadCapacity_kg: 1360,
  friction_painted_wood: {
    mu_static: 0.55,
    mu_kinetic: 0.45,
  },
};

export default CHEP_GMA;
