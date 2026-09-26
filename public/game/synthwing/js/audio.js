'use strict';
// =============================================================================
// SYNTHWING 64 — audio.js
// Everything you hear is synthesised live with WebAudio: a 64-bit-era style
// "soundfont" (detuned saws, pulse waves, FM bells, noise drums) into a lush
// generated-impulse reverb. A step sequencer plays layered songs whose layers
// fade in and out with the player's Resonance level, and gameplay sounds are
// quantised to the beat and pitched to the current chord so every lock-on and
// every kill plays in key.
// =============================================================================

const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(n) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return null;
  let v = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return v + (parseInt(m[3], 10) + 1) * 12;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Chord symbol → root pitch class + intervals
const CHORD_Q = {
  '': [0, 4, 7, 12], m: [0, 3, 7, 12], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14], 9: [0, 4, 7, 10, 14], sus2: [0, 2, 7, 12], sus4: [0, 5, 7, 12], dim: [0, 3, 6, 9], aug: [0, 4, 8, 12],
  add9: [0, 4, 7, 14], m6: [0, 3, 7, 9], 6: [0, 4, 7, 9],
};
function parseChord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
  let root = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  root = (root + 12) % 12;
  const q = CHORD_Q[m[3]] || CHORD_Q[''];
  return { root, iv: q, minor: m[3].startsWith('m') && !m[3].startsWith('maj'), sym };
}

const AudioSys = {
  ctx: null, ok: false, unlocked: false,
  master: null, musicBus: null, sfxBus: null, voiceBus: null, radioBus: null, comp: null,
  revIn: null, dlyIn: null, delay: null, analyser: null, freq: null,
  noise: null, pulse25: null, pulse12: null,
  musicVol: 0.8, sfxVol: 0.9, voiceVol: 0.8, duck: 0, fallbackT0: performance.now(),
  silenceAmt: 0,

  create() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      // iOS 17+: play even when the ring/silent switch is on.
      if (navigator.audioSession) { try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } }
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) { this.ctx = null; return; }
    const ctx = this.ctx;
    // iOS marks the context 'interrupted' for Siri, calls and alarms: pause a
    // live game so it never carries on in silence (a tap on RESUME restarts audio).
    ctx.onstatechange = () => { if (ctx.state === 'interrupted' && Game.state === 'play' && !Game.overlay) Game.pause(); };
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12; this.comp.knee.value = 12; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.comp.connect(this.master); this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol * 0.55;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol * 0.7;
    this.voiceBus = ctx.createGain(); this.voiceBus.gain.value = this.voiceVol * 0.85;
    this.musicBus.connect(this.comp); this.sfxBus.connect(this.comp); this.voiceBus.connect(this.comp);
    // In-flight comms: a thin, lightly overdriven radio channel that sits under the music.
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = this.voiceVol * 0.36;
    const rHp = ctx.createBiquadFilter(); rHp.type = 'highpass'; rHp.frequency.value = 420; rHp.Q.value = 0.8;
    const rLp = ctx.createBiquadFilter(); rLp.type = 'lowpass'; rLp.frequency.value = 3100; rLp.Q.value = 1.2;
    const rDrive = ctx.createWaveShaper(), curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 2.2) * 0.85; }
    rDrive.curve = curve;
    this.radioBus.connect(rHp); rHp.connect(rLp); rLp.connect(rDrive); rDrive.connect(this.comp);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 256; this.analyser.smoothingTimeConstant = 0.7;
    this.musicBus.connect(this.analyser);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    // Reverb (generated impulse — that big 64-bit era hall sound)
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { const t = i / len; lp = lp * 0.55 + (Math.random() * 2 - 1) * 0.45; d[i] = lp * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1); }
    }
    rev.buffer = ir;
    this.revIn = ctx.createGain(); this.revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.revIn.connect(rev); rev.connect(revOut); revOut.connect(this.comp);
    // Tempo delay
    this.delay = ctx.createDelay(1.5); this.delay.delayTime.value = 0.35;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    this.dlyIn = ctx.createGain();
    this.dlyIn.connect(this.delay); this.delay.connect(dlp); dlp.connect(fb); fb.connect(this.delay);
    const dOut = ctx.createGain(); dOut.gain.value = 0.35; dlp.connect(dOut); dOut.connect(this.comp);
    dlp.connect(this.revIn);
    // Noise + pulse waves
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.pulse25 = this.makePulse(0.25); this.pulse12 = this.makePulse(0.125);
    this.ok = true;
    this.applyVolumes();
  },
  makePulse(d) {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) re[i] = (2 / (i * PI)) * Math.sin(i * PI * d);
    return this.ctx.createPeriodicWave(re, im);
  },
  unlock() {
    this.create();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (!this.unlocked) {
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.unlocked = true;
    }
  },
  running() { return !!(this.ctx && this.ctx.state === 'running'); },
  time() { return this.running() ? this.ctx.currentTime : (performance.now() - this.fallbackT0) / 1000; },
  latency() { if (!this.running()) return 0; return (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0); },
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicLevel(), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol * 0.7, t, 0.05);
    this.voiceBus.gain.setTargetAtTime(this.voiceVol * 0.85, t, 0.05);
    this.radioBus.gain.setTargetAtTime(this.voiceVol * 0.36, t, 0.05);
  },
  musicLevel() { return this.musicVol * 0.55 * (1 - this.silenceAmt) * (1 - this.duck); },
  setSilence(a, tc = 0.4) {
    this.silenceAmt = a;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, tc);
  },
  // Lower the music under narration (used by the dominant, menu-style narration).
  setDuck(a) {
    if (Math.abs(a - this.duck) < 0.01) return;
    this.duck = a;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, a > 0 ? 0.08 : 0.35);
  },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
  bands(out) { // 6 bands 0..1 for the resonance EQ display
    if (!this.running()) { out.fill(0); return out; }
    this.analyser.getByteFrequencyData(this.freq);
    const edges = [1, 3, 6, 11, 20, 36, 64];
    for (let b = 0; b < 6; b++) { let s = 0; for (let i = edges[b]; i < edges[b + 1]; i++) s += this.freq[i]; out[b] = s / ((edges[b + 1] - edges[b]) * 255); }
    return out;
  },

  // ---- voice building blocks ------------------------------------------------
  osc(type, f, t, stop, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    if (type === 'p25') o.setPeriodicWave(this.pulse25); else if (type === 'p12') o.setPeriodicWave(this.pulse12); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(dest); o.start(t); o.stop(stop);
    return o;
  },
  gainEnv(t, a, d, s, r, dur, peak, dest) {
    const g = this.ctx.createGain(), p = g.gain;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (d > 0) p.setTargetAtTime(peak * s, t + a, d / 3);
    const off = t + Math.max(dur, a + 0.005);
    p.setTargetAtTime(0.0001, off, Math.max(r, 0.005) / 4);
    g.connect(dest);
    g._stop = off + r + 0.05;
    return g;
  },
  filter(type, f, q, dest) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dest); return b; },
  noiseSrc(t, stop, dest, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate;
    s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(stop); return s;
  },
  // Route helper: dry + reverb/delay sends
  route(dest, rev, dly, pan) {
    const g = this.ctx.createGain();
    let out = g;
    if (pan) { const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null; if (p) { p.pan.value = pan; g.connect(p); out = p; } }
    out.connect(dest);
    if (rev) { const r = this.ctx.createGain(); r.gain.value = rev; out.connect(r); r.connect(this.revIn); }
    if (dly) { const d = this.ctx.createGain(); d.gain.value = dly; out.connect(d); d.connect(this.dlyIn); }
    return g;
  },
};

// -----------------------------------------------------------------------------
// Instruments: fn(t, midi, dur, vel, dest)
// -----------------------------------------------------------------------------
const INST = {
  kick(t, m, dur, v, dest) {
    const A = AudioSys, ctx = A.ctx;
    const g = A.gainEnv(t, 0.002, 0.25, 0.0, 0.1, 0.18, 1.1 * v, dest);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    o.connect(g); o.start(t); o.stop(g._stop);
    const c = A.gainEnv(t, 0.001, 0.02, 0, 0.01, 0.01, 0.35 * v, dest);
    A.noiseSrc(t, t + 0.03, A.filter('highpass', 2000, 0.7, c));
  },
  snare(t, m, dur, v, dest) {
    const A = AudioSys;
    const g = A.gainEnv(t, 0.001, 0.14, 0.0, 0.08, 0.1, 0.7 * v, dest);
    A.noiseSrc(t, g._stop, A.filter('bandpass', 1900, 0.8, g));
    const g2 = A.gainEnv(t, 0.001, 0.07, 0.0, 0.03, 0.05, 0.5 * v, dest);
    const o = A.osc('triangle', 200, t, g2._stop, g2); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
  },
  clap(t, m, dur, v, dest) {
    const A = AudioSys;
    const f = A.filter('bandpass', 1300, 1.2, dest);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const g = A.gainEnv(tt, 0.001, i === 2 ? 0.16 : 0.012, 0, 0.02, 0.01, 0.8 * v, f);
      A.noiseSrc(tt, g._stop, g);
    }
  },
  hat(t, m, dur, v, dest) {
    const A = AudioSys;
    const g = A.gainEnv(t, 0.001, 0.035, 0, 0.02, 0.02, 0.28 * v, dest);
    A.noiseSrc(t, g._stop, A.filter('highpass', 7500, 0.8, g));
  },
  ohat(t, m, dur, v, dest) {
    const A = AudioSys;
    const g = A.gainEnv(t, 0.001, 0.22, 0.2, 0.1, 0.15, 0.24 * v, dest);
    A.noiseSrc(t, g._stop, A.filter('highpass', 6500, 0.8, g));
  },
  shaker(t, m, dur, v, dest) {
    const A = AudioSys;
    const g = A.gainEnv(t, 0.012, 0.04, 0, 0.02, 0.03, 0.16 * v, dest);
    A.noiseSrc(t, g._stop, A.filter('bandpass', 9000, 1.5, g));
  },
  tom(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m || 45);
    const g = A.gainEnv(t, 0.002, 0.3, 0, 0.1, 0.2, 0.8 * v, dest);
    const o = A.osc('sine', f * 1.6, t, g._stop, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  },
  crash(t, m, dur, v, dest) {
    const A = AudioSys;
    const g = A.gainEnv(t, 0.002, 1.4, 0, 0.5, 1.0, 0.3 * v, dest);
    A.noiseSrc(t, g._stop, A.filter('highpass', 4200, 0.5, g), 0.9);
  },
  bass(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.004, 0.2, 0.55, 0.06, dur, 0.5 * v, dest);
    const lp = A.filter('lowpass', 300, 7, g);
    lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(320, t + 0.16);
    A.osc('sawtooth', f, t, g._stop, lp);
    A.osc('square', f / 2, t, g._stop, lp, 4);
  },
  bassHeavy(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.003, 0.12, 0.6, 0.04, dur, 0.5 * v, dest);
    const lp = A.filter('lowpass', 500, 9, g);
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.1);
    A.osc('sawtooth', f, t, g._stop, lp, -7);
    A.osc('sawtooth', f, t, g._stop, lp, 7);
    A.osc('square', f / 2, t, g._stop, lp);
  },
  pad(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.35, 0.5, 0.8, 0.9, dur, 0.1 * v, dest);
    const lp = A.filter('lowpass', 1600, 0.8, g);
    for (const d of [-9, 0, 9]) A.osc('sawtooth', f, t, g._stop, lp, d);
  },
  choir(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.45, 0.6, 0.85, 1.0, dur, 0.22 * v, dest);
    const f1 = A.filter('bandpass', 750, 6, g), f2 = A.filter('bandpass', 1150, 7, g), f3 = A.filter('bandpass', 2600, 9, g);
    const mix = A.ctx.createGain(); mix.gain.value = 1; mix.connect(f1); mix.connect(f2); mix.connect(f3);
    for (const d of [-7, 6]) A.osc('sawtooth', f, t, g._stop, mix, d);
  },
  pluck(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.002, 0.16, 0.0, 0.05, 0.05, 0.22 * v, dest);
    const lp = A.filter('lowpass', 1200, 3, g);
    lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(900, t + 0.12);
    A.osc('p25', f, t, g._stop, lp);
  },
  steel(t, m, dur, v, dest) { // steel-drum-ish (tropical)
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.002, 0.45, 0.0, 0.1, 0.1, 0.26 * v, dest);
    A.osc('sine', f, t, g._stop, g);
    const g2 = A.gainEnv(t, 0.001, 0.12, 0, 0.05, 0.05, 0.12 * v, dest); A.osc('sine', f * 2.01, t, g2._stop, g2);
    const g3 = A.gainEnv(t, 0.001, 0.06, 0, 0.03, 0.03, 0.08 * v, dest); A.osc('triangle', f * 3.97, t, g3._stop, g3);
  },
  marimba(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.001, 0.3, 0, 0.08, 0.08, 0.3 * v, dest);
    A.osc('sine', f, t, g._stop, g);
    const g2 = A.gainEnv(t, 0.001, 0.05, 0, 0.02, 0.02, 0.12 * v, dest); A.osc('sine', f * 4, t, g2._stop, g2);
  },
  bell(t, m, dur, v, dest) { // 2-op FM bell
    const A = AudioSys, ctx = A.ctx, f = mtof(m);
    const g = A.gainEnv(t, 0.002, 1.1, 0.0, 0.4, 0.3, 0.2 * v, dest);
    const car = A.osc('sine', f, t, g._stop, g);
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.8);
    A.osc('sine', Math.min(f * 3.5, 15000), t, g._stop, mg); mg.connect(car.frequency);
  },
  lead(t, m, dur, v, dest) {
    const A = AudioSys, ctx = A.ctx, f = mtof(m);
    const g = A.gainEnv(t, 0.012, 0.25, 0.75, 0.12, dur, 0.17 * v, dest);
    const lp = A.filter('lowpass', 2600, 2, g);
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(2200, t + 0.25);
    const o1 = A.osc('sawtooth', f, t, g._stop, lp, -5), o2 = A.osc('p25', f, t, g._stop, lp, 5);
    if (dur > 0.22) { // delayed vibrato
      const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.5));
      A.osc('sine', 5.6, t, g._stop, vg); vg.connect(o1.frequency); vg.connect(o2.frequency);
    }
  },
  brass(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.03, 0.3, 0.8, 0.15, dur, 0.18 * v, dest);
    const lp = A.filter('lowpass', 800, 1.5, g);
    lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(3000, t + 0.08); lp.frequency.setTargetAtTime(1600, t + 0.1, 0.2);
    for (const d of [-8, 0, 8]) A.osc('sawtooth', f, t, g._stop, lp, d);
  },
  flute(t, m, dur, v, dest) {
    const A = AudioSys, ctx = A.ctx, f = mtof(m);
    const g = A.gainEnv(t, 0.04, 0.2, 0.85, 0.12, dur, 0.22 * v, dest);
    const o = A.osc('triangle', f, t, g._stop, g);
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.01, t + 0.35);
    A.osc('sine', 5, t, g._stop, vg); vg.connect(o.frequency);
    const ng = A.gainEnv(t, 0.02, 0.1, 0.3, 0.05, dur, 0.05 * v, dest);
    A.noiseSrc(t, ng._stop, A.filter('bandpass', f * 2, 4, ng));
  },
  sqlead(t, m, dur, v, dest) {
    const A = AudioSys, f = mtof(m);
    const g = A.gainEnv(t, 0.005, 0.2, 0.6, 0.08, dur, 0.14 * v, dest);
    A.osc('square', f, t, g._stop, A.filter('lowpass', 3200, 1, g));
  },
};

// Character voices (gibberish "chatter" in the tradition of 64-bit era games).
// f0 pitch · var random pitch spread · fmt formant scale (smaller head = higher)
// dur syllable length · slide pitch glide · vib [rate, depth] · rasp breath noise
const VOICES = {
  oz: { gain: 1.35, f0: 112, var: 0.1, wave: 'sawtooth', fmt: 0.88, dur: 0.088, slide: -0.07, vib: [6.5, 0.035], rasp: 0.2, rev: 0.12 }, // weathered veteran
  sable: { gain: 1.45, f0: 168, var: 0.06, wave: 'sawtooth', fmt: 1.0, dur: 0.062, slide: -0.05, purr: 0.25, rev: 0.1 }, // cool, clipped ace
  tobi: { gain: 1.2, f0: 330, var: 0.2, wave: 'square', fmt: 1.3, dur: 0.05, slide: 0.1, bounce: true, rev: 0.1 }, // eager rookie
  maren: { gain: 0.95, f0: 76, var: 0.07, wave: 'sawtooth', fmt: 0.76, dur: 0.1, slide: -0.04, vib: [5, 0.02], rasp: 0.1, sub: true, rev: 0.22 }, // booming admiral
  hush: { gain: 1.8, noise: true, fmt: 0.95, dur: 0.14, attack: 0.05, rev: 0.6 }, // a whisper from the void
  static: { gain: 1.1, f0: 92, var: 0.1, wave: 'square', fmt: 1.0, dur: 0.07, slide: -0.02, ring: 42, rev: 0.25 }, // Static commanders
  announcer: { f0: 66, var: 0.02, wave: 'sawtooth', fmt: 0.84, dur: 0.13, slide: -0.03, chord: [0, 7, 12], rev: 0.45 }, // title cards
};
const VOWEL_FMT = { a: [800, 1250], e: [520, 1900], i: [330, 2350], o: [520, 920], u: [360, 820], y: [330, 2150] };

// -----------------------------------------------------------------------------
// Sequencer
// -----------------------------------------------------------------------------
const Music = {
  song: null, name: '', steps: 0, stepDur: 0.1, nextT: 0, step: 0, playing: false, loop: true,
  maxLayer: 5, targetLayer: 5, onEnd: null, pending: null,
  events: [], chordAt: [], trackBus: [],
  visQueue: [], crossed: [], stepCount: 0,
  lastClockRunning: false,

  compile(song) {
    const bars = song.chords.length, steps = bars * 16;
    const chordAt = [];
    for (let b = 0; b < bars; b++) {
      const parts = song.chords[b].split(' ');
      for (let s = 0; s < 16; s++) chordAt.push(parseChord(parts.length > 1 && s >= 8 ? parts[1] : parts[0]));
    }
    const tracks = song.tracks.map((tr) => {
      const ev = new Array(steps).fill(null);
      const put = (i, e) => { if (!ev[i]) ev[i] = []; ev[i].push(e); };
      if (tr.drum) {
        const pats = Array.isArray(tr.pat) ? tr.pat : [tr.pat];
        for (let b = 0; b < bars; b++) {
          const p = pats[b % pats.length];
          for (let s = 0; s < 16; s++) { const ch = p[s]; if (ch === 'x' || ch === 'o' || ch === 'X') put(b * 16 + s, { m: tr.note || 0, d: 0.1, v: ch === 'o' ? 0.55 : ch === 'X' ? 1.25 : 1 }); }
        }
      } else if (tr.bass || tr.arp) {
        const pats = Array.isArray(tr.pat) ? tr.pat : [tr.pat];
        for (let b = 0; b < bars; b++) {
          const p = pats[b % pats.length];
          for (let s = 0; s < 16; s++) {
            const ch = p[s];
            if (ch === '.' || ch === '-' || ch === ' ') continue;
            let len = 1; while (s + len < 16 && p[s + len] === '.') len++;
            const c = chordAt[b * 16 + s];
            const base = (tr.oct + 1) * 12 + c.root;
            let m;
            if (tr.bass) {
              m = ch === 'R' ? base : ch === 'r' || ch === '8' ? base + 12 : ch === '3' ? base + c.iv[1] : ch === '5' ? base + 7 : ch === '7' ? base + (c.iv[3] !== undefined ? c.iv[3] : 12) : ch === 'o' ? base - 5 : base;
            } else {
              const k = parseInt(ch, 10), idx = k % 4, oct = Math.floor(k / 4);
              m = base + (c.iv[idx] !== undefined ? c.iv[idx] : 12) + oct * 12;
            }
            put(b * 16 + s, { m, d: len, v: 1 });
          }
        }
      } else if (tr.pad) {
        let s0 = 0;
        for (let s = 1; s <= steps; s++) {
          if (s === steps || chordAt[s].sym !== chordAt[s0].sym || (tr.every && s % tr.every === 0)) {
            const c = chordAt[s0];
            const base = (tr.oct + 1) * 12 + c.root;
            const voicing = (tr.voicing || [0, 1, 2, 3]).map((i) => base + (c.iv[i] !== undefined ? c.iv[i] : 12));
            put(s0, { chord: voicing, d: s - s0, v: 1 });
            s0 = s;
          }
        }
      } else if (tr.mel) {
        const toks = tr.mel.join(' ').trim().split(/\s+/);
        const n = toks.length;
        for (let rep = 0; rep * n < steps; rep++) {
          for (let i = 0; i < n; i++) {
            const tk = toks[i];
            if (tk === '.' || tk === '-') continue;
            let len = 1; while (i + len < n && toks[i + len] === '.') len++;
            const m = noteToMidi(tk);
            if (m !== null && rep * n + i < steps) put(rep * n + i, { m: m + (tr.transpose || 0), d: len, v: 1 });
          }
        }
      }
      return ev;
    });
    return { bars, steps, chordAt, tracks };
  },

  play(song, opts = {}) {
    if (!song) return;
    if (!song._c) song._c = this.compile(song);
    this.song = song; this.name = song.name;
    this.loop = opts.loop !== undefined ? opts.loop : song.loop !== false;
    this.onEnd = opts.onEnd || null;
    this.bpm = opts.bpm || song.bpm;
    this.stepDur = 60 / this.bpm / 4;
    this.step = 0;
    this.nextT = AudioSys.time() + 0.06;
    this.playing = true;
    this.pending = null;
    this.stepCount = 0;
    this.visQueue.length = 0;
    if (opts.layer !== undefined) this.maxLayer = this.targetLayer = opts.layer;
    this.buildBuses();
    if (AudioSys.ctx) AudioSys.delay.delayTime.setTargetAtTime(this.stepDur * 3, AudioSys.ctx.currentTime, 0.05);
  },
  buildBuses() {
    this.trackBus = [];
    if (!AudioSys.ok) return;
    for (const tr of this.song.tracks) this.trackBus.push(AudioSys.route(AudioSys.musicBus, tr.rev || 0, tr.dly || 0, tr.pan || 0));
    this.song.tracks.forEach((tr, i) => { this.trackBus[i].gain.value = tr.vol !== undefined ? tr.vol : 1; });
  },
  // Switch at the next bar line.
  queue(song, opts = {}) { if (!this.playing) { this.play(song, opts); return; } this.pending = { song, opts }; },
  stop() { this.playing = false; this.pending = null; this.song = null; },
  setLayer(n) { this.targetLayer = n; if (n < this.maxLayer) this.maxLayer = n; },

  update() {
    if (!this.playing || !this.song) { this.crossed.length = 0; this.dispatch(); return; }
    // Re-anchor if the clock source changed (audio got unlocked/suspended).
    const running = AudioSys.running();
    if (running !== this.lastClockRunning) { this.lastClockRunning = running; this.nextT = AudioSys.time() + 0.05; if (running && this.trackBus.length === 0) this.buildBuses(); }
    const now = AudioSys.time(), ahead = now + 0.12;
    const c = this.song._c;
    let guard = 0;
    while (this.nextT < ahead && guard++ < 64) {
      if (this.step % 16 === 0) {
        if (this.pending) { const p = this.pending; this.pending = null; const t = this.nextT; this.play(p.song, p.opts); this.nextT = t; continue; }
        if (this.targetLayer > this.maxLayer) this.maxLayer = this.targetLayer; // layers enter on the bar
      }
      const si = this.step % c.steps;
      if (AudioSys.ok && running) this.scheduleStep(si, this.nextT);
      this.visQueue.push(this.nextT, this.stepCount);
      this.step++; this.stepCount++;
      this.nextT += this.stepDur;
      if (this.step >= c.steps && !this.loop) {
        const cb = this.onEnd; const endT = this.nextT;
        this.playing = false; this.song = null;
        if (cb) setTimeout(cb, Math.max(0, (endT - now) * 1000));
        break;
      }
    }
    this.dispatch();
  },
  dispatch() {
    // Report steps whose audio time has been reached (compensating output latency)
    this.crossed.length = 0;
    const now = AudioSys.time() - AudioSys.latency();
    let i = 0;
    while (i < this.visQueue.length && this.visQueue[i] <= now) { this.crossed.push(this.visQueue[i + 1]); i += 2; }
    if (i) this.visQueue.splice(0, i);
  },
  scheduleStep(si, t) {
    const song = this.song, c = song._c;
    for (let k = 0; k < song.tracks.length; k++) {
      const tr = song.tracks[k];
      if ((tr.layer || 0) > this.maxLayer) continue;
      const evs = c.tracks[k][si];
      if (!evs) continue;
      const inst = INST[tr.inst];
      const dest = this.trackBus[k];
      if (!inst || !dest) continue;
      for (const e of evs) {
        const dur = e.d * this.stepDur * (tr.gate || 0.92);
        const v = e.v * (tr.vel || 1);
        const sw = song.swing && si % 2 === 1 ? this.stepDur * song.swing : 0;
        if (e.chord) for (const m of e.chord) inst(t + sw, m, dur, v, dest);
        else inst(t + sw, e.m, dur, v, dest);
      }
    }
  },
  chord() { if (!this.song) return parseChord('C'); const c = this.song._c; return c.chordAt[((this.step - 1) % c.steps + c.steps) % c.steps]; },
  nextStepTime(div = 1) {
    // Time of the next step divisible by `div` (1 = 16th, 2 = 8th, 4 = beat)
    let s = this.step, t = this.nextT;
    while (s % div !== 0) { s++; t += this.stepDur; }
    return t;
  },
  beatPhase() { // 0..1 within the current beat, from audio clock
    if (!this.playing) return (performance.now() / 500) % 1;
    const now = AudioSys.time() - AudioSys.latency();
    const stepsBehind = (this.nextT - now) / this.stepDur;
    const cur = this.stepCount - stepsBehind;
    return ((cur / 4) % 1 + 1) % 1;
  },
  barPhase() {
    if (!this.playing) return 0;
    const now = AudioSys.time() - AudioSys.latency();
    const cur = this.stepCount - (this.nextT - now) / this.stepDur;
    return ((cur / 16) % 1 + 1) % 1;
  },
};

// -----------------------------------------------------------------------------
// Sound effects
// -----------------------------------------------------------------------------
const SFX = {
  lastLaser: 0,
  chordTone(k, oct = 5) {
    const c = Music.chord();
    const tones = c.iv.slice(0, 3);
    const i = ((k % tones.length) + tones.length) % tones.length;
    return (oct + 1) * 12 + c.root + tones[i] + Math.floor(k / tones.length) * 12;
  },
  scaleTone(k, oct = 5) { // major/minor pentatonic over the current chord root
    const c = Music.chord();
    const pent = c.minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9];
    return (oct + 1) * 12 + c.root + pent[k % 5] + Math.floor(k / 5) * 12;
  },
  ok() { return AudioSys.ok && AudioSys.running(); },
  bus() { return AudioSys.sfxBus; },
  laser(level = 1, pitch = 1) { // pitch: each vehicle's gun has its own register
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    if (t - this.lastLaser < 0.035) return;
    this.lastLaser = t;
    const root = mtof(this.chordTone(0, 6)) * pitch, bass = pitch < 0.8;
    const g = A.gainEnv(t, 0.001, bass ? 0.13 : 0.07, 0, 0.03, bass ? 0.07 : 0.04, bass ? 0.22 : 0.16, A.route(this.bus(), 0.05, 0.06));
    const o = A.osc(bass ? 'sawtooth' : level >= 2 ? 'p25' : 'square', root * 1.5, t, g._stop, A.filter('lowpass', bass ? 2400 : 5000, bass ? 3 : 1, g));
    o.frequency.exponentialRampToValueAtTime(root * 0.5, t + (bass ? 0.14 : 0.08));
  },
  powerUp(kind) { // quick rising arpeggio up the current chord
    if (!this.ok()) return;
    const dest = AudioSys.route(this.bus(), 0.35, 0.2), t = AudioSys.ctx.currentTime, big = kind === 'fortissimo' || kind === 'encore';
    const n = big ? 8 : 5;
    for (let i = 0; i < n; i++) INST.sqlead(t + i * 0.045, Math.min(100, this.chordTone(i, 5) + 12), 0.05, 0.8, dest);
    INST.bell(t + n * 0.045, Math.min(100, this.chordTone(n, 5) + 12), 0.3, 1, dest);
    if (big) INST.bell(t + n * 0.045, Math.min(100, this.chordTone(n + 2, 5) + 12), 0.4, 0.8, dest);
  },
  powerDown() {
    if (!this.ok()) return;
    const dest = AudioSys.route(this.bus(), 0.3, 0.1), t = AudioSys.ctx.currentTime;
    INST.sqlead(t, 79, 0.06, 0.6, dest); INST.sqlead(t + 0.07, 72, 0.06, 0.6, dest); INST.sqlead(t + 0.14, 67, 0.1, 0.6, dest);
  },
  lock(k) {
    if (!this.ok()) return;
    const t = Music.playing ? Music.nextStepTime(1) : AudioSys.ctx.currentTime;
    INST.bell(t, Math.min(100, this.chordTone(k, 5) + 12), 0.1, 0.9, AudioSys.route(this.bus(), 0.25, 0.25));
  },
  release() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.02, 0.3, 0, 0.1, 0.2, 0.25, this.bus());
    const bp = A.filter('bandpass', 600, 2, g); bp.frequency.exponentialRampToValueAtTime(4000, t + 0.3);
    A.noiseSrc(t, g._stop, bp);
  },
  note(k, when) { // musical hit: quantised pluck in key
    if (!this.ok()) return;
    const t = when || (Music.playing ? Music.nextStepTime(1) : AudioSys.ctx.currentTime);
    const m = this.scaleTone(k, 5);
    const dest = AudioSys.route(this.bus(), 0.3, 0.2, (Math.random() - 0.5) * 0.6);
    INST.steel(t, m, 0.2, 1.1, dest);
    INST.pluck(t, m + 12, 0.1, 0.8, dest);
  },
  hit() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.001, 0.03, 0, 0.02, 0.02, 0.12, this.bus());
    A.osc('square', 1400 + Math.random() * 300, t, g._stop, g);
  },
  explode(size = 1) {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const dur = 0.25 + size * 0.35;
    const g = A.gainEnv(t, 0.002, dur, 0, 0.15, dur * 0.5, 0.45 * Math.min(1.4, 0.6 + size * 0.4), A.route(this.bus(), 0.3, 0, (Math.random() - 0.5) * 0.5));
    const lp = A.filter('lowpass', 3000, 1, g); lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    A.noiseSrc(t, g._stop, lp, 0.6 + Math.random() * 0.3);
    const g2 = A.gainEnv(t, 0.002, 0.25 + size * 0.2, 0, 0.1, 0.1, 0.55, this.bus());
    const o = A.osc('sine', 120, t, g2._stop, g2); o.frequency.exponentialRampToValueAtTime(35, t + 0.3 + size * 0.2);
  },
  bigBoom() {
    if (!this.ok()) return;
    this.explode(3);
    const A = AudioSys, t = A.ctx.currentTime;
    for (let i = 1; i < 6; i++) setTimeout(() => this.explode(1 + Math.random()), i * 140);
    const g = A.gainEnv(t, 0.01, 2.5, 0, 1, 1.5, 0.3, A.route(this.bus(), 0.6, 0));
    A.noiseSrc(t, g._stop, A.filter('lowpass', 400, 1, g), 0.4);
  },
  playerHit() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.002, 0.35, 0, 0.1, 0.2, 0.35, this.bus());
    const lp = A.filter('lowpass', 1800, 4, g); lp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    const o = A.osc('sawtooth', 220, t, g._stop, lp); o.frequency.exponentialRampToValueAtTime(55, t + 0.35);
    A.osc('square', 147, t, g._stop, lp, 30);
    const n = A.gainEnv(t, 0.001, 0.12, 0, 0.05, 0.05, 0.3, this.bus()); A.noiseSrc(t, n._stop, n);
  },
  roll() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.05, 0.4, 0, 0.1, 0.35, 0.3, A.route(this.bus(), 0.2, 0));
    const bp = A.filter('bandpass', 400, 3, g); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.2); bp.frequency.exponentialRampToValueAtTime(500, t + 0.45);
    A.noiseSrc(t, g._stop, bp);
  },
  deflect() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.001, 0.12, 0, 0.05, 0.05, 0.14, A.route(this.bus(), 0.3, 0.2));
    const o = A.osc('triangle', 2400, t, g._stop, g); o.frequency.exponentialRampToValueAtTime(3600, t + 0.1);
  },
  bomb() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.3, 0.1, 1, 0.05, 0.35, 0.3, this.bus());
    const o = A.osc('sawtooth', 100, t, g._stop, A.filter('lowpass', 2000, 4, g)); o.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
    setTimeout(() => this.bigBoom(), 420);
  },
  ring(gold) {
    if (!this.ok()) return;
    const dest = AudioSys.route(this.bus(), 0.35, 0.2);
    let t = Music.playing ? Music.nextStepTime(1) : AudioSys.ctx.currentTime;
    for (let i = 0; i < (gold ? 5 : 3); i++) { INST.bell(t, Math.min(100, this.chordTone(i, 5) + 12), 0.1, 1, dest); t += Music.stepDur || 0.08; }
  },
  pickup() {
    if (!this.ok()) return;
    const dest = AudioSys.route(this.bus(), 0.3, 0.1);
    const t = AudioSys.ctx.currentTime;
    INST.sqlead(t, 84, 0.08, 1, dest); INST.sqlead(t + 0.09, 91, 0.2, 1, dest); INST.bell(t + 0.09, 96, 0.2, 1, dest);
  },
  alarm() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const g = A.gainEnv(t + i * 0.32, 0.01, 0.2, 0.8, 0.05, 0.28, 0.12, A.route(this.bus(), 0.2, 0));
      A.osc('square', i % 2 ? 660 : 880, t + i * 0.32, g._stop, A.filter('lowpass', 2500, 1, g));
    }
  },
  menuMove() { if (!this.ok()) return; const A = AudioSys, t = A.ctx.currentTime; const g = A.gainEnv(t, 0.001, 0.04, 0, 0.02, 0.02, 0.1, this.bus()); A.osc('square', 1760, t, g._stop, g); },
  menuOk() { if (!this.ok()) return; const d = AudioSys.route(this.bus(), 0.3, 0.1), t = AudioSys.ctx.currentTime; INST.bell(t, 84, 0.1, 1, d); INST.bell(t + 0.07, 91, 0.1, 1, d); },
  menuBack() { if (!this.ok()) return; const d = AudioSys.route(this.bus(), 0.2, 0), t = AudioSys.ctx.currentTime; INST.sqlead(t, 76, 0.06, 0.8, d); INST.sqlead(t + 0.07, 69, 0.08, 0.8, d); },
  enemyShot() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.001, 0.1, 0, 0.04, 0.05, 0.08, A.route(this.bus(), 0.15, 0, (Math.random() - 0.5) * 0.6));
    const o = A.osc('triangle', 700, t, g._stop, g); o.frequency.exponentialRampToValueAtTime(260, t + 0.1);
  },
  shieldLow() { if (!this.ok()) return; const A = AudioSys, t = A.ctx.currentTime; for (let i = 0; i < 2; i++) { const g = A.gainEnv(t + i * 0.12, 0.001, 0.06, 0, 0.02, 0.05, 0.1, this.bus()); A.osc('square', 1320, t + i * 0.12, g._stop, g); } },
  roar() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.15, 1.2, 0.2, 0.4, 1.0, 0.35, A.route(this.bus(), 0.5, 0));
    const lp = A.filter('lowpass', 500, 8, g);
    const o = A.osc('sawtooth', 55, t, g._stop, lp); o.frequency.linearRampToValueAtTime(40, t + 1.2);
    A.osc('sawtooth', 58, t, g._stop, lp);
    const lfo = A.ctx.createGain(); lfo.gain.value = 300; A.osc('sine', 7, t, g._stop, lfo); lfo.connect(lp.frequency);
  },
  charge() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.4, 0.2, 0.8, 0.1, 0.8, 0.12, A.route(this.bus(), 0.3, 0));
    const o = A.osc('sawtooth', 200, t, g._stop, A.filter('lowpass', 1800, 6, g)); o.frequency.exponentialRampToValueAtTime(900, t + 0.8);
  },
  beam() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const g = A.gainEnv(t, 0.01, 0.6, 0.5, 0.2, 0.6, 0.2, A.route(this.bus(), 0.4, 0));
    A.osc('sawtooth', 90, t, g._stop, A.filter('lowpass', 1200, 3, g));
    A.noiseSrc(t, g._stop, A.filter('bandpass', 3000, 1, g));
  },
  // ---- comms ----------------------------------------------------------------
  commOpen() { // radio squelch + two-tone chirp when a transmission starts
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const n = A.gainEnv(t, 0.002, 0.05, 0.2, 0.03, 0.06, 0.22, A.radioBus);
    A.noiseSrc(t, n._stop, A.filter('bandpass', 2400, 0.9, n));
    for (const [dt, f] of [[0.05, 1560], [0.1, 2080]]) { const g = A.gainEnv(t + dt, 0.002, 0.03, 0.4, 0.01, 0.035, 0.12, A.radioBus); A.osc('square', f, t + dt, g._stop, g); }
  },
  commClose() {
    if (!this.ok()) return;
    const A = AudioSys, t = A.ctx.currentTime;
    const n = A.gainEnv(t, 0.001, 0.09, 0, 0.03, 0.02, 0.16, A.radioBus);
    A.noiseSrc(t, n._stop, A.filter('bandpass', 1800, 0.7, n));
    const g = A.gainEnv(t, 0.001, 0.02, 0, 0.01, 0.01, 0.1, A.radioBus); A.osc('square', 1040, t, g._stop, g);
  },
  commChime() { // softer cue when a new speaker takes over in briefings
    if (!this.ok()) return;
    const d = AudioSys.route(AudioSys.voiceBus, 0.35, 0.1), t = AudioSys.ctx.currentTime;
    INST.bell(t, 91, 0.1, 0.35, d); INST.bell(t + 0.06, 96, 0.1, 0.3, d);
  },
  // One spoken syllable. vowel/cons are the letters that produced it; pitchK and
  // loud shape intonation; radio = in-flight comm channel (thin, quiet).
  syllable(who, vowel, cons, pitchK, loud, radio) {
    if (!this.ok()) return;
    const V = VOICES[who] || VOICES.oz;
    const A = AudioSys, ctx = A.ctx, t = ctx.currentTime;
    const dest = radio ? A.radioBus : A.route(A.voiceBus, V.rev || 0.12, 0);
    const dur = V.dur * (0.85 + Math.random() * 0.3);
    const F = VOWEL_FMT[vowel] || VOWEL_FMT.a;
    const k = V.fmt;
    const g = A.gainEnv(t, V.attack || 0.006, dur * 0.6, 0.7, 0.03, dur, 0.55 * loud * (V.gain || 1), dest);
    const b1 = A.filter('bandpass', F[0] * k, 5, g), b2 = A.filter('bandpass', F[1] * k, 7, g), b3 = A.filter('lowpass', 900 * k, 0.7, g);
    const src = ctx.createGain(); src.gain.value = 1; src.connect(b1); src.connect(b2);
    const body = ctx.createGain(); body.gain.value = 0.35; src.connect(body); body.connect(b3);
    if (V.noise) {
      A.noiseSrc(t, g._stop, src, 0.6);
    } else {
      const bounce = V.bounce ? (Math.random() < 0.5 ? 1.12 : 0.92) : 1;
      const f0 = V.f0 * pitchK * bounce * (1 + (Math.random() * 2 - 1) * V.var);
      const oscs = [];
      for (const semis of V.chord || [0]) oscs.push(A.osc(V.wave, f0 * Math.pow(2, semis / 12), t, g._stop, src));
      if (V.sub) oscs.push(A.osc('triangle', f0 / 2, t, g._stop, src));
      for (const o of oscs) o.frequency.linearRampToValueAtTime(o.frequency.value * (1 + V.slide), t + dur);
      if (V.vib && V.vib[1]) {
        const vg = ctx.createGain(); vg.gain.value = f0 * V.vib[1];
        A.osc('sine', V.vib[0], t, g._stop, vg); for (const o of oscs) vg.connect(o.frequency);
      }
      if (V.ring) { // ring modulation: robotic buzz
        const rm = ctx.createGain(); rm.gain.value = 0; src.disconnect(); src.connect(rm); rm.connect(b1); rm.connect(b2); rm.connect(body);
        A.osc('square', V.ring, t, g._stop, rm.gain);
      }
      if (V.rasp) { const rg = ctx.createGain(); rg.gain.value = V.rasp; rg.connect(b1); rg.connect(b2); A.noiseSrc(t, g._stop, rg, 0.7); }
      if (V.purr) { const pg = ctx.createGain(); pg.gain.value = V.purr * 0.55 * loud * (V.gain || 1); A.osc('sine', 24, t, g._stop, pg); pg.connect(g.gain); }
    }
    // consonant onset: hiss for fricatives, click for plosives
    if (cons && 'sfhzxcj'.includes(cons)) { const c = A.gainEnv(t, 0.002, 0.03, 0, 0.01, 0.025, 0.16 * loud, dest); A.noiseSrc(t, c._stop, A.filter('highpass', 3600 * Math.min(1.3, k), 0.8, c)); }
    else if (cons && 'tkpbdgq'.includes(cons)) { const c = A.gainEnv(t, 0.001, 0.012, 0, 0.005, 0.008, 0.2 * loud, dest); A.noiseSrc(t, c._stop, A.filter('bandpass', 1600 * k, 1.2, c)); }
  },
};

// Sound is never worth a crash: every effect call is guarded and logged.
for (const k of Object.keys(SFX)) {
  const f = SFX[k];
  if (typeof f === 'function') SFX[k] = function () { try { return f.apply(SFX, arguments); } catch (e) { reportError('sfx.' + k, e); return undefined; } };
}
