'use strict';
// =============================================================================
// SYNTHWING 64 — models.js
// Every 3D model in the game is built here from primitives. Low poly, vertex
// coloured, faceted — authentic 64-bit era construction. Models face -Z.
// Colour arrays: [r,g,b] lit, or [r,g,b,0] unlit (glowing).
// =============================================================================

const C = {
  white: hex('#e9edf6'), grey: hex('#9aa3b5'), dark: hex('#2a2f3d'), black: hex('#15151c'),
  blue: hex('#2f6bff'), blueD: hex('#1d3fa8'), yellow: hex('#ffd23f'), glass: hex('#5fd4ff'),
  green: hex('#3fbf5f'), purple: hex('#8a4dff'), orange: hex('#ff8a2a'), red: hex('#e8413a'),
  stBody: hex('#2a2040'), stHi: hex('#463666'), stDark: hex('#161022'), stMetal: hex('#5d5873'),
  sand: hex('#e8d49a'), sandD: hex('#c9ae70'), grass: hex('#5dbb4b'), grassD: hex('#3f8f38'),
  rock: hex('#8d8779'), rockD: hex('#5f5a50'), wood: hex('#8a5a2b'), leaf: hex('#3fae3f'), leafD: hex('#2a7f30'),
  snow: hex('#f2f6ff'), ice: hex('#9fe8ff'), pine: hex('#1f5a3a'), lavaRock: hex('#2a1d1a'),
};
const glow = (h) => { const c = hex(h); c.push(0); return c; };
const G = {
  magenta: glow('#ff2fa0'), red: glow('#ff3b3b'), cyan: glow('#6ff6ff'), yellow: glow('#ffe14a'), orange: glow('#ff8a1f'),
  white: glow('#ffffff'), green: glow('#6dff8a'), blue: glow('#5aa8ff'), pink: glow('#ff7fd0'),
};

const MODELS = {};

function buildShip(accent, accentD, stripe) {
  const b = new MB();
  // fuselage (hexagonal lathe, flattened)
  b.push(); b.scale(1.3, 0.9, 1); b.rotateX(-PI / 2);
  b.lathe([[0.2, -1.35], [0.34, -0.9], [0.38, 0.1], [0.3, 1.1], [0.14, 1.85], [0, 2.15]], 6, (j) => (j === 0 ? C.dark : j >= 3 ? accent : C.white), { capBottom: true, phase: PI / 6 });
  b.pop();
  // cockpit canopy
  b.push(); b.translate(0, 0.2, -0.35); b.scale(0.62, 0.5, 1.5);
  b.sphere(0.42, 6, 4, C.glass);
  b.pop();
  // wings (swept, dihedral)
  for (const s of [1, -1]) {
    b.push(); b.translate(0.12 * s, -0.05, 0.1); b.rotateZ(0.12 * s);
    const pts = [[0.2, -0.4], [2.15, 0.62], [2.35, 1.12], [0.2, 1.0]].map(([x, z]) => [x * s, z]);
    b.extrude(pts, 0.17, accent, accentD);
    // white leading strip
    const lp = [[0.2, -0.4], [2.15, 0.62], [2.1, 0.8], [0.2, -0.16]].map(([x, z]) => [x * s, z]);
    b.push(); b.translate(0, 0.02, 0); b.extrude(lp, 0.18, C.white, C.grey); b.pop();
    // wingtip "tuning fork" prongs
    b.push(); b.translate(2.24 * s, 0, 0.85); b.rotateZ(PI / 2);
    b.extrude([[0, 0.55], [0.8, 0.15], [0.8, 0.45], [0, 1.05]], 0.14, stripe, stripe);
    b.extrude([[0, 0.55], [-0.55, 0.35], [-0.55, 0.6], [0, 1.05]], 0.14, stripe, stripe);
    b.pop();
    b.push(); b.translate(2.24 * s, 0.05, 0.4); b.box(0, 0, 0, 0.1, 0.1, 0.25, G.cyan); b.pop();
    // engine pod
    b.push(); b.translate(0.5 * s, -0.12, 0.75); b.rotateX(-PI / 2);
    b.lathe([[0.22, -0.7], [0.24, -0.4], [0.2, 0.5], [0.08, 0.75]], 6, (j) => (j === 0 ? C.dark : C.grey), { capBottom: false });
    b.disc(0.2, -0.68, 6, G.cyan, true);
    b.pop();
    // canards
    b.push(); b.translate(0.2 * s, 0.02, -1.15);
    b.extrude([[0, 0], [0.7 * s, 0.25], [0.7 * s, 0.4], [0, 0.4]], 0.07, stripe, C.dark);
    b.pop();
  }
  // tail fin
  b.push(); b.translate(0, 0.18, 0.2); b.rotateZ(PI / 2);
  b.extrude([[0, 0.5], [0.95, 1.05], [0.95, 1.35], [0, 1.25]], 0.1, accent, accentD);
  b.pop();
  // central engine glow
  b.push(); b.translate(0, 0, 1.36); b.rotateX(-PI / 2); b.disc(0.2, 0, 6, G.cyan, true); b.pop();
  return b.build('ship');
}

// BASSLINE — heavy twin-boom gunship: armoured pod, speaker-cone intakes,
// chin cannons and big orange exhausts.
function buildBassline() {
  const b = new MB();
  const hull = hex('#b8322a'), hullD = hex('#6e1a15'), metal = hex('#4a4f5e'), metalD = hex('#2a2d38');
  b.push(); b.scale(1.35, 1, 1); b.rotateX(-PI / 2);
  b.lathe([[0.3, -1.3], [0.52, -0.8], [0.58, 0.2], [0.46, 1.0], [0.22, 1.55], [0, 1.7]], 6, (j) => (j === 0 ? C.dark : j >= 3 ? hull : metal), { capBottom: true, phase: PI / 6 });
  b.pop();
  b.push(); b.translate(0, 0.42, -0.45); b.scale(0.7, 0.5, 1.3); b.sphere(0.42, 6, 4, C.glass); b.pop();
  for (const s of [1, -1]) {
    // chin cannon
    b.push(); b.translate(0.3 * s, -0.42, -0.55); b.rotateX(-PI / 2);
    b.cylinder(0.1, 0.08, -0.4, 1.1, 5, metalD); b.disc(0.07, 1.11, 5, G.orange, false);
    b.pop();
    // stub wing out to the boom
    b.push(); b.translate(0, -0.05, 0.25);
    b.extrude([[0.4 * s, -0.35], [1.4 * s, -0.25], [1.4 * s, 0.75], [0.4 * s, 0.85]], 0.22, hull, hullD);
    b.pop();
    // engine boom with a speaker-cone intake
    b.push(); b.translate(1.45 * s, 0, 0.3); b.rotateX(-PI / 2);
    b.lathe([[0.3, -1.45], [0.4, -1.1], [0.42, 0.4], [0.36, 0.85]], 6, (j) => (j === 0 ? metalD : j === 1 ? metal : hull), { capBottom: false, phase: PI / 6 });
    b.disc(0.36, 0.85, 6, metalD, false, PI / 6);
    b.disc(0.24, 0.87, 6, C.black, false, PI / 6);
    b.disc(0.09, 0.9, 6, C.yellow, false, PI / 6);
    b.disc(0.3, -1.44, 6, G.orange, true, PI / 6);
    b.pop();
    // drooping outer wing with a yellow tip
    b.push(); b.translate(1.8 * s, -0.1, 0.45); b.rotateZ(-0.35 * s);
    b.extrude([[0, -0.2], [0.95 * s, 0.25], [0.95 * s, 0.6], [0, 0.75]], 0.14, hull, hullD);
    b.push(); b.translate(0.95 * s, 0, 0.42); b.box(0, 0, 0, 0.12, 0.16, 0.4, C.yellow); b.pop();
    b.pop();
    // tail fin on each boom, canted out
    b.push(); b.translate(1.45 * s, 0.3, 1.0); b.rotateZ(PI / 2 - 0.25 * s);
    b.extrude([[0, -0.1], [0.8, 0.25], [0.8, 0.55], [0, 0.5]], 0.1, hull, hullD);
    b.pop();
  }
  b.push(); b.translate(0, 0, 1.32); b.rotateX(-PI / 2); b.disc(0.28, 0, 6, G.orange, true); b.pop();
  return b.build('bassline');
}

// ARPEGGIO — needle-nosed interceptor with forward-swept wings and glowing
// wingtip "strings".
function buildArpeggio() {
  const b = new MB();
  const hull = hex('#18b58c'), hullD = hex('#0e6b53');
  b.push(); b.scale(1, 0.85, 1); b.rotateX(-PI / 2);
  b.lathe([[0.18, -1.5], [0.3, -1.0], [0.32, 0.2], [0.24, 1.3], [0.1, 2.3], [0, 2.75]], 6, (j) => (j === 0 ? C.dark : j >= 3 ? C.white : hull), { capBottom: true, phase: PI / 6 });
  b.pop();
  b.push(); b.translate(0, 0.2, -0.55); b.scale(0.45, 0.42, 1.8); b.sphere(0.42, 6, 4, C.glass); b.pop();
  for (const s of [1, -1]) {
    b.extrude([[0.2 * s, 0.35], [2.05 * s, -0.35], [2.2 * s, -0.12], [0.2 * s, 1.05]], 0.12, hull, hullD);
    b.push(); b.translate(0, 0.01, 0); b.extrude([[0.2 * s, 0.85], [2.12 * s, -0.2], [2.2 * s, -0.12], [0.2 * s, 1.05]], 0.13, C.white, C.grey); b.pop();
    b.push(); b.translate(2.16 * s, 0, -0.25); b.box(0, 0, 0, 0.08, 0.08, 1.4, G.green); b.pop();
    b.push(); b.translate(0.28 * s, 0.1, 0.95); b.rotateZ(PI / 2 - 0.45 * s);
    b.extrude([[0, 0], [0.8, 0.45], [0.8, 0.7], [0, 0.6]], 0.08, hull, hullD);
    b.pop();
    b.push(); b.translate(0.25 * s, -0.05, 1.1);
    b.extrude([[0, 0], [0.75 * s, 0.35], [0.75 * s, 0.5], [0, 0.45]], 0.07, C.white, C.grey);
    b.pop();
  }
  b.push(); b.translate(0, 0, 1.52); b.rotateX(-PI / 2); b.disc(0.22, 0, 6, G.green, true); b.pop();
  return b.build('arpeggio');
}

// MAESTRO — golden flying wing crowned with a lyre (unlocked by the forks).
function buildMaestro() {
  const b = new MB();
  const gold = hex('#ffcc33'), goldD = hex('#c7931a'), ivory = hex('#fff4d8');
  b.extrude([[0, -1.7], [1.2, -0.4], [2.75, 0.85], [2.45, 1.25], [1.1, 0.95], [0, 1.35], [-1.1, 0.95], [-2.45, 1.25], [-2.75, 0.85], [-1.2, -0.4]], 0.16, gold, goldD);
  b.push(); b.scale(1.1, 0.8, 1); b.rotateX(-PI / 2);
  b.lathe([[0.25, -1.25], [0.42, -0.7], [0.46, 0.3], [0.3, 1.2], [0.1, 1.85], [0, 2.0]], 6, (j) => (j === 0 ? C.dark : j >= 3 ? ivory : gold), { capBottom: true, phase: PI / 6 });
  b.pop();
  b.push(); b.translate(0, 0.28, -0.3); b.scale(0.6, 0.45, 1.4); b.sphere(0.42, 6, 4, C.glass); b.pop();
  // lyre crest: a standing ring strung with light
  b.push(); b.translate(0, 0.78, 0.75); b.rotateX(PI / 2); b.torus(0.6, 0.07, 14, 4, gold); b.pop();
  for (const x of [-0.3, 0, 0.3]) { const h = Math.sqrt(0.36 - x * x) * 2 - 0.1; b.box(x, 0.78, 0.75, 0.04, h, 0.04, G.yellow); }
  for (const s of [1, -1]) {
    b.push(); b.translate(0.62 * s, -0.02, 1.05); b.rotateX(-PI / 2); b.cylinder(0.2, 0.24, -0.35, 0.3, 6, goldD); b.disc(0.2, -0.35, 6, G.yellow, true); b.pop();
    b.push(); b.translate(2.6 * s, 0.05, 1.0); b.box(0, 0, 0, 0.12, 0.1, 0.4, G.white); b.pop();
    b.push(); b.translate(1.4 * s, 0.09, 0.2); b.extrude([[0, -0.1], [0.9 * s, 0.55], [0.8 * s, 0.7], [0, 0.15]], 0.02, ivory, ivory); b.pop();
  }
  return b.build('maestro');
}

function buildModels() {
  MODELS.player = buildShip(C.blue, C.blueD, C.yellow);
  MODELS.bassline = buildBassline();
  MODELS.arpeggio = buildArpeggio();
  MODELS.maestro = buildMaestro();
  MODELS.oz = buildShip(C.green, hex('#237a3a'), C.yellow);
  MODELS.sable = buildShip(C.purple, hex('#4a2a99'), hex('#ffd23f'));
  MODELS.tobi = buildShip(C.orange, hex('#b35a12'), C.white);

  // --- Static enemies --------------------------------------------------------
  { // Drone: dark crystal diamond with fins and a magenta eye
    const b = new MB();
    b.diamond(1.1, 0.55, 1.5, 0.9, (i) => (i < 4 ? C.stHi : C.stBody));
    for (const s of [1, -1]) {
      b.push(); b.translate(0.7 * s, 0, 0.3); b.rotateZ(0.5 * s);
      b.extrude([[0, -0.3], [1.1 * s, 0.4], [1.0 * s, 0.7], [0, 0.5]], 0.08, C.stMetal, C.stDark);
      b.pop();
    }
    b.push(); b.translate(0, 0.12, -0.95); b.diamond(0.35, 0.22, 0.35, 0.1, G.magenta); b.pop();
    b.push(); b.translate(0, 0, 0.95); b.diamond(0.3, 0.2, 0.05, 0.3, G.red); b.pop();
    MODELS.drone = b.build('drone');
    // animated variant: body and a spinning fin ring are separate meshes
    const bb = new MB();
    bb.diamond(1.1, 0.55, 1.5, 0.9, (i) => (i < 4 ? C.stHi : C.stBody));
    bb.push(); bb.translate(0, 0.12, -0.95); bb.diamond(0.35, 0.22, 0.35, 0.1, G.magenta); bb.pop();
    bb.push(); bb.translate(0, 0, 0.95); bb.diamond(0.3, 0.2, 0.05, 0.3, G.red); bb.pop();
    MODELS.droneBody = bb.build('droneBody');
    const fb = new MB();
    for (let i = 0; i < 3; i++) {
      fb.push(); fb.rotateZ((i / 3) * TAU); fb.translate(0, 0.62, 0.3);
      fb.push(); fb.rotateZ(PI / 2); fb.extrude([[0, -0.35], [0.95, 0.35], [0.85, 0.65], [0, 0.45]], 0.08, C.stMetal, C.stDark); fb.pop();
      fb.box(0, 0.95, 0.5, 0.1, 0.1, 0.18, G.magenta);
      fb.pop();
    }
    MODELS.droneFins = fb.build('droneFins');
  }
  { // Swooper: bat/crescent wing, twin red eyes
    const b = new MB();
    const wing = [[0, -0.8], [1.2, -0.2], [2.9, -0.6], [2.6, 0.4], [1.8, 0.2], [1.3, 0.9], [0.5, 0.5], [0, 1.1]];
    b.extrude(wing, 0.22, C.stBody, C.stDark, 0.12);
    b.extrude(wing.map(([x, z]) => [-x, z]), 0.22, C.stBody, C.stDark, 0.12);
    b.push(); b.translate(0, 0.15, -0.1); b.scale(0.8, 0.6, 1.4); b.sphere(0.6, 6, 4, C.stHi); b.pop();
    for (const s of [1, -1]) { b.push(); b.translate(0.22 * s, 0.35, -0.72); b.box(0, 0, 0, 0.22, 0.12, 0.12, G.red); b.pop(); }
    MODELS.swooper = b.build('swooper');
    // animated variant: body + two hinged wings that flap
    const body = new MB();
    body.push(); body.translate(0, 0.15, -0.1); body.scale(0.8, 0.6, 1.4); body.sphere(0.6, 6, 4, C.stHi); body.pop();
    for (const s of [1, -1]) { body.push(); body.translate(0.22 * s, 0.35, -0.72); body.box(0, 0, 0, 0.22, 0.12, 0.12, G.red); body.pop(); }
    body.push(); body.translate(0, -0.1, 0.55); body.lathe([[0.3, 0], [0, 1.2]], 5, C.stBody, {}); body.pop();
    MODELS.swooperBody = body.build('swooperBody');
    for (const [name, sg] of [['swooperWingR', 1], ['swooperWingL', -1]]) {
      const w = new MB();
      w.extrude(wing.map(([x, z]) => [x * sg, z]), 0.22, C.stBody, C.stDark, 0.12);
      w.push(); w.translate(2.3 * sg, 0.2, -0.3); w.box(0, 0, 0, 0.5, 0.08, 0.1, G.magenta); w.pop();
      MODELS[name] = w.build(name);
    }
  }
  { // Turret: ground cannon
    const b = new MB();
    b.cylinder(1.8, 1.4, 0, 0.8, 8, C.stMetal);
    b.cylinder(1.4, 1.3, 0.8, 1.1, 8, C.stDark);
    b.push(); b.translate(0, 1.1, 0); b.sphere(1.1, 8, 4, C.stBody); b.pop();
    for (const s of [1, -1]) { b.push(); b.translate(0.4 * s, 1.6, -0.9); b.box(0, 0, 0, 0.25, 0.25, 1.9, C.stDark); b.box(0, 0, -1.0, 0.32, 0.32, 0.2, G.red); b.pop(); }
    b.push(); b.translate(0, 1.85, -0.75); b.box(0, 0, 0, 0.6, 0.18, 0.2, G.magenta); b.pop();
    MODELS.turret = b.build('turret');
    // animated variant: fixed base + gun head that aims and recoils (pivot at origin)
    const tb = new MB();
    tb.cylinder(1.8, 1.4, 0, 0.8, 8, C.stMetal);
    tb.cylinder(1.4, 1.3, 0.8, 1.1, 8, C.stDark);
    for (let i = 0; i < 6; i++) { tb.push(); tb.rotateY((i / 6) * TAU); tb.box(0, 0.45, 1.6, 0.5, 0.25, 0.25, i % 2 ? G.magenta : C.stDark); tb.pop(); }
    MODELS.turretBase = tb.build('turretBase');
    const tg = new MB();
    tg.sphere(1.1, 8, 4, C.stBody);
    for (const s of [1, -1]) { tg.push(); tg.translate(0.4 * s, 0.5, -0.9); tg.box(0, 0, 0, 0.25, 0.25, 1.9, C.stDark); tg.box(0, 0, -1.0, 0.32, 0.32, 0.2, G.red); tg.pop(); }
    tg.push(); tg.translate(0, 0.75, -0.75); tg.box(0, 0, 0, 0.6, 0.18, 0.2, G.magenta); tg.pop();
    MODELS.turretGun = tg.build('turretGun');
  }
  { // Carrier: large hexagonal hull with glowing vents
    const b = new MB();
    b.push(); b.scale(1, 0.4, 1.3);
    b.lathe([[3.5, -1.2], [4.8, -0.2], [4.6, 0.6], [2.6, 1.6], [0, 1.9]], 6, (j) => (j < 2 ? C.stBody : C.stHi), { capBottom: true, phase: PI / 6 });
    b.pop();
    b.push(); b.translate(0, 0.6, 0); b.scale(1, 0.5, 1); b.sphere(1.6, 8, 4, C.stDark); b.pop();
    b.push(); b.translate(0, 0.75, -1.0); b.box(0, 0, 0, 1.4, 0.3, 0.3, G.magenta); b.pop();
    for (const s of [1, -1]) {
      b.push(); b.translate(3.2 * s, 0, 1.2); b.box(0, 0, 0, 1.2, 0.8, 2.4, C.stMetal); b.box(0, 0, 1.25, 0.9, 0.5, 0.1, G.orange); b.pop();
      b.push(); b.translate(4.2 * s, 0.1, -1.2); b.box(0, 0, 0, 0.3, 0.3, 0.3, G.red); b.pop();
    }
    MODELS.carrier = b.build('carrier');
  }
  { // Spinner core + plate
    const b = new MB();
    b.ico(1.0, 1, C.stBody);
    b.push(); b.scale(0.55); b.ico(1, 0, G.magenta); b.pop();
    MODELS.spinnerCore = b.build('spinnerCore');
    const p = new MB();
    p.push(); p.rotateX(PI / 2);
    p.extrude([[-1.1, -0.35], [1.1, -0.35], [0.8, 0.35], [-0.8, 0.35]], 0.3, C.stMetal, C.stDark);
    p.pop();
    p.box(0, 0.4, 0, 1.0, 0.08, 0.34, G.magenta);
    MODELS.plate = p.build('plate');
  }
  { // Mine: spiked ball
    const b = new MB();
    b.ico(1.0, 1, (x, y, z) => (y > 0.3 ? C.stHi : C.stBody));
    const t = (1 + Math.sqrt(5)) / 2;
    const dirs = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    for (const d of dirs) {
      const l = Math.hypot(...d), nx = d[0] / l, ny = d[1] / l, nz = d[2] / l;
      b.push(); b.translate(nx * 0.85, ny * 0.85, nz * 0.85);
      // orient +Y to (nx,ny,nz)
      const yaw = Math.atan2(nx, nz), pitch = Math.acos(clamp(ny, -1, 1));
      b.rotateY(yaw); b.rotateX(pitch);
      b.cylinder(0.25, 0, 0, 0.8, 4, G.red, false);
      b.pop();
    }
    MODELS.mine = b.build('mine');
  }
  { // Sniper: long needle with a big lens
    const b = new MB();
    b.push(); b.rotateX(-PI / 2);
    b.lathe([[0.1, -2.2], [0.5, -1.0], [0.7, 0.6], [0.4, 1.8], [0, 2.4]], 5, (j) => (j % 2 ? C.stHi : C.stBody), {});
    b.pop();
    b.push(); b.translate(0, 0, -1.9); b.rotateX(-PI / 2); b.disc(0.45, 0, 8, G.cyan, false); b.pop();
    for (const s of [1, -1]) { b.push(); b.translate(0.6 * s, 0, 0.6); b.rotateZ(0.3 * s); b.extrude([[0, -0.5], [1.4 * s, 0.6], [1.3 * s, 1.0], [0, 0.8]], 0.08, C.stMetal, C.stDark); b.pop(); }
    MODELS.sniper = b.build('sniper');
  }
  { // Enemy bullet core (unlit orb)
    const b = new MB(); b.ico(0.5, 0, G.pink); MODELS.orb = b.build('orb');
  }
  { // Debris shards
    const b = new MB();
    b.tri([0, 0.4, 0], [0.35, -0.2, 0.2], [-0.35, -0.2, 0.2], [1, 1, 1]);
    b.tri([0, 0.4, 0], [0, -0.2, -0.4], [0.35, -0.2, 0.2], [0.8, 0.8, 0.8]);
    b.tri([0, 0.4, 0], [-0.35, -0.2, 0.2], [0, -0.2, -0.4], [0.9, 0.9, 0.9]);
    b.tri([0.35, -0.2, 0.2], [0, -0.2, -0.4], [-0.35, -0.2, 0.2], [0.6, 0.6, 0.6]);
    MODELS.shard = b.build('shard');
  }
  { // Blob shadow (flat disc, drawn translucent)
    const b = new MB(); b.disc(1, 0, 10, [0, 0, 0, 0], false); MODELS.shadow = b.build('shadow');
  }
  { // Explosion shell (low-poly sphere, unlit white; tinted at draw)
    const b = new MB(); b.ico(1, 1, [1, 1, 1, 0]); MODELS.shell = b.build('shell');
  }

  // --- Pickups -----------------------------------------------------------------
  { const b = new MB(); b.push(); b.rotateX(PI / 2); b.torus(2.3, 0.3, 16, 5, [1, 1, 1]); b.pop(); MODELS.ring = b.build('ring'); }
  { const b = new MB(); b.push(); b.rotateX(PI / 2); b.torus(9, 0.7, 24, 6, (i) => (i % 3 === 0 ? G.cyan : C.white)); b.pop(); MODELS.gate = b.build('gate'); }
  { // Nova bomb pickup
    const b = new MB();
    b.sphere(0.9, 8, 5, C.red);
    b.push(); b.translate(0, 0.85, 0); b.cylinder(0.3, 0.3, 0, 0.35, 6, C.grey); b.pop();
    for (let i = 0; i < 4; i++) { b.push(); b.rotateY(i * PI / 2); b.translate(0, -0.3, 0.75); b.box(0, 0, 0, 0.08, 0.6, 0.5, C.yellow); b.pop(); }
    b.push(); b.translate(0, 0, -0.85); b.box(0, 0, 0, 0.5, 0.5, 0.08, G.yellow); b.pop();
    MODELS.bomb = b.build('bomb');
  }
  { // Laser upgrade: green crystal with ring
    const b = new MB();
    b.diamond(0.7, 1.1, 0.7, 0.7, (i) => (i % 2 ? G.green : glow('#2fbf55')));
    b.push(); b.torus(1.3, 0.12, 12, 4, C.white); b.pop();
    MODELS.laserUp = b.build('laserUp');
  }
  // Power-ups: each faces the camera (x-y plane) and spins slowly.
  { const b = new MB(); // CHORD: three bolts fanning out
    for (const a of [-0.55, 0, 0.55]) { b.push(); b.rotateZ(a); b.translate(0, 0.8, 0); b.diamond(0.24, 0.55, 0.24, 0.24, (i) => (i % 2 ? G.pink : G.magenta)); b.pop(); }
    b.push(); b.translate(0, -0.3, 0); b.sphere(0.32, 6, 4, G.magenta); b.pop();
    b.push(); b.rotateX(PI / 2); b.torus(1.35, 0.09, 14, 4, C.white); b.pop();
    MODELS.puChord = b.build('puChord'); }
  { const b = new MB(); // ECHO: twin ghost ships
    b.push(); b.rotateX(PI / 2);
    for (const s of [-1, 1]) { b.push(); b.translate(0.55 * s, 0, 0); b.extrude([[0, -0.65], [0.45, 0.4], [0, 0.18], [-0.45, 0.4]], 0.2, G.cyan, glow('#2a9fbf')); b.pop(); }
    b.pop();
    b.push(); b.rotateX(PI / 2); b.torus(1.35, 0.09, 14, 4, C.white); b.pop();
    MODELS.puEcho = b.build('puEcho'); }
  { const b = new MB(); // TEMPO: fast-forward chevrons
    b.push(); b.rotateX(PI / 2);
    for (const o of [-0.3, 0.4]) b.extrude([[o - 0.35, -0.7], [o + 0.35, 0], [o - 0.35, 0.7], [o - 0.62, 0.7], [o + 0.06, 0], [o - 0.62, -0.7]], 0.22, G.yellow, glow('#c9a000'));
    b.pop();
    b.push(); b.rotateX(PI / 2); b.torus(1.35, 0.09, 14, 4, C.white); b.pop();
    MODELS.puTempo = b.build('puTempo'); }
  { const b = new MB(); // HARMONY: a core with three orbiting notes
    b.sphere(0.45, 8, 5, G.blue);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + PI / 2; b.push(); b.translate(Math.cos(a), Math.sin(a), 0); b.sphere(0.22, 6, 4, G.cyan); b.pop(); }
    b.push(); b.rotateX(PI / 2); b.torus(1.0, 0.05, 16, 3, C.white); b.pop();
    MODELS.puHarmony = b.build('puHarmony'); }
  { const b = new MB(); // FORTISSIMO: a star (tinted rainbow when drawn)
    const pts = []; for (let k = 0; k < 10; k++) { const a = -PI / 2 + (k * PI) / 5, r = k % 2 ? 0.5 : 1.25; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    b.push(); b.rotateX(PI / 2); b.extrude(pts, 0.35, G.white, glow('#d0d0d0')); b.pop();
    MODELS.puFortissimo = b.build('puFortissimo'); }
  { const b = new MB(); // ENCORE: a heart (extra ship)
    const pts = []; for (let k = 0; k < 20; k++) { const t = (k / 20) * TAU; pts.push([Math.pow(Math.sin(t), 3) * 1.0, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]); }
    b.push(); b.rotateX(PI / 2); b.extrude(pts, 0.35, G.red, glow('#a01830')); b.pop();
    b.push(); b.rotateX(PI / 2); b.torus(1.35, 0.09, 14, 4, C.white); b.pop();
    MODELS.puEncore = b.build('puEncore'); }
  { const b = new MB(); // Prism pod: the crystal shell a power-up rides in
    b.diamond(1.5, 2.1, 1.5, 1.5, (i) => (i % 2 ? [0.85, 0.95, 1] : [0.55, 0.8, 1]));
    b.push(); b.torus(1.7, 0.1, 16, 4, G.cyan); b.pop();
    MODELS.prism = b.build('prism'); }
  { const b = new MB(); // Echo drone that flies beside you
    b.diamond(0.45, 0.2, 0.95, 0.5, (i) => (i % 2 ? G.cyan : glow('#2a9fbf')));
    for (const s of [1, -1]) { b.push(); b.translate(0.4 * s, 0, 0.3); b.box(0, 0, 0, 0.5, 0.05, 0.3, G.white); b.pop(); }
    MODELS.echo = b.build('echo'); }
  { const b = new MB(); // Hangar launch pad
    b.cylinder(3.3, 3.5, -0.3, 0, 8, C.dark, true, PI / 8);
    b.cylinder(2.2, 2.2, 0, 0.03, 8, hex('#3a4258'), true, PI / 8);
    b.push(); b.translate(0, 0.04, 0); b.torus(3.1, 0.08, 32, 4, G.cyan); b.pop();
    b.push(); b.translate(0, 0.05, 0); b.torus(1.9, 0.05, 24, 3, G.blue); b.pop();
    for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * TAU; b.box(Math.cos(a) * 2.65, 0.03, Math.sin(a) * 2.65, 0.28, 0.05, 0.28, G.cyan); }
    MODELS.pad = b.build('pad'); }
  { // Tuning fork (secret collectible)
    const b = new MB();
    b.cylinder(0.12, 0.12, -1.6, -0.2, 6, C.yellow);
    b.push(); b.translate(0, -0.2, 0); b.rotateZ(PI / 2); b.cylinder(0.14, 0.14, -0.55, 0.55, 6, C.yellow); b.pop();
    for (const s of [1, -1]) { b.push(); b.translate(0.55 * s, 0, 0); b.cylinder(0.14, 0.12, -0.2, 1.7, 6, C.yellow); b.pop(); }
    b.push(); b.translate(0, -1.7, 0); b.sphere(0.22, 6, 4, C.yellow); b.pop();
    MODELS.fork = b.build('fork');
  }

  // --- Scenery ---------------------------------------------------------------
  { // Palm tree
    const b = new MB();
    let x = 0, y = 0;
    for (let i = 0; i < 5; i++) {
      const nx = x + 0.35 + i * 0.08, ny = y + 2.2;
      b.push(); b.translate(x, y, 0); b.rotateZ(-Math.atan2(nx - x, 2.2));
      b.cylinder(0.42 - i * 0.05, 0.37 - i * 0.05, 0, 2.3, 5, i % 2 ? C.wood : hex('#7a4d22'), false);
      b.pop(); x = nx; y = ny;
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      b.push(); b.translate(x, y, 0); b.rotateY(a); b.rotateX(0.25);
      const leaf = [[0, 0, 0], [0.9, 0.3, 1.8], [0.2, -0.6, 4.0], [-0.9, 0.3, 1.8]];
      b.quad(leaf[0], leaf[1], leaf[2], leaf[3], i % 2 ? C.leaf : C.leafD);
      b.quad(leaf[0], leaf[3], leaf[2], leaf[1], C.leafD);
      b.pop();
    }
    b.push(); b.translate(x, y - 0.2, 0); b.sphere(0.5, 5, 3, hex('#6b4a1e')); b.pop();
    MODELS.palm = b.build('palm');
  }
  { // Sea arch (sandstone)
    const b = new MB();
    const col = (j) => (j % 2 ? C.sand : C.sandD);
    const segs = 9, R = 13, r0 = 3.2;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * PI, a1 = ((i + 1) / segs) * PI;
      const P = (a, rr, z) => [Math.cos(a) * (R + rr), Math.sin(a) * (R + rr), z];
      for (const [z0, z1] of [[-3, 3]]) {
        b.quad(P(a1, r0, z1), P(a0, r0, z1), P(a0, r0, z0), P(a1, r0, z0), col(i));
        b.quad(P(a1, -r0, z0), P(a0, -r0, z0), P(a0, -r0, z1), P(a1, -r0, z1), C.sandD);
        b.quad(P(a1, -r0, z1), P(a0, -r0, z1), P(a0, r0, z1), P(a1, r0, z1), col(i + 1));
        b.quad(P(a1, r0, z0), P(a0, r0, z0), P(a0, -r0, z0), P(a1, -r0, z0), col(i + 1));
      }
    }
    for (const s of [1, -1]) b.box(R * s, -8, 0, r0 * 2.2, 16, 6.6, { side: C.sandD, top: C.sand, all: C.sand });
    MODELS.arch = b.build('arch');
  }
  { // Lighthouse tower
    const b = new MB();
    b.lathe([[4, 0], [3.4, 10], [2.8, 20], [2.6, 26]], 8, (j) => (j % 2 ? C.red : C.white), {});
    b.cylinder(3.2, 3.2, 26, 27, 8, C.dark);
    b.cylinder(2.2, 2.2, 27, 30, 8, G.yellow, false);
    b.cylinder(3.0, 0, 30, 33.5, 8, C.red);
    MODELS.lighthouse = b.build('lighthouse');
  }
  { // Coastal house block (textured windows)
    const b = new MB();
    b.box(0, 5, 0, 8, 10, 8, { top: hex('#dfe6ee'), side: hex('#f1efe6') }, 0.125);
    b.push(); b.translate(0, 10, 0);
    b.quad([-4.4, 0, 4.4], [4.4, 0, 4.4], [0, 3.5, 0], [0, 3.5, 0], hex('#3a6fd8'));
    b.tri([4.4, 0, 4.4], [4.4, 0, -4.4], [0, 3.5, 0], hex('#2f5cb8'));
    b.tri([4.4, 0, -4.4], [-4.4, 0, -4.4], [0, 3.5, 0], hex('#3a6fd8'));
    b.tri([-4.4, 0, -4.4], [-4.4, 0, 4.4], [0, 3.5, 0], hex('#2f5cb8'));
    b.pop();
    MODELS.house = b.build('house');
  }
  { // Silence pylon (enemy structure; destructible)
    const b = new MB();
    b.lathe([[3, 0], [2.2, 14], [1.2, 30], [0, 34]], 4, (j) => (j % 2 ? C.stBody : C.stHi), { phase: PI / 4 });
    for (const y of [8, 16, 24]) { b.push(); b.translate(0, y, 0); b.torus(3.2 - y * 0.06, 0.25, 12, 4, G.magenta); b.pop(); }
    MODELS.pylon = b.build('pylon');
  }
  { // Asteroid variations
    MODELS.asteroids = [];
    for (let k = 0; k < 4; k++) {
      const b = new MB(), seed = k * 13.7;
      const base = [hex('#8a7a66'), hex('#6e6457'), hex('#9b8c7a'), hex('#5e5448')][k];
      b.ico(1, 1, (x, y, z) => mixc(base, [0.35, 0.3, 0.28], clamp(vnoise2(x * 3 + seed, z * 3 + y) * 0.9, 0, 1)), (x, y, z) => 0.75 + vnoise2(x * 2.3 + seed, y * 2.3 + z * 1.7) * 0.5);
      MODELS.asteroids.push(b.build('asteroid' + k));
    }
  }
  { // Mining station module
    const b = new MB();
    b.push(); b.rotateZ(PI / 2); b.cylinder(4, 4, -9, 9, 8, C.grey); b.pop();
    for (const s of [1, -1]) { b.push(); b.translate(9.5 * s, 0, 0); b.rotateZ(PI / 2); b.cylinder(4.5, 4.5, -0.6, 0.6, 8, C.yellow); b.pop(); }
    b.box(0, 5, 0, 4, 3, 4, C.dark);
    b.box(0, 6.8, 0, 3, 0.6, 3, G.cyan);
    b.box(0, -6, 0, 1.2, 8, 1.2, C.dark);
    for (const s of [1, -1]) { b.push(); b.translate(0, 0, 4.1 * s); b.box(0, 0, 0, 10, 1.2, 0.3, G.yellow); b.pop(); }
    MODELS.station = b.build('station');
  }
  { // Solar panel strut
    const b = new MB();
    b.box(0, 0, 0, 30, 0.6, 0.6, C.grey);
    for (const s of [1, -1]) b.box(12 * s, 0, 0, 8, 0.2, 14, { top: hex('#2a4f9a'), bottom: C.dark, side: C.grey });
    MODELS.panel = b.build('panel');
  }
  { // Pine tree (snowy)
    const b = new MB();
    b.cylinder(0.5, 0.4, 0, 2, 5, C.wood, false);
    for (let i = 0; i < 3; i++) {
      const y = 1.5 + i * 2.6, r = 3.2 - i * 0.8;
      b.cylinder(r, 0, y, y + 4, 7, C.pine, false);
      b.cylinder(r * 0.55, 0, y + 1.8, y + 4.05, 7, C.snow, false);
    }
    MODELS.pine = b.build('pine');
  }
  { // Ice crystal cluster
    const b = new MB();
    const iceCol = (i) => (i % 2 ? C.ice : hex('#dff8ff'));
    const parts = [[0, 0, 0, 0, 1.4, 7], [1.5, 0, 0.6, 0.4, 1, 4.5], [-1.4, 0, -0.4, -0.35, 1, 5], [0.4, 0, -1.4, 0.1, 0.8, 3.5]];
    for (const [x, y, z, lean, r, h] of parts) {
      b.push(); b.translate(x, y, z); b.rotateZ(lean); b.rotateX(lean * 0.6);
      b.lathe([[r, 0], [r * 1.1, h * 0.7], [0, h]], 6, iceCol, {});
      b.pop();
    }
    MODELS.crystal = b.build('crystal');
  }
  { // Forge chimney
    const b = new MB();
    b.lathe([[4, 0], [3.2, 26], [3.5, 28]], 8, (j) => (j ? C.dark : hex('#3a3030')), {});
    b.push(); b.translate(0, 27, 0); b.torus(3.1, 0.35, 10, 4, G.orange); b.pop();
    b.cylinder(3.0, 3.0, 27.9, 28.1, 8, G.orange, true);
    MODELS.chimney = b.build('chimney');
  }
  { // Forge pipe arch (fly under)
    const b = new MB();
    b.push(); b.rotateZ(PI / 2); b.cylinder(1.6, 1.6, -26, 26, 8, hex('#6a5a50')); b.pop();
    for (const x of [-18, 0, 18]) { b.push(); b.translate(x, 0, 0); b.rotateZ(PI / 2); b.cylinder(2.0, 2.0, -0.6, 0.6, 8, G.orange); b.pop(); }
    for (const s of [1, -1]) b.box(26 * s, -14, 0, 4, 28, 4, { side: hex('#3a2e2a'), top: hex('#5a4a44'), all: hex('#3a2e2a') });
    MODELS.pipeArch = b.build('pipeArch');
  }
  { // Lava geyser vent
    const b = new MB();
    b.lathe([[6, 0], [4.2, 3.5], [2.4, 4.5], [1.8, 3.8]], 8, (j) => (j === 2 ? hex('#5a2a1a') : C.lavaRock), {});
    b.disc(1.8, 3.8, 8, G.orange, false);
    MODELS.vent = b.build('vent');
    const e = new MB(); e.cylinder(1.4, 3.2, 0, 1, 8, G.orange, false); MODELS.geyser = e.build('geyser');
  }
  { // Void monolith
    const b = new MB();
    b.box(0, 12, 0, 5, 24, 2.5, { side: hex('#1a1824'), top: hex('#3a3848'), all: hex('#1a1824') });
    b.box(0, 12, -1.3, 0.4, 20, 0.1, G.white);
    MODELS.monolith = b.build('monolith');
  }
  { // Glitch cube
    const b = new MB();
    b.box(0, 0, 0, 2, 2, 2, { top: hex('#e8e6f0'), side: hex('#9a98a8'), front: hex('#c8c6d0'), all: hex('#9a98a8') });
    MODELS.cube = b.build('cube');
  }
  { // Planet (for briefing & backgrounds) — generic sphere tinted per use
    const b = new MB(); b.sphere(1, 18, 12, [1, 1, 1]); b.smoothNormals(80); MODELS.planet = b.build('planet');
    const r = new MB(); r.push(); r.rotateX(PI / 2);
    for (let i = 0; i < 48; i++) {
      const a0 = (i / 48) * TAU, a1 = ((i + 1) / 48) * TAU;
      const p = (a, rad) => [Math.cos(a) * rad, Math.sin(a) * rad, 0];
      const col = i % 2 ? [0.95, 0.85, 0.7] : [0.8, 0.7, 0.55];
      r.quad(p(a0, 1.3), p(a1, 1.3), p(a1, 2.1), p(a0, 2.1), col);
      r.quad(p(a0, 2.1), p(a1, 2.1), p(a1, 1.3), p(a0, 1.3), col);
    }
    r.pop(); MODELS.planetRing = r.build('planetRing');
  }
  { // Mothership "Cadence"
    const b = new MB();
    b.push(); b.rotateX(-PI / 2);
    b.lathe([[3, -30], [9, -24], [11, -5], [10, 14], [5, 30], [0, 34]], 8, (j) => (j % 2 ? C.white : hex('#c8d0e0')), { capBottom: true, phase: PI / 8 });
    b.pop();
    b.push(); b.translate(0, 0, 4); b.torus(22, 1.6, 24, 5, (i) => (i % 4 === 0 ? G.cyan : C.grey)); b.pop();
    for (const a of [0, PI / 2, PI, PI * 1.5]) { b.push(); b.translate(0, 0, 4); b.rotateZ(a); b.box(16, 0, 0, 12, 1.2, 3, C.grey); b.pop(); }
    b.box(0, 11, 4, 5, 6, 14, C.blue);
    b.box(0, 13.5, -1, 4, 1.2, 3, G.cyan);
    for (const s of [1, -1]) { b.push(); b.translate(7 * s, 0, 30); b.rotateX(-PI / 2); b.cylinder(3, 3.5, -2, 2, 8, C.dark); b.disc(3, -2, 8, G.cyan, true); b.pop(); }
    MODELS.cadence = b.build('cadence');
  }
}

// 3D voxel title logo, extruded from the bitmap font. Returns a Mesh.
function buildLogoMesh(text, opts = {}) {
  const b = new MB();
  const vs = opts.voxel || 1, depth = opts.depth || 1.6;
  const w = Font.width(text);
  const cols = opts.colors || ((x, y) => [1, 1, 1]);
  let cx = -w / 2;
  for (const ch of text) {
    const rows = Font.bitmap(ch);
    if (rows) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
      if (rows[y][x] !== '1') continue;
      const px = (cx + x + 0.5) * vs, py = (3.5 - y) * vs;
      const top = cols(cx + x, y), side = [top[0] * 0.55, top[1] * 0.55, top[2] * 0.6];
      b.box(px, py, 0, vs * 1.001, vs * 1.001, depth, { front: top, top: mixc(top, [1, 1, 1], 0.3), bottom: side, side, back: side, left: side, right: side });
    }
    cx += 6;
  }
  return b.build('logo:' + text);
}
