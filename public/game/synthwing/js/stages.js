'use strict';
// =============================================================================
// SYNTHWING 64 — stages.js
// Five hand-scripted stages. Timelines are written in musical bars so enemy
// waves arrive on downbeats.
// =============================================================================

// Formation helpers → arrays of [x, y]
const F = {
  V: (n, s = 4, cx = 0, cy = 0) => { const o = [[cx, cy]]; for (let i = 1; o.length < n; i++) { o.push([cx - i * s, cy + i * s * 0.45]); if (o.length < n) o.push([cx + i * s, cy + i * s * 0.45]); } return o; },
  line: (n, s = 5, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + (i - (n - 1) / 2) * s, cy]),
  col: (n, s = 4, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx, cy + (i - (n - 1) / 2) * s]),
  arc: (n, r = 12, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => { const a = PI * (0.15 + 0.7 * (i / Math.max(1, n - 1))); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6 - r * 0.3]; }),
  grid: (cols, rows, s = 6, cx = 0, cy = 0) => { const o = []; for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) o.push([cx + (i - (cols - 1) / 2) * s, cy + (j - (rows - 1) / 2) * s]); return o; },
  box: (s = 8, cx = 0, cy = 0) => [[cx - s, cy - s], [cx + s, cy - s], [cx - s, cy + s], [cx + s, cy + s]],
};

// Script verbs (each returns fn(G))
const say = (who, text, prio) => (G) => G.say(who, text, prio);
const sayT = (who, touch, keys) => (G) => G.say(who, Input.lastDevice === 'touch' || Input.touchSeen ? touch : keys);
const wave = (type, ai, slots, o = {}) => (G) => slots.forEach(([x, y], i) => G.spawnEnemy(type, ai, Object.assign({ x, y, phase: i * 0.8, off: (o.off || (ai === 'pass' ? 190 : 170)) + (o.stagger || 0) * i }, o)));
const ground = (type, list) => (G) => list.forEach(([off, x]) => G.spawnGround(type, off, x));
const prop = (kind, list, o = {}) => (G) => list.forEach(([off, x, y]) => G.spawnProp(kind, off, x, y, o));
const rings = (list, kind = 'ring') => (G) => list.forEach(([off, x, y]) => G.spawnPickup(kind, G.player.d + off, x, y));
const item = (kind, off, x, y) => (G) => G.spawnPickup(kind, G.player.d + off, x, y);
const trouble = (who, line) => (G) => { const w = G.wing(who); if (w && w.hp > 0 && w.trouble()) G.say(who, line, true); };
const join = (whoList, line, who) => (G) => { whoList.forEach((w) => { const m = G.wing(w); if (m && m.hp > 0) m.setState('join'); }); if (line) G.say(who || whoList[0], line); };
const leave = (whoList) => (G) => whoList.forEach((w) => { const m = G.wing(w); if (m && m.state === 'formation') m.setState('leave'); });
const checkpoint = () => (G) => G.spawnProp('gate', 200, 0, 'rail', { scale: 1.1 });
const warn = () => (G) => G.warning();
const boss = (k) => (G) => G.startBoss(k);
const fork = (off, x, y) => (G) => G.spawnPickup('fork', G.player.d + off, x, y);
const all = (...fns) => (G) => fns.forEach((f) => f(G));
const carrier = (x = 0, y = 4, hold = 12) => (G) => G.spawnEnemy('carrier', 'carrier', { x, y, off: 260, hold });

const STAGES = [
  // ===========================================================================
  {
    id: 'corona', num: 1, name: 'CORONA SHORES', sub: 'Take back the song of the sea', env: 'corona', song: 'corona',
    speed: 58, planet: [0.3, 0.6, 1.0],
    railX: (d) => 30 * Math.sin(d * 0.0021) + 12 * Math.sin(d * 0.0057 + 1),
    railY: (d) => 16 + 3 * Math.sin(d * 0.004),
    brief: [['maren', 'Synthwing Squadron! The Hush has silenced six worlds of the Octave Cluster.'], ['maren', 'Corona is next. Its seas are losing their song. Get down there and restore it!'], ['oz', "You heard the Admiral. Stay close, Lead — I'll talk you through it."]],
    medal: 60000, checkpointBar: 24, bossKey: 'conductor',
    script: [
      [0.5, say('maren', "Synthwing, you're clear of the Cadence. Corona's song is fading — take it back!")],
      [2.5, sayT('oz', 'Drag on the left side to steer, Lead. Tap the right side to fire!', 'Steer with WASD or the arrows, Lead. SPACE fires!')],
      [3.5, wave('drone', 'pass', F.line(5, 7, 0, 0), { stagger: 6, fire: 0 })],
      [5.5, sayT('tobi', 'Hold FIRE to paint targets with lock-ons, then let go to launch a volley!', 'Hold SPACE to lock on to targets, then let go to launch a volley!')],
      [6, wave('drone', 'hover', F.V(5, 5, 0, 3), { hold: 6, fire: 0.08 })],
      [8, all(leave(['oz', 'sable', 'tobi']), say('sable', "Try to keep up, Lead. Breaking formation!"))],
      [9, rings([[150, -6, 0], [185, 0, 2], [220, 6, 0]])],
      [10, wave('drone', 'swoop', F.line(4, 5, -6, 4), { side: -1, hold: 4 })],
      [11, wave('drone', 'swoop', F.line(4, 5, 6, -2), { side: 1, hold: 4 })],
      [12.5, ground('turret', [[240, -18], [270, 16], [300, -6]])],
      [14, all(prop('arch', [[260, 0, 'water'], [330, 0, 'water'], [400, 0, 'water']], { scale: 1.5, bonus: true }), rings([[330, 0, -5]], 'gold'))],
      [15, say('oz', 'Thread those arches — dive low and fly through!')],
      [17, all(say('oz', 'Bogeys on our six! They came from behind!', true), wave('swooper', 'behind', F.line(4, 8, 0, 6), { hold: 5 }))],
      [19.5, all(item('laser', 180, 0, 2), say('tobi', 'Grab that green crystal — it upgrades your laser!'))],
      [21, all(say('tobi', 'A whole ring of them! Lock on to all eight!'), wave('drone', 'circle', Array.from({ length: 8 }, () => [0, 2]), { radius: 10, hold: 7, dist: 70 }))],
      [21, (G) => G.enemies.slice(-8).forEach((e, i) => { e.phase = (i / 8) * TAU; })],
      [24, all(checkpoint(), say('maren', 'Checkpoint ahead. Fly through the gate and the Cadence will log your position.'))],
      [26, trouble('tobi', "Lead! Help! Something's stuck to my tail!")],
      [28, all(ground('turret', [[220, -12], [250, 12]]), prop('lighthouse', [[240, -26, 'ground'], [300, 24, 'ground']]))],
      [29, all(say('oz', "See those dark pylons? They're draining the sea's song. Knock 'em down!"), ground('pylon', [[260, -12], [300, 10], [340, -2]]))],
      [31, wave('mine', 'pass', F.grid(4, 2, 9, 0, 1), { stagger: 12, off: 200 })],
      [32, rings([[200, -8, 4], [215, 8, 4]])],
      [33, all(say('sable', 'Carrier inbound! It keeps launching drones — take it out fast!', true), carrier(0, 5, 12))],
      [38, all(say('tobi', 'Their shields close on the downbeat! Shoot when they open — or lock on!'), wave('spinner', 'spinner', [[-9, 2], [9, 2]], { hold: 9 }))],
      [40, fork(240, 15, 10)],
      [41, trouble('sable', "Tch — I've got a tail. ...Lead, a little help?")],
      [43, wave('swooper', 'behind', F.V(5, 6, 0, 4), { hold: 5 })],
      [44, item('bomb', 200, -8, 0)],
      [45, all(wave('drone', 'hover', F.grid(4, 2, 7, 0, 2), { hold: 6 }), wave('drone', 'charge', F.line(4, 10, 0, -4), { off: 260, stagger: 20 }))],
      [48, rings([[180, -10, 6], [180, 10, 6], [230, 0, 0]], 'gold')],
      [49, all(join(['oz', 'sable', 'tobi'], 'Regrouping on you, Lead! Something huge is rising out of the sea...', 'oz'))],
      [50, warn()],
      [51, boss('conductor')],
    ],
  },
  // ===========================================================================
  {
    id: 'halo', num: 2, name: 'HALO BELT', sub: 'Tune the silent stones', env: 'halo', song: 'halo',
    speed: 62, planet: [0.8, 0.55, 0.35],
    railX: (d) => 26 * Math.sin(d * 0.0017) + 10 * Math.sin(d * 0.0049 + 2),
    railY: (d) => 10 * Math.sin(d * 0.0023),
    brief: [['maren', "Corona sings again. Well done! But the Hush's fleet is mining the Halo Belt for silence-stone."], ['tobi', "The asteroids there hum at 60 hertz! Well... they used to."], ['sable', "Rocks, drones and a whole lot of nothing. My favorite."]],
    medal: 90000, checkpointBar: 26, bossKey: 'grinder',
    ambient(G, dt) {
      const bar = G.bar;
      const dens = bar < 4 ? 0.3 : bar < 20 ? 1 : bar < 26 ? 0.4 : bar < 44 ? 1.2 : 0.5;
      G.rockAcc = (G.rockAcc || 0) + dt * G.speed * dens * 0.07;
      while (G.rockAcc > 1) {
        G.rockAcc -= 1;
        const big = Math.random() < 0.12;
        const x = rr(-45, 45), y = rr(-28, 28);
        if (!big && Math.abs(x) < 6 && Math.abs(y) < 6 && Math.random() < 0.6) continue;
        G.spawnEnemy(big ? 'bigrock' : 'rock', 'rock', { off: rr(420, 520), x, y, scale: big ? rr(0.9, 1.4) : rr(0.6, 1.3), vx: rr(-2, 2), vy: rr(-2, 2), vd: rr(-8, 8) });
      }
    },
    script: [
      [0.5, say('maren', 'Halo Belt ahead. Watch the rocks — they will tear your hull open.')],
      [2, all(leave(['oz', 'sable', 'tobi']), say('oz', 'Shoot the smaller rocks for points. Steer around the big ones!'))],
      [4, wave('drone', 'hover', F.V(5, 5, 0, 2), { hold: 5 })],
      [6, prop('station', [[300, -20, 'rail+0'], [360, 22, 'rail+6']])],
      [8, wave('drone', 'swoop', F.line(5, 5, 0, 5), { side: -1, hold: 4 })],
      [10, all(say('tobi', "Sniper signature! When you see the red line, move out of it!"), wave('sniper', 'sniper', [[0, 8]], { hold: 10 }))],
      [12, rings([[160, -8, 0], [190, 0, 4], [220, 8, 0]])],
      [13, prop('panel', [[280, 0, 'rail+9'], [360, 0, 'rail-9']])],
      [15, wave('swooper', 'behind', F.line(4, 9, 0, 3), { hold: 5 })],
      [17, all(item('laser', 200, 0, 0), wave('spinner', 'spinner', [[0, 4]], { hold: 8 }))],
      [19, wave('drone', 'circle', Array.from({ length: 10 }, () => [0, 0]), { radius: 11, hold: 6, dist: 75, spinSpeed: -1.4 })],
      [19, (G) => G.enemies.filter((e) => e.ai === 'circle').forEach((e, i) => { e.phase = (i / 10) * TAU; })],
      [22, trouble('sable', 'Lead! This one is faster than it looks — get it off me!')],
      [26, checkpoint()],
      [27, say('maren', "Enemy mining rig ahead. It's feeding something big.")],
      [28, all(prop('station', [[260, -14, 'rail+2'], [300, 16, 'rail-4'], [340, 0, 'rail+14']]), wave('drone', 'pass', F.grid(3, 3, 7, 0, 0), { off: 300, stagger: 4 }))],
      [31, carrier(-6, 4, 12)],
      [33, fork(260, -30, -20)],
      [35, wave('sniper', 'sniper', [[-12, 6], [12, 6]], { hold: 10 })],
      [37, wave('mine', 'pass', F.grid(5, 2, 8, 0, 0), { off: 220, stagger: 10 })],
      [39, trouble('oz', 'Ack, this old tortoise has company! A little help, Lead?')],
      [42, wave('swooper', 'behind', F.V(5, 6, 0, 2), { hold: 5 })],
      [44, all(rings([[200, 0, 0]], 'gold'), item('bomb', 240, 10, 5))],
      [46, wave('drone', 'hover', F.grid(5, 2, 6, 0, 3), { hold: 6 })],
      [49, join(['oz', 'sable', 'tobi'], 'Something is chewing through the asteroids up ahead...', 'tobi')],
      [50, warn()],
      [51, boss('grinder')],
    ],
  },
  // ===========================================================================
  {
    id: 'frost', num: 3, name: 'FROSTLINE', sub: 'The canyon where the aurora sings', env: 'frost', song: 'frost',
    speed: 56, planet: [0.7, 0.9, 1.0],
    railX: (d) => 42 * Math.sin(d * 0.0024) + 14 * Math.sin(d * 0.0061 + 0.5),
    railY: (d) => 12 + 4 * Math.sin(d * 0.003),
    brief: [['maren', 'Frostline. Its aurora once sang so loudly you could hear it from orbit.'], ['oz', "It's a narrow canyon. Mind the walls — and the ice snipers."], ['tobi', "B-b-brr... Why is it always cold where the scary stuff lives?"]],
    medal: 85000, checkpointBar: 20, bossKey: 'serpent',
    script: [
      [0.5, say('maren', 'Entering Frostline canyon. Stay low under the ridge line.')],
      [2, leave(['oz', 'sable', 'tobi'])],
      [3, wave('drone', 'hover', F.V(5, 5, 0, 0), { hold: 5 })],
      [5, ground('turret', [[240, -18], [280, 18], [320, -10], [360, 12]])],
      [7, wave('swooper', 'behind', F.line(3, 9, 0, 4), { hold: 5 })],
      [9, all(wave('drone', 'circle', Array.from({ length: 8 }, () => [0, 0]), { radius: 9, hold: 6, dist: 70 }), (G) => G.enemies.filter((e) => e.ai === 'circle').forEach((e, i) => { e.phase = (i / 8) * TAU; }))],
      [11, rings([[160, 0, -4], [200, -6, 0], [240, 6, 4]])],
      [12, wave('sniper', 'sniper', [[-10, 8], [10, 8]], { hold: 10 })],
      [14, trouble('oz', "Blast! I've picked up a stowaway! Shoot it down, Lead!")],
      [17, all(wave('spinner', 'spinner', [[-8, 0], [8, 4]], { hold: 8 }), item('laser', 220, 0, 0))],
      [20, checkpoint()],
      [21, wave('mine', 'pass', F.grid(4, 3, 8, 0, 0), { off: 200, stagger: 6 })],
      [23, all(say('sable', 'Ice crystals — shatter them for points. They ring like bells!'), (G) => { for (let i = 0; i < 6; i++) G.spawnGround('crystal', 220 + i * 30, i % 2 ? 14 : -14); })],
      [25, fork(220, 0, -8)],
      [26, carrier(0, 6, 11)],
      [30, trouble('tobi', 'Eek! Lead, it keeps shooting at me!')],
      [33, wave('swooper', 'behind', F.V(5, 7, 0, 4), { hold: 5 })],
      [35, all(rings([[200, -6, 2], [200, 6, 2]], 'gold'), item('bomb', 240, 0, 6))],
      [37, join(['oz', 'sable', 'tobi'], "The canyon's shaking... something's singing in the ice!", 'sable')],
      [38, warn()],
      [39, boss('serpent')],
    ],
  },
  // ===========================================================================
  {
    id: 'forge', num: 4, name: 'THE FORGE', sub: 'Where silence is hammered into steel', env: 'forge', song: 'forge',
    speed: 64, planet: [1.0, 0.45, 0.2],
    railX: (d) => 28 * Math.sin(d * 0.0019) + 10 * Math.sin(d * 0.0053 + 1.5),
    railY: (d) => 17 + 3 * Math.sin(d * 0.005),
    brief: [['maren', "The Forge. The Hush's factories build every Static unit here."], ['sable', 'Finally, something worth shooting at.'], ['oz', 'Lava geysers erupt on the beat. Listen to the music and time your path!']],
    medal: 75000, checkpointBar: 26, bossKey: 'anvil',
    script: [
      [0.5, say('maren', 'Heat readings are off the charts. Keep your shields up!')],
      [2, leave(['oz', 'sable', 'tobi'])],
      [3, prop('chimney', [[240, -24, 'ground'], [280, 24, 'ground'], [330, -20, 'ground']])],
      [4, wave('drone', 'hover', F.V(5, 5, 0, 3), { hold: 5 })],
      [6, prop('vent', [[220, -8, 'ground'], [260, 8, 'ground'], [300, 0, 'ground']])],
      [7, say('oz', 'Geysers! They blow on the downbeat — go between them!')],
      [9, all(prop('pipeArch', [[250, 0, 'rail+6'], [320, 0, 'rail+2']]), say('tobi', 'Fly under the pipes!'))],
      [11, ground('turret', [[230, -14], [260, 14], [290, -6], [320, 8]])],
      [13, wave('swooper', 'behind', F.line(4, 8, 0, 5), { hold: 5 })],
      [15, all(wave('spinner', 'spinner', [[-10, 2], [10, 2]], { hold: 8 }), item('laser', 220, 0, 0))],
      [18, trouble('sable', "Hot on my tail, Lead! Literally!")],
      [21, carrier(0, 5, 12)],
      [24, prop('vent', [[200, -12, 'ground'], [230, 4, 'ground'], [260, 12, 'ground'], [290, -4, 'ground']])],
      [26, checkpoint()],
      [27, wave('sniper', 'sniper', [[-12, 8], [0, 10], [12, 8]], { hold: 10 })],
      [29, all(prop('chimney', [[220, -16, 'ground'], [250, 16, 'ground']]), wave('drone', 'charge', F.line(6, 7, 0, 0), { off: 280, stagger: 12 }))],
      [31, fork(250, -16, 10)],
      [32, trouble('oz', "My engine's overheating AND I've got a tail! Lead!")],
      [35, wave('drone', 'circle', Array.from({ length: 10 }, () => [0, 0]), { radius: 11, hold: 6, dist: 70 })],
      [35, (G) => G.enemies.filter((e) => e.ai === 'circle').forEach((e, i) => { e.phase = (i / 10) * TAU; })],
      [38, all(wave('mine', 'pass', F.grid(5, 2, 8, 0, 0), { off: 200, stagger: 8 }), prop('pipeArch', [[260, 0, 'rail+4']]))],
      [40, carrier(8, 8, 10)],
      [43, wave('swooper', 'behind', F.V(5, 7, 0, 3), { hold: 5 })],
      [45, all(rings([[200, 0, 0], [240, 0, 4]], 'gold'), item('bomb', 260, 0, -4))],
      [48, join(['oz', 'sable', 'tobi'], 'The lava is rising... no, something is standing UP in it!', 'tobi')],
      [49, warn()],
      [50, boss('anvil')],
    ],
  },
  // ===========================================================================
  {
    id: 'hush', num: 5, name: 'THE HUSH', sub: 'Sing into the silence', env: 'hush', song: 'hush',
    speed: 60, planet: [0.6, 0.6, 0.65],
    railX: (d) => 20 * Math.sin(d * 0.002) + 8 * Math.sin(d * 0.0063),
    railY: (d) => 6 * Math.sin(d * 0.0027),
    brief: [['maren', "This is it. The Hush's domain — a place where sound itself is forbidden."], ['hush', '...turn back... your little songs end here...'], ['oz', "Every shot we land puts a little colour back into the world. Let's make some noise, Synthwing!"]],
    medal: 90000, checkpointBar: 22, bossKey: 'hush', restore: true,
    script: [
      [0.5, say('hush', '...so loud... so bright... you do not belong here...')],
      [2, all(leave(['oz', 'sable', 'tobi']), say('oz', 'Everything here is drained of colour. Hit them and it comes back!'))],
      [3, prop('monolith', [[240, -18, 'rail-14'], [280, 16, 'rail-14'], [320, -8, 'rail-14']])],
      [4, wave('cube', 'hover', F.V(5, 5, 0, 2), { hold: 5 })],
      [6, wave('cube', 'swoop', F.line(5, 5, 0, 4), { side: 1, hold: 4 })],
      [8, wave('drone', 'circle', Array.from({ length: 8 }, () => [0, 0]), { radius: 10, hold: 6, dist: 70 })],
      [8, (G) => G.enemies.filter((e) => e.ai === 'circle').forEach((e, i) => { e.phase = (i / 8) * TAU; })],
      [10, all(wave('sniper', 'sniper', [[-10, 8], [10, 8]], { hold: 9 }), item('laser', 220, 0, 0))],
      [12, wave('swooper', 'behind', F.V(5, 7, 0, 4), { hold: 5 })],
      [14, trouble('tobi', "It's so quiet here... AAH! Something grabbed my tail!")],
      [17, all(wave('spinner', 'spinner', [[-10, 0], [10, 0], [0, 8]], { hold: 8 }), prop('monolith', [[260, 0, 'rail-16']]))],
      [20, say('hush', '...every note you play... I will swallow...')],
      [22, checkpoint()],
      [23, carrier(0, 4, 12)],
      [26, wave('mine', 'pass', F.grid(5, 3, 8, 0, 0), { off: 200, stagger: 5 })],
      [28, fork(240, 0, 10)],
      [29, trouble('sable', "I can't hear my own engine. Lead — behind me!")],
      [32, wave('cube', 'hover', F.grid(5, 2, 6, 0, 2), { hold: 6 })],
      [34, trouble('oz', "The silence is getting to these old bones... help!")],
      [37, all(rings([[200, 0, 0], [230, -8, 4], [230, 8, 4]], 'gold'), item('bomb', 260, 0, 0))],
      [39, join(['oz', 'sable', 'tobi'], "All of us, together, one more time. Let's make it loud!", 'oz')],
      [40, warn()],
      [41, boss('hush')],
    ],
  },
];
