#!/usr/bin/env node
// Bundles SYNTHWING 64 (public/game/synthwing) into one self-contained HTML file.
//   node scripts/build-synthwing.mjs            -> dist/synthwing64.html (standalone page)
//   node scripts/build-synthwing.mjs --artifact -> dist/synthwing64-artifact.html (body-only, for hosts that supply the <head>)
// The game is plain classic scripts sharing top-level bindings, so bundling is concatenation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameDir = path.join(root, 'public/game/synthwing');
const outDir = path.join(root, 'dist');
const artifact = process.argv.includes('--artifact');

const html = fs.readFileSync(path.join(gameDir, 'index.html'), 'utf8');
const block = /<!-- build:scripts -->([\s\S]*?)<!-- \/build:scripts -->/.exec(html);
if (!block) throw new Error('build:scripts block not found in index.html');
const files = [...block[1].matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
let js = "'use strict';\n";
for (const f of files) {
  const src = fs.readFileSync(path.join(gameDir, f), 'utf8').replace(/^'use strict';\s*/m, '');
  js += `\n// ---- ${f} ----\n${src}\n`;
}
if (js.includes('</script')) throw new Error('inline script would terminate early');
// (use a replacer function: the game source contains '$' sequences that String.replace would interpret)
const inlined = html.replace(block[0], () => `<script>\n${js}</script>`);

let out;
if (!artifact) {
  // standalone: drop links to sibling files that won't exist next to a single file
  out = inlined.replace(/\s*<link rel="(manifest|apple-touch-icon|icon)"[^>]*>/g, '').replace(/\s*<script>navigator\.serviceWorker[\s\S]*?<\/script>/, '');
} else {
  const head = /<head>([\s\S]*?)<\/head>/.exec(inlined)[1]
    .replace(/<meta charset[^>]*>\s*/, '')
    .replace(/\s*<link rel="(manifest|apple-touch-icon|icon)"[^>]*>/g, '');
  const body = /<body>([\s\S]*?)<\/body>/.exec(inlined)[1].replace(/\s*<script>navigator\.serviceWorker[\s\S]*?<\/script>/, '');
  out = head.trim() + '\n' + body.trim() + '\n';
}
fs.mkdirSync(outDir, { recursive: true });
const name = artifact ? 'synthwing64-artifact.html' : 'synthwing64.html';
fs.writeFileSync(path.join(outDir, name), out);
console.log(`wrote dist/${name} (${(out.length / 1024).toFixed(1)} KB, ${files.length} scripts)`);
