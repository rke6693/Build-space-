// Friction and restitution reference pairs. See friction-table.json for prose.

export const FRICTION_TABLE = {
  _source: "Fibre Box Handbook (FBA) + published corrugated tribology. Mid-range values; calibrate per program.",
  pairs: {
    corrugated_corrugated_smooth: { mu_static: 0.45, mu_kinetic: 0.35, range: [0.30, 0.55] },
    corrugated_corrugated_rough:  { mu_static: 0.55, mu_kinetic: 0.45, range: [0.45, 0.65] },
    corrugated_painted_wood:      { mu_static: 0.55, mu_kinetic: 0.45, range: [0.45, 0.65] },
    corrugated_bare_wood:         { mu_static: 0.60, mu_kinetic: 0.50, range: [0.50, 0.70] },
    corrugated_film_LLDPE:        { mu_static: 0.35, mu_kinetic: 0.25, range: [0.25, 0.45] },
    corrugated_non_skid_layer:    { mu_static: 0.85, mu_kinetic: 0.70, range: [0.70, 0.95] },
  },
  restitution_typical: {
    corrugated_corrugated: 0.05,
    corrugated_wood:       0.08,
    wood_ground:           0.15,
  },
};

export default FRICTION_TABLE;
