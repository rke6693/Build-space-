// Builds the single-file game (repo scripts/build-synthwing.mjs) and stages it
// as the app's web root: www/index.html. Everything ships inside the app
// bundle, so the game runs fully offline.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
execFileSync(process.execPath, [path.join(repo, 'scripts/build-synthwing.mjs')], { stdio: 'inherit' });
const www = path.resolve(here, '../www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(repo, 'dist/synthwing64.html'), path.join(www, 'index.html'));
console.log('staged www/index.html (' + Math.round(fs.statSync(path.join(www, 'index.html')).size / 1024) + ' KB)');
