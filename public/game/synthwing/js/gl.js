'use strict';
// =============================================================================
// SYNTHWING 64 — gl.js
// A tiny WebGL2 renderer that emulates the look of a 64-bit era console:
//  * low internal resolution upscaled with a soft bilinear "VI" filter
//  * 16-bit (RGBA5551-style) colour quantisation with ordered dithering
//  * N64 "3-point" texture filtering on small procedural textures
//  * Gouraud vertex lighting, distance fog, sphere-mapped chrome
// Survives WebGL context loss (iOS drops contexts in the background) by
// keeping CPU copies of every mesh/texture and re-uploading lazily.
// =============================================================================

const SHADER_COMMON = `
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int k = i.x + i.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[k] + 0.5) / 16.0;
}
vec3 quant5(vec3 c, vec2 fc, float on) {
  if (on < 0.5) return c;
  return floor(clamp(c, 0.0, 1.0) * 31.0 + bayer4(fc)) / 31.0;
}
`;

const LIT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aCol;
layout(location=3) in vec2 aUV;
uniform mat4 uProj, uView, uModel;
uniform vec3 uLightDir, uLightCol, uAmbient;
uniform vec4 uTint;
uniform vec3 uEmissive;
uniform float uFlash;
uniform vec2 uUVScale;
out vec4 vCol;
out vec2 vUV;
out float vDist;
out vec3 vNrmV;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec3 n = normalize(mat3(uModel) * aNrm);
  float diff = max(dot(n, uLightDir), 0.0);
  vec3 amb = uAmbient * (0.8 + 0.2 * n.y);
  vec3 lit = amb + uLightCol * diff;
  vec3 c = aCol.rgb * mix(vec3(1.0), lit, aCol.a) * uTint.rgb + uEmissive;
  c = mix(c, vec3(1.0), uFlash);
  vCol = vec4(c, uTint.a);
  vUV = aUV * uUVScale;
  vec4 vp = uView * wp;
  vDist = length(vp.xyz);
  vNrmV = mat3(uView) * n;
  gl_Position = uProj * vp;
}`;

const LIT_FS = `#version 300 es
precision highp float;
in vec4 vCol;
in vec2 vUV;
in float vDist;
in vec3 vNrmV;
uniform sampler2D uTex;
uniform sampler2D uEnv;
uniform vec2 uTexSize;
uniform float uUseTex;
uniform vec2 uTexScroll;
uniform float uTexMix;
uniform float uChrome;
uniform vec3 uFogCol;
uniform float uFogNear, uFogFar, uFogAmt;
uniform float uDither;
uniform float uAlphaCut;
out vec4 frag;
${SHADER_COMMON}
vec4 tex3(sampler2D t, vec2 uv, vec2 size) {
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 inv = 1.0 / size;
  vec2 base = (i + 0.5) * inv;
  vec4 a = texture(t, base);
  vec4 b = texture(t, base + vec2(inv.x, 0.0));
  vec4 c = texture(t, base + vec2(0.0, inv.y));
  vec4 d = texture(t, base + inv);
  if (f.x + f.y < 1.0) return a + f.x * (b - a) + f.y * (c - a);
  return d + (1.0 - f.x) * (c - d) + (1.0 - f.y) * (b - d);
}
void main() {
  vec4 c = vCol;
  if (uUseTex > 0.5) {
    vec4 t = tex3(uTex, vUV + uTexScroll, uTexSize);
    c.rgb *= mix(vec3(1.0), t.rgb, uTexMix);
    c.a *= t.a;
    if (c.a < uAlphaCut) discard;
  }
  if (uChrome > 0.0) {
    vec3 n = normalize(vNrmV);
    vec3 e = texture(uEnv, vec2(n.x * 0.5 + 0.5, 0.5 - n.y * 0.5)).rgb;
    c.rgb = mix(c.rgb, c.rgb * e * 1.5 + e * 0.3, uChrome);
  }
  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogAmt;
  c.rgb = mix(c.rgb, uFogCol, fog);
  c.rgb = quant5(c.rgb, gl_FragCoord.xy, uDither);
  frag = c;
}`;

const SPRITE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec3 iAxis;
layout(location=3) in vec4 iSRF;
layout(location=4) in vec4 iCol;
uniform mat4 uProj, uView;
uniform vec2 uAtlas;
out vec2 vUV;
out vec4 vCol;
out float vDist;
void main() {
  vec4 vc = uView * vec4(iPos, 1.0);
  float w = iSRF.x, h = iSRF.y;
  vec2 off;
  if (dot(iAxis, iAxis) > 0.0) {
    vec3 va = mat3(uView) * iAxis;
    float l = length(va.xy);
    vec2 dir = l > 1e-4 ? va.xy / l : vec2(1.0, 0.0);
    float hl = max(l, h);
    off = dir * aCorner.x * hl + vec2(-dir.y, dir.x) * aCorner.y * w;
  } else {
    float c = cos(iSRF.z), s = sin(iSRF.z);
    vec2 p = aCorner * vec2(w, h);
    off = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }
  vc.xy += off;
  vDist = length(vc.xyz);
  float fr = iSRF.w;
  float col = mod(fr, uAtlas.x);
  float row = floor(fr / uAtlas.x);
  vUV = (vec2(col, row) + vec2(aCorner.x * 0.5 + 0.5, 0.5 - aCorner.y * 0.5)) / uAtlas;
  vCol = iCol;
  gl_Position = uProj * vc;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vCol;
in float vDist;
uniform sampler2D uTex;
uniform vec3 uFogCol;
uniform float uFogNear, uFogFar, uFogAmt;
uniform float uAdditive;
uniform float uDither;
out vec4 frag;
${SHADER_COMMON}
void main() {
  vec4 t = texture(uTex, vUV) * vCol;
  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogAmt;
  if (uAdditive > 0.5) {
    vec3 c = t.rgb * t.a * (1.0 - fog);
    frag = vec4(quant5(c, gl_FragCoord.xy, uDither), 1.0);
  } else {
    if (t.a < 0.01) discard;
    vec3 c = mix(t.rgb, uFogCol, fog);
    frag = vec4(quant5(c, gl_FragCoord.xy, uDither), t.a);
  }
}`;

const TRAIL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
layout(location=2) in float aSide;
uniform mat4 uProj, uView;
out vec4 vCol;
out float vSide;
out float vDist;
void main() {
  vec4 vp = uView * vec4(aPos, 1.0);
  vDist = length(vp.xyz);
  vCol = aCol;
  vSide = aSide;
  gl_Position = uProj * vp;
}`;

const TRAIL_FS = `#version 300 es
precision highp float;
in vec4 vCol;
in float vSide;
in float vDist;
uniform float uFogNear, uFogFar, uFogAmt;
uniform float uDither;
out vec4 frag;
${SHADER_COMMON}
void main() {
  float s = 1.0 - vSide * vSide;
  float core = smoothstep(0.55, 1.0, s);
  float fog = clamp((vDist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0) * uFogAmt;
  vec3 c = (vCol.rgb * s + vec3(core) * 0.8) * vCol.a * (1.0 - fog);
  frag = vec4(quant5(c, gl_FragCoord.xy, uDither), 1.0);
}`;

const FULL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uInvVP;
out vec3 vDir;
out vec2 vUV;
void main() {
  vec4 w = uInvVP * vec4(aPos, 1.0, 1.0);
  vDir = w.xyz / w.w;
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.99999, 1.0);
}`;

const SKY_FS = `#version 300 es
precision highp float;
in vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunCol, uCloudCol, uNebA, uNebB, uAurA, uAurB;
uniform float uSun, uStars, uTime, uCloud, uAurora, uNebula, uHorizonPow, uDither, uGrid;
out vec4 frag;
${SHADER_COMMON}
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 x) { vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n2(p); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), uHorizonPow));
  else col = mix(uHorizon, uGround, pow(clamp(-h * 2.5, 0.0, 1.0), 0.6));
  if (uNebula > 0.0) {
    float n = fbm3(d * 2.2 + vec3(3.1, 0.0, 1.7));
    float n2v = fbm3(d * 4.5 + vec3(9.0, 2.0, 5.0));
    col += mix(uNebA, uNebB, n2v) * smoothstep(0.42, 0.85, n) * uNebula;
  }
  if (uStars > 0.0) {
    vec3 g = floor(d * 220.0);
    float s = h3(g);
    float tw = 0.55 + 0.45 * sin(uTime * 2.5 + s * 80.0);
    float big = step(0.9993, s);
    col += vec3(0.8, 0.9, 1.0) * (step(0.997, s) * 0.6 + big) * tw * uStars * clamp(h * 3.0 + 0.8, 0.0, 1.0);
  }
  if (uAurora > 0.0 && h > 0.0) {
    vec2 p = d.xz / (h + 0.15);
    float band = fbm2(p * vec2(0.6, 1.8) + vec2(uTime * 0.05, 0.0));
    float ribbon = smoothstep(0.1, 0.0, abs(band - 0.5 + 0.12 * sin(p.x * 1.3 + uTime * 0.4)));
    float fade = smoothstep(0.03, 0.25, h) * smoothstep(0.9, 0.35, h);
    vec3 ac = mix(uAurA, uAurB, clamp(h * 2.5, 0.0, 1.0));
    col += ac * ribbon * fade * uAurora * (0.7 + 0.3 * sin(uTime * 1.7 + p.x));
  }
  if (uCloud > 0.0 && h > 0.015) {
    vec2 p = d.xz / h * 1.4 + vec2(uTime * 0.03, -uTime * 0.09);
    float c = fbm2(p);
    c = smoothstep(0.48, 0.78, c) * smoothstep(0.015, 0.2, h);
    col = mix(col, uCloudCol * (0.85 + 0.25 * smoothstep(0.5, 0.9, fbm2(p * 1.7 + 3.0))), c * uCloud);
  }
  if (uGrid > 0.0 && h < -0.01) {
    vec2 p = d.xz / -h * 6.0 + vec2(0.0, uTime * 6.0);
    vec2 gd = abs(fract(p) - 0.5);
    float line = smoothstep(0.46, 0.5, max(gd.x, gd.y));
    col += uNebB * line * uGrid * smoothstep(0.0, -0.25, h);
  }
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (smoothstep(0.9985, 0.9993, sd) * 2.2 + pow(sd, 60.0) * 0.45 + pow(sd, 6.0) * 0.18) * uSun;
  frag = vec4(quant5(col, gl_FragCoord.xy, uDither), 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform vec2 uSceneSize;
uniform float uScan, uSat, uVig, uAb, uFlashA, uTime, uGlitch, uBright, uAspect, uLines;
uniform vec3 uFlashCol;
uniform vec4 uShock[3];
out vec4 frag;
float hh(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  vec2 uv = vUV;
  // explosion shockwaves: a refracting ring that races outward
  for (int i = 0; i < 3; i++) {
    vec4 s = uShock[i];
    if (s.w <= 0.0) continue;
    vec2 d = uv - s.xy; d.x *= uAspect;
    float dist = length(d);
    float ring = smoothstep(0.07, 0.0, abs(dist - s.z));
    vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0);
    uv -= vec2(dir.x / uAspect, dir.y) * ring * s.w * 0.035;
  }
  if (uGlitch > 0.0) {
    float row = floor(uv.y * uSceneSize.y / 3.0);
    float r = hh(row * 1.7 + floor(uTime * 24.0) * 13.1);
    if (r < uGlitch * 0.35) uv.x += (hh(row + uTime) - 0.5) * 0.08 * uGlitch;
  }
  vec3 c;
  if (uAb > 0.0) {
    c.r = texture(uScene, uv + vec2(uAb, 0.0)).r;
    c.g = texture(uScene, uv).g;
    c.b = texture(uScene, uv - vec2(uAb, 0.0)).b;
  } else {
    c = texture(uScene, uv).rgb;
  }
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSat);
  c *= uBright;
  if (uScan > 0.0) {
    float y = uv.y * uLines;
    float s = abs(fract(y) - 0.5) * 2.0;
    c *= (1.0 - uScan * 0.42 * s * s) * (1.0 + uScan * 0.1);
  }
  vec2 q = uv - 0.5;
  c *= 1.0 - uVig * dot(q, q) * 1.3;
  c = mix(c, uFlashCol, uFlashA);
  frag = vec4(c, 1.0);
}`;

// -----------------------------------------------------------------------------
class Mesh {
  // data: Float32Array interleaved [x y z nx ny nz r g b a u v] per vertex
  constructor(data, opts = {}) {
    this.data = data;
    this.count = data.length / 12;
    this.vao = null; this.vbo = null; this.glv = -1;
    this.radius = opts.radius || Mesh.computeRadius(data);
    this.name = opts.name || '';
  }
  static computeRadius(d) {
    let r = 0;
    for (let i = 0; i < d.length; i += 12) { const l = d[i] * d[i] + d[i + 1] * d[i + 1] + d[i + 2] * d[i + 2]; if (l > r) r = l; }
    return Math.sqrt(r);
  }
}

class Texture {
  constructor(source, opts = {}) {
    this.source = source; // canvas or ImageData
    this.w = source.width; this.h = source.height;
    this.filter = opts.filter || 'nearest';
    this.wrap = opts.wrap || 'repeat';
    this.tex = null; this.glv = -1;
  }
}

class Camera {
  constructor() {
    this.pos = new V3(0, 0, 10); this.target = new V3(0, 0, 0); this.up = new V3(0, 1, 0);
    this.fov = 60 * DEG; this.near = 0.5; this.far = 1500; this.aspect = 1;
    this.view = m4(); this.proj = m4(); this.viewProj = m4(); this.rotOnlyView = m4(); this.invSky = m4();
    this.fwd = new V3(); this.right = new V3(); this.upv = new V3();
  }
  update() {
    m4lookAt(this.view, this.pos, this.target, this.up);
    m4persp(this.proj, this.fov, this.aspect, this.near, this.far);
    m4mul(this.viewProj, this.proj, this.view);
    this.rotOnlyView.set(this.view); this.rotOnlyView[12] = this.rotOnlyView[13] = this.rotOnlyView[14] = 0;
    const t = m4(); m4mul(t, this.proj, this.rotOnlyView); m4invert(this.invSky, t);
    this.right.set(this.view[0], this.view[4], this.view[8]);
    this.upv.set(this.view[1], this.view[5], this.view[9]);
    this.fwd.set(-this.view[2], -this.view[6], -this.view[10]);
  }
  // Project world point → normalized screen coords (0..1, y down). Returns false if behind.
  project(out, x, y, z) {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.01) { out.x = -9; out.y = -9; out.z = -1; return false; }
    out.x = (cx / cw) * 0.5 + 0.5; out.y = 0.5 - (cy / cw) * 0.5; out.z = cw;
    return true;
  }
}

const MAX_SPRITES = 4096;
const SPRITE_STRIDE = 14;
const MAX_TRAIL_VERTS = 24000;
const TRAIL_STRIDE = 8;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.version = 0;
    this.lost = false;
    this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('WebGL2 not available');
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); }, false);
    this.spriteData = new Float32Array(MAX_SPRITES * SPRITE_STRIDE);
    this.spriteAdd = { data: new Float32Array(MAX_SPRITES * SPRITE_STRIDE), n: 0 };
    this.spriteAlpha = { data: new Float32Array(MAX_SPRITES * SPRITE_STRIDE), n: 0 };
    this.trailData = new Float32Array(MAX_TRAIL_VERTS * TRAIL_STRIDE);
    this.trailN = 0;
    this.sceneW = 320; this.sceneH = 240; this.outW = 1; this.outH = 1;
    this.dither = 1;
    this.stats = { draws: 0, tris: 0 };
    this.env = null; this.atlas = null; this.whiteTex = null;
    this.init();
  }

  init() {
    const gl = this.gl;
    this.version++;
    this.progLit = this.program(LIT_VS, LIT_FS);
    this.progSprite = this.program(SPRITE_VS, SPRITE_FS);
    this.progTrail = this.program(TRAIL_VS, TRAIL_FS);
    this.progSky = this.program(FULL_VS, SKY_FS);
    this.progPost = this.program(FULL_VS, POST_FS);
    // fullscreen triangle
    this.fsVao = gl.createVertexArray();
    gl.bindVertexArray(this.fsVao);
    const fsb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // sprite VAO
    this.spVao = gl.createVertexArray();
    gl.bindVertexArray(this.spVao);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.spBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteData.byteLength, gl.DYNAMIC_DRAW);
    const S = SPRITE_STRIDE * 4;
    const attr = (loc, size, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off * 4); gl.vertexAttribDivisor(loc, 1); };
    attr(1, 3, 0); attr(2, 3, 3); attr(3, 4, 6); attr(4, 4, 10);
    // trail VAO
    this.trVao = gl.createVertexArray();
    gl.bindVertexArray(this.trVao);
    this.trBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.trailData.byteLength, gl.DYNAMIC_DRAW);
    const T = TRAIL_STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, T, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, T, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, T, 28);
    gl.bindVertexArray(null);
    this.fbo = null; this.fboW = 0; this.fboH = 0;
    this.whiteTex = new Texture(Object.assign(document.createElement('canvas'), { width: 2, height: 2 }));
    const wc = this.whiteTex.source.getContext('2d'); wc.fillStyle = '#fff'; wc.fillRect(0, 0, 2, 2);
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('Shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('Link: ' + gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  // ---- resources ----------------------------------------------------------
  bindMesh(mesh) {
    const gl = this.gl;
    if (mesh.glv !== this.version) {
      mesh.vao = gl.createVertexArray();
      gl.bindVertexArray(mesh.vao);
      mesh.vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
      const S = 48;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 40);
      mesh.glv = this.version;
    } else {
      gl.bindVertexArray(mesh.vao);
    }
  }
  freeMesh(mesh) {
    if (!mesh || mesh.glv !== this.version) return;
    const gl = this.gl;
    gl.deleteBuffer(mesh.vbo); gl.deleteVertexArray(mesh.vao);
    mesh.glv = -1; mesh.vao = mesh.vbo = null;
  }
  bindTex(t, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    if (t.glv !== this.version) {
      t.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.source);
      const f = t.filter === 'linear' ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      const w = t.wrap === 'clamp' ? gl.CLAMP_TO_EDGE : gl.REPEAT;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      t.glv = this.version;
    } else {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
    }
  }
  updateTex(t) { // re-upload after the source canvas changed
    if (t.glv !== this.version) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.source);
  }

  ensureFbo(w, h) {
    const gl = this.gl;
    if (this.fbo && this.fboW === w && this.fboH === h && this.fboV === this.version) return;
    if (this.fbo && this.fboV === this.version) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.fboTex); gl.deleteRenderbuffer(this.fboDepth); }
    this.fboTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fboDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, this.fboDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.fboDepth);
    this.fboW = w; this.fboH = h; this.fboV = this.version;
  }

  // ---- sizing ---------------------------------------------------------------
  // renderLines: internal resolution along the short side (0 = native).
  // quality: extra scale applied in native mode by the dynamic-resolution governor.
  resize(cssW, cssH, dpr, renderLines, quality = 1) {
    const ow = Math.max(1, Math.round(cssW * dpr)), oh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== ow || this.canvas.height !== oh) { this.canvas.width = ow; this.canvas.height = oh; }
    this.outW = ow; this.outH = oh;
    const short = Math.min(ow, oh);
    const lines = renderLines ? Math.min(renderLines, short) : short * quality;
    const scale = lines / short;
    this.sceneW = Math.max(16, Math.round(ow * scale));
    this.sceneH = Math.max(16, Math.round(oh * scale));
  }

  // ---- frame ----------------------------------------------------------------
  begin(cam, env) {
    const gl = this.gl;
    this.cam = cam; this.envp = env;
    this.stats.draws = 0; this.stats.tris = 0;
    this.ensureFbo(this.sceneW, this.sceneH);
    // Never leave the scene texture bound while rendering into it (feedback loop).
    this.bindTex(this.whiteTex, 1); this.bindTex(this.whiteTex, 0); this.lastTex = null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.sceneW, this.sceneH);
    cam.aspect = this.sceneW / this.sceneH;
    cam.update();
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
    this.spriteAdd.n = 0; this.spriteAlpha.n = 0; this.trailN = 0;
    this.litReady = false;
  }

  drawSky(s, time) {
    const gl = this.gl, P = this.progSky, u = P.u;
    gl.useProgram(P.p);
    gl.depthMask(false); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.uInvVP, false, this.cam.invSky);
    gl.uniform3fv(u.uZenith, s.zenith); gl.uniform3fv(u.uHorizon, s.horizon); gl.uniform3fv(u.uGround, s.ground);
    gl.uniform3fv(u.uSunDir, s.sunDir); gl.uniform3fv(u.uSunCol, s.sunCol); gl.uniform3fv(u.uCloudCol, s.cloudCol);
    gl.uniform3fv(u.uNebA, s.nebA); gl.uniform3fv(u.uNebB, s.nebB); gl.uniform3fv(u.uAurA, s.aurA); gl.uniform3fv(u.uAurB, s.aurB);
    gl.uniform1f(u.uSun, s.sun); gl.uniform1f(u.uStars, s.stars); gl.uniform1f(u.uTime, time); gl.uniform1f(u.uCloud, s.cloud);
    gl.uniform1f(u.uAurora, s.aurora); gl.uniform1f(u.uNebula, s.nebula); gl.uniform1f(u.uHorizonPow, s.horizonPow || 0.6);
    gl.uniform1f(u.uGrid, s.grid || 0);
    gl.uniform1f(u.uDither, this.dither);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.depthMask(true);
    this.litReady = false;
  }

  useLit() {
    if (this.litReady) return;
    const gl = this.gl, P = this.progLit, u = P.u, e = this.envp, c = this.cam;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(u.uProj, false, c.proj);
    gl.uniformMatrix4fv(u.uView, false, c.view);
    gl.uniform3fv(u.uLightDir, e.lightDir); gl.uniform3fv(u.uLightCol, e.lightCol); gl.uniform3fv(u.uAmbient, e.ambient);
    gl.uniform3fv(u.uFogCol, e.fog); gl.uniform1f(u.uFogNear, e.fogNear); gl.uniform1f(u.uFogFar, e.fogFar);
    gl.uniform1f(u.uDither, this.dither);
    gl.uniform1i(u.uTex, 0); gl.uniform1i(u.uEnv, 1);
    if (this.env) this.bindTex(this.env, 1);
    this.litReady = true;
    this.lastTex = null;
  }

  // mat fields: tint[4], emis[3], flash, tex(Texture), texMix, uvScale[2], scroll[2], chrome, fog(0/1), cull(bool), alphaCut
  draw(mesh, model, mat = DEFAULT_MAT) {
    if (!mesh || mesh.count === 0) return;
    const gl = this.gl;
    this.useLit();
    const u = this.progLit.u;
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform4fv(u.uTint, mat.tint || WHITE4);
    gl.uniform3fv(u.uEmissive, mat.emis || ZERO3);
    gl.uniform1f(u.uFlash, mat.flash || 0);
    gl.uniform1f(u.uChrome, mat.chrome || 0);
    gl.uniform1f(u.uFogAmt, mat.fog === undefined ? 1 : mat.fog);
    gl.uniform1f(u.uAlphaCut, mat.alphaCut || 0);
    if (mat.tex) {
      if (this.lastTex !== mat.tex) { this.bindTex(mat.tex, 0); this.lastTex = mat.tex; }
      gl.uniform1f(u.uUseTex, 1);
      gl.uniform2f(u.uTexSize, mat.tex.w, mat.tex.h);
      gl.uniform1f(u.uTexMix, mat.texMix === undefined ? 1 : mat.texMix);
      const sc = mat.uvScale || ONE2, sr = mat.scroll || ZERO2;
      gl.uniform2f(u.uUVScale, sc[0], sc[1]);
      gl.uniform2f(u.uTexScroll, sr[0], sr[1]);
    } else {
      gl.uniform1f(u.uUseTex, 0);
      gl.uniform2f(u.uUVScale, 1, 1);
    }
    if (mat.cull === false) gl.disable(gl.CULL_FACE);
    if (mat.blend) {
      gl.enable(gl.BLEND);
      if (mat.blend === 'add') gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    if (mat.depthTest === false) gl.disable(gl.DEPTH_TEST);
    this.bindMesh(mesh);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    this.stats.draws++; this.stats.tris += mesh.count / 3;
    if (mat.cull === false) gl.enable(gl.CULL_FACE);
    if (mat.blend) { gl.disable(gl.BLEND); gl.depthMask(true); }
    if (mat.depthTest === false) gl.enable(gl.DEPTH_TEST);
  }

  // ---- sprites --------------------------------------------------------------
  sprite(x, y, z, w, h, rot, frame, r, g, b, a, additive = true) {
    const B = additive ? this.spriteAdd : this.spriteAlpha;
    if (B.n >= MAX_SPRITES) return;
    const d = B.data, o = B.n * SPRITE_STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = 0; d[o + 4] = 0; d[o + 5] = 0;
    d[o + 6] = w; d[o + 7] = h; d[o + 8] = rot; d[o + 9] = frame;
    d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = a;
    B.n++;
  }
  // Velocity-aligned streak: (ax,ay,az) is the half-length vector in world space.
  streak(x, y, z, ax, ay, az, w, frame, r, g, b, a) {
    const B = this.spriteAdd;
    if (B.n >= MAX_SPRITES) return;
    const d = B.data, o = B.n * SPRITE_STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = ax; d[o + 4] = ay; d[o + 5] = az;
    d[o + 6] = w; d[o + 7] = w; d[o + 8] = 0; d[o + 9] = frame;
    d[o + 10] = r; d[o + 11] = g; d[o + 12] = b; d[o + 13] = a;
    B.n++;
  }
  flushSprites() {
    const gl = this.gl, P = this.progSprite, u = P.u, e = this.envp;
    if (!this.atlas) return;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(u.uProj, false, this.cam.proj);
    gl.uniformMatrix4fv(u.uView, false, this.cam.view);
    gl.uniform2f(u.uAtlas, 4, 4);
    gl.uniform3fv(u.uFogCol, e.fog); gl.uniform1f(u.uFogNear, e.fogNear); gl.uniform1f(u.uFogFar, e.fogFar); gl.uniform1f(u.uFogAmt, 1);
    gl.uniform1f(u.uDither, this.dither);
    gl.uniform1i(u.uTex, 0);
    this.bindTex(this.atlas, 0); this.lastTex = null;
    gl.bindVertexArray(this.spVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spBuf);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    if (this.spriteAlpha.n) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1f(u.uAdditive, 0);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteAlpha.data, 0, this.spriteAlpha.n * SPRITE_STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.spriteAlpha.n);
      this.stats.draws++;
    }
    if (this.spriteAdd.n) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(u.uAdditive, 1);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.spriteAdd.data, 0, this.spriteAdd.n * SPRITE_STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.spriteAdd.n);
      this.stats.draws++;
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    this.spriteAdd.n = 0; this.spriteAlpha.n = 0;
    this.litReady = false;
  }

  // ---- ribbons --------------------------------------------------------------
  // pts: array of V3-like, widths: fn(i) or number, color fn → pushes camera-facing strip
  ribbon(pts, n, width, r, g, b, aHead, aTail) {
    if (n < 2) return;
    const need = (n - 1) * 6;
    if (this.trailN + need > MAX_TRAIL_VERTS) return;
    const cam = this.cam.pos, d = this.trailData;
    let o = this.trailN * TRAIL_STRIDE;
    const sides = _ribbonSides;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[i < n - 1 ? i + 1 : i], pp = pts[i > 0 ? i - 1 : i];
      let tx = q.x - pp.x, ty = q.y - pp.y, tz = q.z - pp.z;
      const vx = p.x - cam.x, vy = p.y - cam.y, vz = p.z - cam.z;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const l = Math.hypot(sx, sy, sz) || 1;
      const t = i / (n - 1);
      const w = (typeof width === 'number' ? width : width(t)) / l;
      sides[i * 3] = sx * w; sides[i * 3 + 1] = sy * w; sides[i * 3 + 2] = sz * w;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], bq = pts[i + 1];
      const ta = i / (n - 1), tb = (i + 1) / (n - 1);
      const alA = lerp(aHead, aTail, ta), alB = lerp(aHead, aTail, tb);
      const ax = sides[i * 3], ay = sides[i * 3 + 1], az = sides[i * 3 + 2];
      const bx = sides[i * 3 + 3], by = sides[i * 3 + 4], bz = sides[i * 3 + 5];
      // two triangles: (a-, a+, b+) (a-, b+, b-)
      o = pushTV(d, o, a.x - ax, a.y - ay, a.z - az, r, g, b, alA, -1);
      o = pushTV(d, o, a.x + ax, a.y + ay, a.z + az, r, g, b, alA, 1);
      o = pushTV(d, o, bq.x + bx, bq.y + by, bq.z + bz, r, g, b, alB, 1);
      o = pushTV(d, o, a.x - ax, a.y - ay, a.z - az, r, g, b, alA, -1);
      o = pushTV(d, o, bq.x + bx, bq.y + by, bq.z + bz, r, g, b, alB, 1);
      o = pushTV(d, o, bq.x - bx, bq.y - by, bq.z - bz, r, g, b, alB, -1);
    }
    this.trailN += need;
  }
  flushTrails() {
    if (!this.trailN) return;
    const gl = this.gl, P = this.progTrail, u = P.u, e = this.envp;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(u.uProj, false, this.cam.proj);
    gl.uniformMatrix4fv(u.uView, false, this.cam.view);
    gl.uniform1f(u.uFogNear, e.fogNear); gl.uniform1f(u.uFogFar, e.fogFar); gl.uniform1f(u.uFogAmt, 1);
    gl.uniform1f(u.uDither, this.dither);
    gl.bindVertexArray(this.trVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.trailData, 0, this.trailN * TRAIL_STRIDE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, this.trailN);
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
    this.stats.draws++;
    this.trailN = 0;
    this.litReady = false;
  }

  // Switch to a second camera for screen-anchored 3D (title logo etc.)
  setOverlayCamera(cam, env) {
    const gl = this.gl;
    if (env) this.envp = env;
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    cam.aspect = this.sceneW / this.sceneH;
    cam.update();
    this.cam = cam;
    this.litReady = false;
  }

  // ---- post -----------------------------------------------------------------
  end(post, time) {
    const gl = this.gl, P = this.progPost, u = P.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(P.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.fboTex);
    gl.uniform1i(u.uScene, 0);
    gl.uniform2f(u.uSceneSize, this.sceneW, this.sceneH);
    gl.uniform1f(u.uScan, post.scan); gl.uniform1f(u.uSat, post.sat); gl.uniform1f(u.uVig, post.vig);
    gl.uniform1f(u.uAb, post.ab); gl.uniform1f(u.uFlashA, post.flashA); gl.uniform3fv(u.uFlashCol, post.flashCol);
    gl.uniform1f(u.uTime, time); gl.uniform1f(u.uGlitch, post.glitch); gl.uniform1f(u.uBright, post.bright);
    gl.uniform1f(u.uAspect, this.sceneW / this.sceneH);
    // CRT scanlines follow the scene rows at retro resolutions, and a ~240-line
    // pitch (whole device pixels) when rendering at HD.
    let lines = this.sceneH;
    if (Math.min(this.sceneW, this.sceneH) > 540) lines = this.outH / Math.max(2, Math.round(Math.min(this.outW, this.outH) / 240));
    gl.uniform1f(u.uLines, lines);
    gl.uniform4fv(u.uShock, post.shocks || NO_SHOCKS);
    gl.uniformMatrix4fv(u.uInvVP, false, IDENT4);
    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    this.lastTex = null;
  }
}

const _ribbonSides = new Float32Array(3 * 512);
function pushTV(d, o, x, y, z, r, g, b, a, side) {
  d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = r; d[o + 4] = g; d[o + 5] = b; d[o + 6] = a; d[o + 7] = side;
  return o + 8;
}
const WHITE4 = new Float32Array([1, 1, 1, 1]);
const ZERO3 = new Float32Array([0, 0, 0]);
const ONE2 = [1, 1];
const ZERO2 = [0, 0];
const IDENT4 = m4();
const NO_SHOCKS = new Float32Array(12);
const DEFAULT_MAT = {};
