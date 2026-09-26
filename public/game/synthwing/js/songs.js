'use strict';
// =============================================================================
// SYNTHWING 64 — songs.js
// The original soundtrack, written as data for the sequencer in audio.js.
// Layers: 0 kick/hat/bass · 1 snare/pad · 2 arpeggio · 3 lead melody ·
//         4 counter-melody & extra percussion · 5 sparkle (Resonance MAX)
// Notation: drums 'x' hit, 'o' soft, 'X' accent · bass R r 3 5 7 o(5th below)
// arp 0-3 chord tones (4-7 = octave up) · '.' hold · '-' rest · melody = notes.
// =============================================================================

const K4 = 'x...x...x...x...';
const SONGS = {};

// ---------------------------------------------------------------------------
// TITLE — "Synthwing" (the main theme)
// ---------------------------------------------------------------------------
SONGS.title = {
  name: 'title', bpm: 116,
  chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'Dm7', 'G7'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x.....x.x.......', 'x.....x.x.....x.'] },
    { drum: 1, inst: 'hat', layer: 0, pat: 'x.o.x.o.x.o.x.o.' },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: 'R.r.R.r.R.r.R.r5', vol: 0.9 },
    { drum: 1, inst: 'snare', layer: 1, pat: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.xx'] },
    { pad: 1, inst: 'pad', layer: 1, oct: 4, rev: 0.5 },
    { arp: 1, inst: 'pluck', layer: 2, oct: 4, pat: '0124542101245421', dly: 0.35, rev: 0.2, pan: 0.3 },
    { mel: [
      'G4 . . G4 C5 . . . E5 . . . G5 . . .', 'F5 . . . E5 . D5 . D5 . . . . . . .',
      'C5 . . C5 E5 . . . A5 . . . G5 . E5 .', 'F5 . . . . . . . . . . . - . G4 .',
      'G4 . . G4 C5 . . . E5 . . . G5 . . .', 'B5 . . . A5 . G5 . D5 . . . . . G5 .',
      'A5 . . . G5 . F5 . E5 . . . D5 . . .', 'D5 . . . . . . . . . . . - . . .',
      'E5 . . . . . . . C5 . D5 . E5 . . .', 'F5 . . . E5 . D5 . C5 . . . A4 . . .',
      'G4 . . . C5 . . . E5 . . . G5 . . .', 'G5 . . . . . F5 . E5 . . . D5 . . .',
      'E5 . . . . . A5 . . . G5 . E5 . . .', 'F5 . . . . . A5 . . . C6 . . . . .',
      'D6 . . . C6 . . . A5 . . . F5 . . .', 'G5 . . . . . . . B5 . . . D6 . . .',
    ], inst: 'brass', layer: 3, rev: 0.35, vol: 1.0 },
    { arp: 1, inst: 'bell', layer: 4, oct: 5, pat: '....4.......6...', rev: 0.5, pan: -0.4 },
    { drum: 1, inst: 'ohat', layer: 4, pat: '..x...x...x...x.' },
    { drum: 1, inst: 'crash', layer: 4, pat: ['x...............', '................', '................', '................'] },
    { mel: [
      'G4 . . G4 C5 . . . E5 . . . G5 . . .', 'F5 . . . E5 . D5 . D5 . . . . . . .',
      'C5 . . C5 E5 . . . A5 . . . G5 . E5 .', 'F5 . . . . . . . . . . . - . G4 .',
      'G4 . . G4 C5 . . . E5 . . . G5 . . .', 'B5 . . . A5 . G5 . D5 . . . . . G5 .',
      'A5 . . . G5 . F5 . E5 . . . D5 . . .', 'D5 . . . . . . . . . . . - . . .',
      'E5 . . . . . . . C5 . D5 . E5 . . .', 'F5 . . . E5 . D5 . C5 . . . A4 . . .',
      'G4 . . . C5 . . . E5 . . . G5 . . .', 'G5 . . . . . F5 . E5 . . . D5 . . .',
      'E5 . . . . . A5 . . . G5 . E5 . . .', 'F5 . . . . . A5 . . . C6 . . . . .',
      'D6 . . . C6 . . . A5 . . . F5 . . .', 'G5 . . . . . . . B5 . . . D6 . . .',
    ], inst: 'bell', layer: 5, transpose: 12, rev: 0.5, dly: 0.2, vol: 0.6 },
  ],
};

// ---------------------------------------------------------------------------
// STAGE 1 — Corona Shores (tropical, royal-road progression)
// ---------------------------------------------------------------------------
SONGS.corona = {
  name: 'corona', bpm: 128,
  chords: ['Fmaj7', 'G', 'Em7', 'Am', 'Fmaj7', 'G', 'C', 'C', 'Dm7', 'Em7', 'Fmaj7', 'G', 'Dm7', 'Em7', 'F G', 'C'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: K4 },
    { drum: 1, inst: 'hat', layer: 0, pat: '..x...x...x...x.' },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: ['R..r..R.R..r..5.', 'R..r..R.R..r.r5.'] },
    { drum: 1, inst: 'clap', layer: 1, pat: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.......x.x.'] },
    { pad: 1, inst: 'pad', layer: 1, oct: 4, rev: 0.45, vol: 0.9 },
    { arp: 1, inst: 'steel', layer: 2, oct: 5, pat: '0.4.2.4.0.4.2.5.', dly: 0.3, rev: 0.25, pan: 0.35 },
    { mel: [
      'A5 . . C6 . . A5 . G5 . . E5 . . C5 .', 'D5 . . . . . . . B4 . C5 . D5 . . .',
      'G5 . . B5 . . G5 . E5 . . D5 . . B4 .', 'C5 . . . . . . . - . . . E5 . G5 .',
      'A5 . . C6 . . A5 . G5 . . E5 . . G5 .', 'B5 . . . A5 . G5 . D6 . . . C6 . B5 .',
      'C6 . . . . . . . G5 . E5 . C5 . . .', 'D5 . . . E5 . . . G5 . . . - . . .',
      'F5 . . . . . A5 . . . C6 . . . A5 .', 'G5 . . . . . . . E5 . . . B4 . . .',
      'A5 . . . . . C6 . . . E6 . . . D6 .', 'D6 . . . . . . . . . . . B5 . . .',
      'C6 . . . A5 . . . F5 . . . A5 . . .', 'B5 . . . G5 . . . E5 . . . G5 . . .',
      'A5 . . . C6 . . . B5 . . . D6 . . .', 'C6 . . . . . . . . . . . - . . .',
    ], inst: 'lead', layer: 3, rev: 0.3, dly: 0.12 },
    { drum: 1, inst: 'shaker', layer: 4, pat: 'oxoxoxoxoxoxoxox' },
    { arp: 1, inst: 'marimba', layer: 4, oct: 4, pat: '2..1..0.2..1..4.', pan: -0.4, rev: 0.2 },
    { mel: [
      'A5 . . C6 . . A5 . G5 . . E5 . . C5 .', 'D5 . . . . . . . B4 . C5 . D5 . . .',
      'G5 . . B5 . . G5 . E5 . . D5 . . B4 .', 'C5 . . . . . . . - . . . E5 . G5 .',
      'A5 . . C6 . . A5 . G5 . . E5 . . G5 .', 'B5 . . . A5 . G5 . D6 . . . C6 . B5 .',
      'C6 . . . . . . . G5 . E5 . C5 . . .', 'D5 . . . E5 . . . G5 . . . - . . .',
      'F5 . . . . . A5 . . . C6 . . . A5 .', 'G5 . . . . . . . E5 . . . B4 . . .',
      'A5 . . . . . C6 . . . E6 . . . D6 .', 'D6 . . . . . . . . . . . B5 . . .',
      'C6 . . . A5 . . . F5 . . . A5 . . .', 'B5 . . . G5 . . . E5 . . . G5 . . .',
      'A5 . . . C6 . . . B5 . . . D6 . . .', 'C6 . . . . . . . . . . . - . . .',
    ], inst: 'bell', layer: 5, transpose: 12, rev: 0.5, vol: 0.55 },
    { drum: 1, inst: 'crash', layer: 5, pat: ['x...............', '................', '................', '................', '................', '................', '................', '................'] },
  ],
};

// ---------------------------------------------------------------------------
// STAGE 2 — Halo Belt (mysterious space groove, D minor)
// ---------------------------------------------------------------------------
SONGS.halo = {
  name: 'halo', bpm: 136,
  chords: ['Dm', 'Bb', 'C', 'Am', 'Dm', 'Bb', 'Gm', 'A'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x.....x...x.....', 'x.....x...x...x.'] },
    { drum: 1, inst: 'hat', layer: 0, pat: 'x.o.x.o.x.o.x.oo' },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: 'R.R.RRr.R.R.RR5.' },
    { drum: 1, inst: 'snare', layer: 1, pat: ['....x.......x...', '....x.......x..o'] },
    { pad: 1, inst: 'pad', layer: 1, oct: 3, rev: 0.6, vol: 0.9 },
    { arp: 1, inst: 'pluck', layer: 2, oct: 4, pat: '0.2.4.2.1.2.4.6.', dly: 0.45, rev: 0.3, pan: -0.3 },
    { mel: [
      'D5 . . . . . A5 . . . . . F5 . . .', 'D5 . . . . . . . . . C5 . D5 . F5 .',
      'E5 . . . . . G5 . . . . . C6 . . .', 'A5 . . . . . . . E5 . . . . . . .',
      'D5 . . . . . A5 . . . . . D6 . . .', 'C6 . . . . . Bb5 . . . A5 . . . F5 .',
      'G5 . . . . . Bb5 . . . D6 . . . C6 .', 'C#6 . . . . . . . A5 . . . E5 . . .',
    ], inst: 'lead', layer: 3, rev: 0.4, dly: 0.25 },
    { drum: 1, inst: 'tom', layer: 4, note: 43, pat: ['................', '................', '................', '..........x.x.xx'] },
    { arp: 1, inst: 'bell', layer: 4, oct: 5, pat: '4.......6.......', rev: 0.6, pan: 0.4 },
    { mel: [
      'A5 . . . . . . . . . . . . . . .', 'F5 . . . . . . . . . . . . . . .',
      'G5 . . . . . . . . . . . . . . .', 'E5 . . . . . . . . . . . . . . .',
      'A5 . . . . . . . . . . . . . . .', 'D6 . . . . . . . . . . . . . . .',
      'D6 . . . . . . . . . . . . . . .', 'E6 . . . . . . . . . . . . . . .',
    ], inst: 'choir', layer: 5, rev: 0.6, vol: 0.9 },
  ],
};

// ---------------------------------------------------------------------------
// STAGE 3 — Frostline (ethereal half-time, E minor)
// ---------------------------------------------------------------------------
SONGS.frost = {
  name: 'frost', bpm: 104,
  chords: ['Em9', 'Cmaj7', 'G', 'D', 'Em9', 'Cmaj7', 'Am7', 'B7'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x.........x.....', 'x.........x..x..'] },
    { drum: 1, inst: 'hat', layer: 0, pat: '..x...x...x...xo' },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: 'R.......R...5.r.' },
    { drum: 1, inst: 'snare', layer: 1, pat: '........x.......' },
    { pad: 1, inst: 'choir', layer: 1, oct: 4, voicing: [0, 1, 2], rev: 0.7, vol: 0.9 },
    { arp: 1, inst: 'bell', layer: 2, oct: 5, pat: '0.1.2.4.2.1.0.1.', dly: 0.4, rev: 0.5, pan: 0.3 },
    { mel: [
      'B5 . . . . . . . G5 . . . F#5 . . .', 'E5 . . . . . . . . . . . G5 . B5 .',
      'D6 . . . . . . . B5 . . . A5 . . .', 'F#5 . . . . . . . . . . . - . . .',
      'B5 . . . . . D6 . . . E6 . . . D6 .', 'B5 . . . . . . . G5 . . . E5 . . .',
      'C6 . . . . . B5 . . . A5 . . . G5 .', 'F#5 . . . . . . . D#5 . . . B4 . . .',
    ], inst: 'flute', layer: 3, rev: 0.55, dly: 0.2 },
    { drum: 1, inst: 'shaker', layer: 4, pat: 'o.o.o.o.o.o.o.o.' },
    { arp: 1, inst: 'marimba', layer: 4, oct: 4, pat: '4...2...5...2...', pan: -0.4, rev: 0.4 },
    { pad: 1, inst: 'pad', layer: 5, oct: 5, voicing: [1, 2], rev: 0.7, vol: 0.7 },
  ],
};

// ---------------------------------------------------------------------------
// STAGE 4 — The Forge (industrial, G minor)
// ---------------------------------------------------------------------------
SONGS.forge = {
  name: 'forge', bpm: 150,
  chords: ['Gm', 'Gm', 'Eb', 'F', 'Gm', 'Gm', 'Cm', 'D'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x..x..x.x..x..x.', 'x..x..x.x..x.xx.'] },
    { drum: 1, inst: 'hat', layer: 0, pat: 'x.x.x.x.x.x.x.x.' },
    { bass: 1, inst: 'bassHeavy', layer: 0, oct: 1, pat: 'RRrRRRrRRRrRRRr5', gate: 0.7 },
    { drum: 1, inst: 'snare', layer: 1, pat: ['....x.......x...', '....x.......x.oo'] },
    { pad: 1, inst: 'pad', layer: 1, oct: 3, voicing: [0, 2, 3], rev: 0.4, vol: 0.8 },
    { arp: 1, inst: 'pluck', layer: 2, oct: 4, pat: '0404040404040404', dly: 0.15, pan: 0.3 },
    { mel: [
      'G4 . G4 . Bb4 . G4 . C5 . Bb4 . G4 . F4 .', 'G4 . . . . . . . D5 . . . C5 . Bb4 .',
      'Eb5 . . . D5 . . . Bb4 . . . G4 . . .', 'F4 . . . A4 . . . C5 . . . F5 . . .',
      'G5 . G5 . F5 . D5 . Bb4 . C5 . D5 . . .', 'G5 . . . . . . . Bb5 . A5 . G5 . F5 .',
      'Eb5 . . . G5 . . . C6 . . . Bb5 . G5 .', 'F#5 . . . A5 . . . D6 . . . C6 . A5 .',
    ], inst: 'brass', layer: 3, rev: 0.25 },
    { drum: 1, inst: 'tom', layer: 4, note: 40, pat: ['................', '............x.xx'] },
    { drum: 1, inst: 'clap', layer: 4, pat: '....x.......x...' },
    { mel: [
      'G5 . G5 . Bb5 . G5 . C6 . Bb5 . G5 . F5 .', 'G5 . . . . . . . D6 . . . C6 . Bb5 .',
      'Eb6 . . . D6 . . . Bb5 . . . G5 . . .', 'F5 . . . A5 . . . C6 . . . F6 . . .',
      'G6 . G6 . F6 . D6 . Bb5 . C6 . D6 . . .', 'G6 . . . . . . . Bb6 . A6 . G6 . F6 .',
      'Eb6 . . . G6 . . . C7 . . . Bb6 . G6 .', 'F#6 . . . A6 . . . D7 . . . C7 . A6 .',
    ], inst: 'sqlead', layer: 5, rev: 0.3, vol: 0.6 },
  ],
};

// ---------------------------------------------------------------------------
// STAGE 5 — The Hush (A minor → triumph). Starts nearly silent.
// ---------------------------------------------------------------------------
SONGS.hush = {
  name: 'hush', bpm: 120,
  chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: 'x.......x.......' },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: 'R.......R.......' },
    { pad: 1, inst: 'choir', layer: 1, oct: 4, voicing: [0, 1, 2], rev: 0.8 },
    { drum: 1, inst: 'hat', layer: 2, pat: '..x...x...x...x.' },
    { arp: 1, inst: 'bell', layer: 2, oct: 5, pat: '0.1.2.4.2.1.0.1.', dly: 0.4, rev: 0.6 },
    { mel: [
      'E5 . . . A5 . . . C6 . . . B5 . A5 .', 'A5 . . . . . . . F5 . . . . . . .',
      'G5 . . . . . E5 . . . C5 . . . E5 .', 'D5 . . . . . . . - . . . . . . .',
      'E5 . . . A5 . . . C6 . . . E6 . . .', 'D6 . . . C6 . . . A5 . . . F5 . . .',
      'A5 . . . . . D6 . . . C6 . . . A5 .', 'G#5 . . . . . . . B5 . . . E6 . . .',
    ], inst: 'lead', layer: 3, rev: 0.5, dly: 0.2 },
    { drum: 1, inst: 'snare', layer: 4, pat: '....x.......x...' },
    { bass: 1, inst: 'bass', layer: 4, oct: 2, pat: '..r...r...r...r.' },
    { mel: [
      'E5 . . . A5 . . . C6 . . . B5 . A5 .', 'A5 . . . . . . . F5 . . . . . . .',
      'G5 . . . . . E5 . . . C5 . . . E5 .', 'D5 . . . . . . . - . . . . . . .',
      'E5 . . . A5 . . . C6 . . . E6 . . .', 'D6 . . . C6 . . . A5 . . . F5 . . .',
      'A5 . . . . . D6 . . . C6 . . . A5 .', 'G#5 . . . . . . . B5 . . . E6 . . .',
    ], inst: 'brass', layer: 5, transpose: -12, rev: 0.4, vol: 0.9 },
    { drum: 1, inst: 'ohat', layer: 5, pat: '..x...x...x...x.' },
  ],
};

// ---------------------------------------------------------------------------
// BOSS — "Static Overture" (C minor, 150)
// ---------------------------------------------------------------------------
SONGS.boss = {
  name: 'boss', bpm: 150,
  chords: ['Cm', 'Ab', 'Bb', 'G', 'Cm', 'Ab', 'Fm', 'G7'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x.x...x.x.x...x.', 'x.x...x.x.x..xx.'] },
    { drum: 1, inst: 'hat', layer: 0, pat: 'xoxoxoxoxoxoxoxo' },
    { bass: 1, inst: 'bassHeavy', layer: 0, oct: 1, pat: 'R.R.r.R.R.R.r.5.', gate: 0.8 },
    { drum: 1, inst: 'snare', layer: 1, pat: ['....x.......x...', '....x.......x...', '....x.......x...', '....x.....x.xxxx'] },
    { pad: 1, inst: 'brass', layer: 1, oct: 3, voicing: [0, 1, 2], rev: 0.3, vol: 0.55 },
    { arp: 1, inst: 'pluck', layer: 2, oct: 4, pat: '0123012301230123', dly: 0.1, pan: 0.3 },
    { mel: [
      'C5 . C5 . Eb5 . C5 . G5 . . . F5 . Eb5 .', 'Eb5 . . . C5 . . . Ab4 . . . C5 . Eb5 .',
      'D5 . . . Bb4 . D5 . F5 . . . Bb5 . . .', 'B4 . . . D5 . . . G5 . . . F5 . D5 .',
      'C6 . . . G5 . . . Eb5 . . . G5 . C6 .', 'Eb6 . . . D6 . C6 . Ab5 . . . C6 . . .',
      'C6 . . . Ab5 . . . F5 . . . Ab5 . C6 .', 'B5 . . . . . . . D6 . C6 . B5 . G5 .',
    ], inst: 'lead', layer: 3, rev: 0.3 },
    { drum: 1, inst: 'crash', layer: 4, pat: ['x...............', '................', '................', '................'] },
    { drum: 1, inst: 'tom', layer: 4, note: 38, pat: ['................', '............x.x.'] },
    { mel: [
      'C5 . C5 . Eb5 . C5 . G5 . . . F5 . Eb5 .', 'Eb5 . . . C5 . . . Ab4 . . . C5 . Eb5 .',
      'D5 . . . Bb4 . D5 . F5 . . . Bb5 . . .', 'B4 . . . D5 . . . G5 . . . F5 . D5 .',
      'C6 . . . G5 . . . Eb5 . . . G5 . C6 .', 'Eb6 . . . D6 . C6 . Ab5 . . . C6 . . .',
      'C6 . . . Ab5 . . . F5 . . . Ab5 . C6 .', 'B5 . . . . . . . D6 . C6 . B5 . G5 .',
    ], inst: 'brass', layer: 5, transpose: -12, rev: 0.3, vol: 0.8 },
  ],
};

// ---------------------------------------------------------------------------
// FINAL BOSS — "Unsilenced" (D minor, 160)
// ---------------------------------------------------------------------------
SONGS.final = {
  name: 'final', bpm: 160,
  chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'F', 'Gm', 'A7'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x...x...x...x...', 'x...x...x...x.x.'] },
    { drum: 1, inst: 'hat', layer: 0, pat: '..x...x...x...x.' },
    { bass: 1, inst: 'bassHeavy', layer: 0, oct: 1, pat: 'RrRrRrRrRrRrRrRr', gate: 0.6 },
    { drum: 1, inst: 'clap', layer: 1, pat: '....x.......x...' },
    { pad: 1, inst: 'choir', layer: 1, oct: 4, voicing: [0, 1, 2], rev: 0.6 },
    { arp: 1, inst: 'pluck', layer: 2, oct: 4, pat: '0124012401240124', dly: 0.2, pan: -0.3 },
    { mel: [
      'D5 . F5 . A5 . D6 . . . C6 . A5 . F5 .', 'Bb5 . . . A5 . . . F5 . . . D5 . . .',
      'G5 . Bb5 . D6 . G6 . . . F6 . D6 . Bb5 .', 'C#6 . . . . . . . E6 . . . A5 . . .',
      'D6 . . . . . A5 . . . F5 . . . D5 .', 'C6 . . . . . A5 . . . F5 . . . C5 .',
      'Bb5 . . . A5 . . . G5 . . . D6 . . .', 'C#6 . . . E6 . . . G6 . . . A6 . . .',
    ], inst: 'lead', layer: 3, rev: 0.35 },
    { drum: 1, inst: 'snare', layer: 4, pat: ['................', '............xxxx'] },
    { drum: 1, inst: 'ohat', layer: 4, pat: '..x...x...x...x.' },
    { mel: [
      'D5 . F5 . A5 . D6 . . . C6 . A5 . F5 .', 'Bb5 . . . A5 . . . F5 . . . D5 . . .',
      'G5 . Bb5 . D6 . G6 . . . F6 . D6 . Bb5 .', 'C#6 . . . . . . . E6 . . . A5 . . .',
      'D6 . . . . . A5 . . . F5 . . . D5 .', 'C6 . . . . . A5 . . . F5 . . . C5 .',
      'Bb5 . . . A5 . . . G5 . . . D6 . . .', 'C#6 . . . E6 . . . G6 . . . A6 . . .',
    ], inst: 'brass', layer: 5, transpose: -12, rev: 0.35, vol: 0.9 },
  ],
};

// ---------------------------------------------------------------------------
// Briefing / map ambience (soft; uses its own sparse arrangement)
// ---------------------------------------------------------------------------
SONGS.brief = {
  name: 'brief', bpm: 92,
  chords: ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7'],
  tracks: [
    { pad: 1, inst: 'pad', layer: 0, oct: 4, rev: 0.7, vol: 0.9 },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: 'R.......5.......', vol: 0.7 },
    { arp: 1, inst: 'bell', layer: 0, oct: 5, pat: '0...2...4...2...', dly: 0.5, rev: 0.6, vol: 0.7 },
    { drum: 1, inst: 'shaker', layer: 0, pat: '..o...o...o...o.' },
  ],
};

// ---------------------------------------------------------------------------
// Jingles (non-looping)
// ---------------------------------------------------------------------------
SONGS.clear = {
  name: 'clear', bpm: 140, loop: false,
  chords: ['C', 'F', 'G', 'C'],
  tracks: [
    { drum: 1, inst: 'kick', layer: 0, pat: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x.x.x.x.', 'x...............'] },
    { drum: 1, inst: 'snare', layer: 0, pat: ['....x.......x...', '....x.......x...', '....x...x.xxxxxx', '................'] },
    { drum: 1, inst: 'crash', layer: 0, pat: ['x...............', '................', '................', 'x...............'] },
    { pad: 1, inst: 'brass', layer: 0, oct: 4, voicing: [0, 1, 2], rev: 0.4, vol: 0.8 },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: ['R.r.R.r.R.r.R.r.', 'R.r.R.r.R.r.R.r.', 'R.r.R.r.R.r.R.r.', 'R...............'] },
    { mel: ['C5 . . G4 C5 . E5 . G5 . . . E5 . G5 .', 'A5 . . . . . G5 . F5 . . . A5 . . .', 'B5 . . . . . A5 . G5 . A5 . B5 . D6 .', 'C6 . . . . . . . . . . . . . . .'], inst: 'lead', layer: 0, rev: 0.4 },
  ],
};
SONGS.gameover = {
  name: 'gameover', bpm: 84, loop: false,
  chords: ['Am', 'Dm', 'E', 'Am'],
  tracks: [
    { pad: 1, inst: 'pad', layer: 0, oct: 3, rev: 0.7 },
    { mel: ['E5 . . . C5 . . . A4 . . . . . . .', 'F4 . . . A4 . . . D5 . . . . . . .', 'G#4 . . . B4 . . . D5 . . . E5 . . .', 'A4 . . . . . . . . . . . . . . .'], inst: 'flute', layer: 0, rev: 0.6 },
  ],
};
SONGS.logo = {
  name: 'logo', bpm: 120, loop: false,
  chords: ['Cmaj7', 'Cmaj7'],
  tracks: [
    { drum: 1, inst: 'crash', layer: 0, pat: ['x...............', '................'] },
    { pad: 1, inst: 'pad', layer: 0, oct: 4, rev: 0.8 },
    { mel: ['C5 E5 G5 B5 C6 E6 G6 B6 C7 . . . . . . .', '. . . . . . . . . . . . . . . .'], inst: 'bell', layer: 0, rev: 0.6, dly: 0.3 },
    { bass: 1, inst: 'bass', layer: 0, oct: 2, pat: ['R...............', '................'] },
  ],
};
SONGS.ending = Object.assign({}, SONGS.title, { name: 'ending', bpm: 100 });
