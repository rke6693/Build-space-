// ISTA 3E truck over-the-road random vibration PSD. See ista3e-psd.json for prose.
// Source: ISTA 3E procedure, 2017 revision, §4.4.

export const ISTA_3E_PSD = {
  _source: "ISTA 3E, 2017 rev., §4.4 Random Vibration. Verify against the current procedure before certification use.",
  profile: "ISTA_3E_TRUCK_OTR",
  axis: "vertical",
  units: { frequency: "Hz", psd: "g^2/Hz" },
  breakpoints: [
    { f: 1,   psd: 0.0001 },
    { f: 4,   psd: 0.0100 },
    { f: 16,  psd: 0.0100 },
    { f: 40,  psd: 0.0010 },
    { f: 80,  psd: 0.0010 },
    { f: 200, psd: 0.00001 },
  ],
  grms_nominal: 0.54,
  duration_min_real: 180,
  notes: [
    "Log-log interpolation between breakpoints.",
    "Compressed-time runs preserve frequency content but NOT cumulative creep/fatigue.",
    "Vertical-axis profile; ISTA 3E also specifies shorter lateral/longitudinal runs.",
  ],
};

export default ISTA_3E_PSD;
