'use strict';
// =============================================================================
// SYNTHWING 64 — font.js
// 5x7 bitmap font (hand-authored) rendered to the low-res HUD canvas, with
// cached tinted/gradient atlases, outlines and drop shadows.
// =============================================================================

const GLYPH_SRC = {
  ' ': '00000 00000 00000 00000 00000 00000 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '"': '01010 01010 00000 00000 00000 00000 00000',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '$': '00100 01111 10100 01110 00101 11110 00100',
  '%': '11000 11001 00010 00100 01000 10011 00011',
  '&': '01100 10010 10100 01000 10101 10010 01101',
  "'": '00100 00100 00000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '*': '00000 00100 10101 01110 10101 00100 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  ',': '00000 00000 00000 00000 00110 00100 01000',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  '/': '00000 00001 00010 00100 01000 10000 00000',
  '0': '01110 10001 10011 10101 11001 10001 01110',
  '1': '00100 01100 00100 00100 00100 00100 01110',
  '2': '01110 10001 00001 00010 00100 01000 11111',
  '3': '11111 00010 00100 00010 00001 10001 01110',
  '4': '00010 00110 01010 10010 11111 00010 00010',
  '5': '11111 10000 11110 00001 00001 10001 01110',
  '6': '00110 01000 10000 11110 10001 10001 01110',
  '7': '11111 00001 00010 00100 01000 01000 01000',
  '8': '01110 10001 10001 01110 10001 10001 01110',
  '9': '01110 10001 10001 01111 00001 00010 01100',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  ';': '00000 01100 01100 00000 01100 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '?': '01110 10001 00001 00010 00100 00000 00100',
  '@': '01110 10001 00001 01101 10101 10101 01110',
  'A': '01110 10001 10001 10001 11111 10001 10001',
  'B': '11110 10001 10001 11110 10001 10001 11110',
  'C': '01110 10001 10000 10000 10000 10001 01110',
  'D': '11100 10010 10001 10001 10001 10010 11100',
  'E': '11111 10000 10000 11110 10000 10000 11111',
  'F': '11111 10000 10000 11110 10000 10000 10000',
  'G': '01110 10001 10000 10111 10001 10001 01111',
  'H': '10001 10001 10001 11111 10001 10001 10001',
  'I': '01110 00100 00100 00100 00100 00100 01110',
  'J': '00111 00010 00010 00010 00010 10010 01100',
  'K': '10001 10010 10100 11000 10100 10010 10001',
  'L': '10000 10000 10000 10000 10000 10000 11111',
  'M': '10001 11011 10101 10101 10001 10001 10001',
  'N': '10001 10001 11001 10101 10011 10001 10001',
  'O': '01110 10001 10001 10001 10001 10001 01110',
  'P': '11110 10001 10001 11110 10000 10000 10000',
  'Q': '01110 10001 10001 10001 10101 10010 01101',
  'R': '11110 10001 10001 11110 10100 10010 10001',
  'S': '01111 10000 10000 01110 00001 00001 11110',
  'T': '11111 00100 00100 00100 00100 00100 00100',
  'U': '10001 10001 10001 10001 10001 10001 01110',
  'V': '10001 10001 10001 10001 10001 01010 00100',
  'W': '10001 10001 10001 10101 10101 10101 01010',
  'X': '10001 10001 01010 00100 01010 10001 10001',
  'Y': '10001 10001 10001 01010 00100 00100 00100',
  'Z': '11111 00001 00010 00100 01000 10000 11111',
  '[': '01110 01000 01000 01000 01000 01000 01110',
  '\\': '00000 10000 01000 00100 00010 00001 00000',
  ']': '01110 00010 00010 00010 00010 00010 01110',
  '^': '00100 01010 10001 00000 00000 00000 00000',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '`': '01000 00100 00010 00000 00000 00000 00000',
  'a': '00000 00000 01110 00001 01111 10001 01111',
  'b': '10000 10000 10110 11001 10001 10001 11110',
  'c': '00000 00000 01110 10000 10000 10001 01110',
  'd': '00001 00001 01101 10011 10001 10001 01111',
  'e': '00000 00000 01110 10001 11111 10000 01110',
  'f': '00110 01001 01000 11100 01000 01000 01000',
  'g': '00000 01111 10001 10001 01111 00001 01110',
  'h': '10000 10000 10110 11001 10001 10001 10001',
  'i': '00100 00000 01100 00100 00100 00100 01110',
  'j': '00010 00000 00110 00010 00010 10010 01100',
  'k': '10000 10000 10010 10100 11000 10100 10010',
  'l': '01100 00100 00100 00100 00100 00100 01110',
  'm': '00000 00000 11010 10101 10101 10001 10001',
  'n': '00000 00000 10110 11001 10001 10001 10001',
  'o': '00000 00000 01110 10001 10001 10001 01110',
  'p': '00000 00000 11110 10001 11110 10000 10000',
  'q': '00000 00000 01101 10011 01111 00001 00001',
  'r': '00000 00000 10110 11001 10000 10000 10000',
  's': '00000 00000 01110 10000 01110 00001 11110',
  't': '01000 01000 11100 01000 01000 01001 00110',
  'u': '00000 00000 10001 10001 10001 10011 01101',
  'v': '00000 00000 10001 10001 10001 01010 00100',
  'w': '00000 00000 10001 10001 10101 10101 01010',
  'x': '00000 00000 10001 01010 00100 01010 10001',
  'y': '00000 00000 10001 10001 01111 00001 01110',
  'z': '00000 00000 11111 00010 00100 01000 11111',
  '{': '00010 00100 00100 01000 00100 00100 00010',
  '|': '00100 00100 00100 00100 00100 00100 00100',
  '}': '01000 00100 00100 00010 00100 00100 01000',
  '~': '00000 00000 01000 10101 00010 00000 00000',
  // icons
  '♪': '00110 00101 00100 00100 01100 11100 11000',
  '★': '00100 00100 11111 01110 01110 11011 10001',
  '♥': '00000 01010 11111 11111 01110 00100 00000',
  '▶': '01000 01100 01110 01111 01110 01100 01000',
  '◀': '00010 00110 01110 11110 01110 00110 00010',
  '▲': '00000 00100 01110 11111 00000 00000 00000',
  '▼': '00000 00000 11111 01110 00100 00000 00000',
  '●': '00000 01110 11111 11111 11111 01110 00000',
  '×': '00000 10001 01010 00100 01010 10001 00000',
  '…': '00000 00000 00000 00000 00000 00000 10101',
  '—': '00000 00000 00000 11111 00000 00000 00000',
  '’': '00100 00100 01000 00000 00000 00000 00000',
  '✦': '00100 00100 01110 11111 01110 00100 00100',
  '·': '00000 00000 00000 00100 00000 00000 00000',
  'Ψ': '10101 10101 10101 01110 00100 00100 00100',
  '♫': '01111 01001 01001 01001 11011 11011 00000',
  '»': '00000 10100 01010 00101 01010 10100 00000',
};

const Font = {
  GW: 5, GH: 7, ADV: 6, LINE: 9,
  chars: '',
  index: new Map(),
  base: null,
  cache: new Map(),
  init() {
    const keys = Object.keys(GLYPH_SRC);
    this.chars = keys.join('');
    const c = makeCanvas(keys.length * 6, 8), g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    keys.forEach((k, i) => {
      this.index.set(k, i);
      const rows = GLYPH_SRC[k].split(' ');
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        if (rows[y][x] === '1') { const o = (y * c.width + i * 6 + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = 255; }
      }
    });
    g.putImageData(img, 0, 0);
    this.base = c;
  },
  bitmap(ch) { const s = GLYPH_SRC[ch]; return s ? s.split(' ') : null; },
  // Tinted atlas for a CSS colour, or a vertical gradient [top, bottom] (or 3 stops).
  atlas(style) {
    const key = Array.isArray(style) ? style.join('|') : style;
    let a = this.cache.get(key);
    if (a) return a;
    a = makeCanvas(this.base.width, 8);
    const g = a.getContext('2d');
    g.drawImage(this.base, 0, 0);
    g.globalCompositeOperation = 'source-in';
    if (Array.isArray(style)) {
      const gr = g.createLinearGradient(0, 0, 0, 7);
      style.forEach((s, i) => gr.addColorStop(i / (style.length - 1), s));
      g.fillStyle = gr;
    } else g.fillStyle = style;
    g.fillRect(0, 0, a.width, 8);
    this.cache.set(key, a);
    return a;
  },
  width(text, scale = 1) { return text.length ? (text.length * this.ADV - 1) * scale : 0; },
  // opts: color (string|array gradient), scale, align, outline (colour), shadow (colour), thick (bool)
  draw(g, text, x, y, opts = {}) {
    text = String(text);
    const s = opts.scale || 1;
    const w = this.width(text, s);
    let x0 = Math.round(opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x);
    const y0 = Math.round(y);
    if (opts.shadow) this._run(g, text, x0 + s, y0 + s, s, this.atlas(opts.shadow), opts.spacing);
    if (opts.outline) {
      const at = this.atlas(opts.outline);
      const offs = opts.thick ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] : [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [ox, oy] of offs) this._run(g, text, x0 + ox * s, y0 + oy * s, s, at, opts.spacing);
    }
    this._run(g, text, x0, y0, s, this.atlas(opts.color || '#fff'), opts.spacing);
    return w;
  },
  _run(g, text, x, y, s, atlas, spacing = 0) {
    for (let i = 0; i < text.length; i++) {
      const idx = this.index.get(text[i]);
      if (idx !== undefined && text[i] !== ' ') g.drawImage(atlas, idx * 6, 0, 5, 7, x, y, 5 * s, 7 * s);
      x += (this.ADV + spacing) * s;
    }
  },
  // Word-wrap to a pixel width at scale 1.
  wrap(text, maxW, scale = 1) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (this.width(t, scale) > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  },
};

// =============================================================================
// Portraits — drawn with canvas primitives at 40x40, then quantised to a
// palette and outlined so they read as crisp pixel art in the comm window.
// =============================================================================
const PORTRAIT_SIZE = 40;
const Portraits = {
  cache: new Map(),
  get(who, talk, blink) {
    const key = who + (talk ? 1 : 0) + (blink ? 1 : 0);
    let c = this.cache.get(key);
    if (!c) { c = this.render(who, talk, blink); this.cache.set(key, c); }
    return c;
  },
  render(who, talk, blink) {
    const S = PORTRAIT_SIZE, c = makeCanvas(S, S), g = c.getContext('2d');
    const def = PORTRAIT_DEFS[who] || PORTRAIT_DEFS.oz;
    def.draw(g, talk, blink);
    // Quantise: hard alpha + snap to palette, then add a dark 1px silhouette outline.
    const img = g.getImageData(0, 0, S, S), d = img.data;
    const pal = def.palette.map(hexToRgb255);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      let best = 0, bd = 1e9;
      for (let p = 0; p < pal.length; p++) { const q = pal[p], dr = d[i] - q[0], dg = d[i + 1] - q[1], db = d[i + 2] - q[2]; const dd = dr * dr * 2 + dg * dg * 3 + db * db; if (dd < bd) { bd = dd; best = p; } }
      d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2]; d[i + 3] = 255;
    }
    const out = new Uint8ClampedArray(d);
    const ol = hexToRgb255(def.outline || '#140c1c');
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const o = (y * S + x) * 4;
      if (d[o + 3]) continue;
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < S && yy < S && d[(yy * S + xx) * 4 + 3] > 0;
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) { out[o] = ol[0]; out[o + 1] = ol[1]; out[o + 2] = ol[2]; out[o + 3] = 255; }
    }
    g.putImageData(new ImageData(out, S, S), 0, 0);
    return c;
  },
};
function hexToRgb255(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

function pEllipse(g, x, y, rx, ry, col, rot = 0) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); }
function pPoly(g, pts, col) { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
function pRect(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function pLine(g, pts, col, w = 1) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
function pEyes(g, x, y, spread, rx, ry, white, pupil, blink, lid, look = 0) {
  for (const s of [-1, 1]) {
    const ex = x + s * spread;
    if (blink) { pLine(g, [[ex - rx, y], [ex + rx, y]], lid, 1.4); continue; }
    pEllipse(g, ex, y, rx, ry, white);
    pEllipse(g, ex + look + s * 0.2, y + 0.3, rx * 0.5, ry * 0.62, pupil);
    pRect(g, ex + look - rx * 0.15, y - ry * 0.45, 1, 1, '#ffffff');
  }
}

const PORTRAIT_DEFS = {
  // OZ — veteran tortoise pilot: leather cap, goggles, white moustache, red scarf.
  oz: {
    palette: ['#7fb24a', '#557f2e', '#a9d86a', '#7a4a24', '#4f2e15', '#9fe3ff', '#d9b04a', '#f4f1e2', '#1b1b1b', '#5a1e14', '#d8453a', '#9a2a22', '#4a6fa8', '#2f4a78', '#ff9a8a'],
    draw(g, talk, blink) {
      pPoly(g, [[6, 40], [8, 32], [16, 29], [24, 29], [32, 32], [34, 40]], '#4a6fa8');
      pPoly(g, [[12, 40], [14, 33], [20, 31], [26, 33], [28, 40]], '#2f4a78');
      pEllipse(g, 20, 31, 9, 3.2, '#d8453a');
      pPoly(g, [[22, 31], [27, 31], [29, 39], [25, 38]], '#9a2a22');
      pEllipse(g, 20, 19, 13, 12, '#7fb24a');
      pEllipse(g, 20, 23, 10, 7, '#a9d86a');
      pEllipse(g, 20, 11, 13.5, 8, '#7a4a24');
      pRect(g, 6, 11, 28, 4, '#7a4a24');
      pRect(g, 6, 13, 28, 2, '#4f2e15');
      pEllipse(g, 7, 17, 2.5, 5, '#7a4a24');
      pEllipse(g, 33, 17, 2.5, 5, '#7a4a24');
      for (const x of [14, 26]) { pEllipse(g, x, 9, 4.2, 3.4, '#d9b04a'); pEllipse(g, x, 9, 2.8, 2.2, '#9fe3ff'); }
      pRect(g, 17, 8, 6, 2, '#d9b04a');
      pEyes(g, 20, 19, 5, 2.6, 2.2, '#f4f1e2', '#1b1b1b', blink, '#557f2e');
      pRect(g, 12, 16, 6, 1.6, '#557f2e'); pRect(g, 22, 16, 6, 1.6, '#557f2e');
      pRect(g, 18.2, 23, 1.2, 1.2, '#557f2e'); pRect(g, 20.8, 23, 1.2, 1.2, '#557f2e');
      if (talk) { pEllipse(g, 20, 28.5, 4, 2.6, '#5a1e14'); pEllipse(g, 20, 29.5, 2.4, 1.2, '#ff9a8a'); }
      else pLine(g, [[17, 28.5], [23, 28.5]], '#5a1e14', 1.2);
      pEllipse(g, 16, 25.8, 4.6, 2, '#f4f1e2', 0.25);
      pEllipse(g, 24, 25.8, 4.6, 2, '#f4f1e2', -0.25);
    },
  },
  // SABLE — ace panther: sleek black, yellow eyes, purple flight collar.
  sable: {
    palette: ['#2a2438', '#191526', '#4a4060', '#ffd23f', '#1b1b1b', '#8a4dff', '#5c2fb8', '#e9e4f5', '#ff6f9c', '#c9b8ff', '#5a1e14'],
    draw(g, talk, blink) {
      pPoly(g, [[5, 40], [9, 31], [20, 28], [31, 31], [35, 40]], '#8a4dff');
      pPoly(g, [[14, 40], [16, 32], [20, 31], [24, 32], [26, 40]], '#5c2fb8');
      pPoly(g, [[8, 12], [9, 1], [16, 8]], '#2a2438');
      pPoly(g, [[32, 12], [31, 1], [24, 8]], '#2a2438');
      pPoly(g, [[10, 9], [10, 4], [14, 8]], '#ff6f9c');
      pPoly(g, [[30, 9], [30, 4], [26, 8]], '#ff6f9c');
      pEllipse(g, 20, 17, 12.5, 12, '#2a2438');
      pEllipse(g, 20, 24, 7, 5.5, '#4a4060');
      pPoly(g, [[10, 12], [18, 6], [20, 9], [16, 13]], '#4a4060');
      if (blink) { pLine(g, [[11, 17], [17, 18]], '#ffd23f', 1.2); pLine(g, [[23, 18], [29, 17]], '#ffd23f', 1.2); }
      else {
        pPoly(g, [[10, 16], [17, 15], [17, 19.5], [12, 19]], '#ffd23f');
        pPoly(g, [[30, 16], [23, 15], [23, 19.5], [28, 19]], '#ffd23f');
        pRect(g, 14, 15.5, 1.6, 4, '#1b1b1b'); pRect(g, 24.4, 15.5, 1.6, 4, '#1b1b1b');
        pRect(g, 11, 15, 6, 1, '#191526'); pRect(g, 23, 15, 6, 1, '#191526');
      }
      pPoly(g, [[18, 21.5], [22, 21.5], [20, 23.5]], '#ff6f9c');
      if (talk) { pEllipse(g, 20, 27, 3.2, 2.2, '#5a1e14'); pRect(g, 17, 25.3, 1, 1.4, '#e9e4f5'); pRect(g, 22, 25.3, 1, 1.4, '#e9e4f5'); }
      else { pLine(g, [[17, 26], [20, 27], [24, 25.5]], '#191526', 1); }
      pLine(g, [[9, 24], [4, 23]], '#c9b8ff', 0.7); pLine(g, [[9, 26], [4, 27]], '#c9b8ff', 0.7);
      pLine(g, [[31, 24], [36, 23]], '#c9b8ff', 0.7); pLine(g, [[31, 26], [36, 27]], '#c9b8ff', 0.7);
    },
  },
  // TOBI — rookie penguin engineer: round, headset, big eyes, orange beak.
  tobi: {
    palette: ['#1f2a44', '#131b2e', '#f4f6ff', '#c9d2ea', '#ff9a2a', '#c96a10', '#1b1b1b', '#6ad0ff', '#ff8a2a', '#4a4a58', '#ff6f9c', '#5a1e14'],
    draw(g, talk, blink) {
      pPoly(g, [[6, 40], [9, 32], [20, 29], [31, 32], [34, 40]], '#ff8a2a');
      pRect(g, 17, 31, 6, 9, '#f4f6ff');
      pEllipse(g, 20, 19, 14, 14, '#1f2a44');
      pEllipse(g, 20, 22, 10.5, 10, '#f4f6ff');
      pEllipse(g, 14, 12, 5, 4, '#1f2a44');
      pEllipse(g, 26, 12, 5, 4, '#1f2a44');
      pRect(g, 4, 14, 4, 9, '#4a4a58'); pRect(g, 32, 14, 4, 9, '#4a4a58');
      pLine(g, [[6, 14], [8, 6], [20, 3], [32, 6], [34, 14]], '#4a4a58', 2);
      pLine(g, [[6, 21], [10, 29], [14, 29]], '#4a4a58', 1.2);
      pEllipse(g, 15, 29, 1.6, 1.4, '#6ad0ff');
      pEyes(g, 20, 18, 4.8, 3.2, 3.8, '#f4f6ff', '#1b1b1b', blink, '#131b2e', 0.3);
      if (!blink) { pEllipse(g, 15.2, 18.5, 1.4, 2, '#1b1b1b'); pEllipse(g, 24.8, 18.5, 1.4, 2, '#1b1b1b'); pRect(g, 14.5, 16.8, 1, 1, '#ffffff'); pRect(g, 24.1, 16.8, 1, 1, '#ffffff'); }
      pEllipse(g, 12, 23, 2, 1.2, '#ff6f9c'); pEllipse(g, 28, 23, 2, 1.2, '#ff6f9c');
      if (talk) {
        pPoly(g, [[16, 22.5], [24, 22.5], [20, 25.5]], '#ff9a2a');
        pPoly(g, [[17, 26.5], [23, 26.5], [20, 28.5]], '#c96a10');
        pRect(g, 18, 25.4, 4, 1.2, '#5a1e14');
      } else {
        pPoly(g, [[16, 22.5], [24, 22.5], [20, 26.5]], '#ff9a2a');
        pLine(g, [[17, 24.5], [23, 24.5]], '#c96a10', 0.8);
      }
    },
  },
  // ADMIRAL MAREN — walrus commander: naval cap, tusks, bushy whiskers.
  maren: {
    palette: ['#8a5a3c', '#6a4028', '#b07a52', '#1f2e5a', '#131d3e', '#f2d24a', '#f4f1e2', '#1b1b1b', '#d9cdb5', '#5a1e14', '#3a2014'],
    draw(g, talk, blink) {
      pPoly(g, [[3, 40], [6, 30], [20, 27], [34, 30], [37, 40]], '#1f2e5a');
      pRect(g, 18.5, 30, 3, 10, '#f2d24a');
      pRect(g, 8, 33, 5, 2, '#f2d24a'); pRect(g, 27, 33, 5, 2, '#f2d24a');
      pEllipse(g, 20, 19, 15, 13, '#8a5a3c');
      pEllipse(g, 20, 24, 12, 7, '#b07a52');
      pPoly(g, [[5, 11], [9, 3], [31, 3], [35, 11]], '#1f2e5a');
      pRect(g, 4, 10, 32, 3, '#131d3e');
      pEllipse(g, 20, 7, 3, 2.5, '#f2d24a');
      pRect(g, 4, 12, 32, 1, '#f2d24a');
      pEyes(g, 20, 17, 6, 2.2, 2, '#f4f1e2', '#1b1b1b', blink, '#6a4028');
      pRect(g, 11, 14, 7, 1.5, '#6a4028'); pRect(g, 22, 14, 7, 1.5, '#6a4028');
      pEllipse(g, 20, 20.5, 2.4, 1.6, '#3a2014');
      pEllipse(g, 14.5, 24, 6, 4, '#d9cdb5');
      pEllipse(g, 25.5, 24, 6, 4, '#d9cdb5');
      if (talk) pEllipse(g, 20, 28.4, 3.4, 2.2, '#5a1e14');
      pPoly(g, [[15, 26], [17, 26], [16.5, 35], [15.5, 35]], '#f4f1e2');
      pPoly(g, [[23, 26], [25, 26], [24.5, 35], [23.5, 35]], '#f4f1e2');
    },
  },
  // THE HUSH — a hollow mask of silence.
  hush: {
    palette: ['#0c0a12', '#1c1a26', '#e8e6f0', '#9a98a8', '#ff2fa0', '#5a1f4a', '#3a3848'],
    outline: '#000000',
    draw(g, talk, blink) {
      pEllipse(g, 20, 20, 17, 19, '#1c1a26');
      pEllipse(g, 20, 19, 12, 15, '#e8e6f0');
      pPoly(g, [[8, 19], [20, 4], [32, 19], [20, 34]], '#e8e6f0');
      pPoly(g, [[11, 16], [17, 15], [17, 19], [12, 19]], '#0c0a12');
      pPoly(g, [[29, 16], [23, 15], [23, 19], [28, 19]], '#0c0a12');
      if (!blink) { pRect(g, 14, 16.5, 1.6, 1.6, '#ff2fa0'); pRect(g, 24.4, 16.5, 1.6, 1.6, '#ff2fa0'); }
      pLine(g, [[20, 22], [20, 26]], '#9a98a8', 0.8);
      if (talk) pEllipse(g, 20, 29, 2.6, 3.2, '#0c0a12'); else pLine(g, [[17, 29], [23, 29]], '#3a3848', 1);
      pLine(g, [[12, 8], [9, 3]], '#5a1f4a', 0.8); pLine(g, [[28, 8], [31, 3]], '#5a1f4a', 0.8);
    },
  },
  // Generic Static commander voice for bosses.
  static: {
    palette: ['#231a33', '#3d2c57', '#ff2fa0', '#ff9ad0', '#0c0a12', '#8a8098'],
    draw(g, talk, blink) {
      pPoly(g, [[20, 3], [35, 16], [30, 36], [10, 36], [5, 16]], '#231a33');
      pPoly(g, [[20, 7], [30, 16], [27, 31], [13, 31], [10, 16]], '#3d2c57');
      pRect(g, 11, 16, 18, 4, '#0c0a12');
      if (!blink) { pRect(g, 13, 17, 5, 2, '#ff2fa0'); pRect(g, 22, 17, 5, 2, '#ff2fa0'); pRect(g, 14, 17, 2, 1, '#ff9ad0'); }
      for (let i = 0; i < 5; i++) pRect(g, 14 + i * 2.6, talk ? 24 : 25, 1.4, talk ? 5 : 2, talk ? '#ff2fa0' : '#8a8098');
    },
  },
};
