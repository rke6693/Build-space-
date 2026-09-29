// Folds dist-embed (vite.embed.config.ts) into single HTML files:
//   dist-embed/singularity.html  complete standalone document (open from disk or any host)
//   dist-embed/artifact.html     page body only, for hosts that wrap the page in their own skeleton
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-embed';
const html = readFileSync(join(dir, 'index.html'), 'utf8');

const scriptTag = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/);
const cssTag = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptTag || !cssTag) throw new Error('could not find the bundle tags in dist-embed/index.html');
const js = readFileSync(join(dir, scriptTag[1]), 'utf8')
  // an inline script ends at the first "</script": escape it (and HTML comment openers) in the code
  .replace(/<\/script/gi, '<\\/script')
  .replace(/<!--/g, '<\\!--');
const css = readFileSync(join(dir, cssTag[1]), 'utf8');

const title = (html.match(/<title>[^<]*<\/title>/) ?? ['<title>Project Singularity</title>'])[0].replace(/<title>[^<]*/, '<title>Project Singularity');
const script = `<script type="module">\n${js}\n</script>`;
const style = `<style>\n${css}\n</style>`;
const body = '<div id="root"></div>\n<noscript>Project Singularity needs JavaScript and WebGL 2.</noscript>';

// standalone: keep the head metadata that does not point at files we no longer ship
const head = html
  .slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(scriptTag[0], '')
  .replace(cssTag[0], '')
  .replace(/\s*<link rel="(apple-touch-icon|manifest)"[^>]*>/g, '')
  .replace(/<title>[^<]*<\/title>/, title);
const standalone = `<!doctype html>\n<html lang="en">\n<head>${head}${style}\n</head>\n<body>\n${body}\n${script}\n</body>\n</html>\n`;
writeFileSync(join(dir, 'singularity.html'), standalone);

// artifact: title first (hosts scan the top for it), then styles, markup and the app
writeFileSync(join(dir, 'artifact.html'), `${title}\n${style}\n${body}\n${script}\n`);

// self-check: hosts scan the first 8 KB for the title, wrap the page in their own skeleton,
// allow nothing external but a few CDNs, and cap pages at 16 MB
const artifact = readFileSync(join(dir, 'artifact.html'), 'utf8');
const problems = [];
if (!/<title>[^<]+<\/title>/.test(artifact.slice(0, 8192))) problems.push('no <title> in the first 8 KB');
if (/<(!doctype|html|head|body)[\s>]/i.test(artifact.replace(/<script[\s\S]*<\/script>/, ''))) problems.push('artifact contains document skeleton tags');
if (/<(script|link|img)[^>]+(src|href)="(?!data:)[^"]+"/i.test(artifact.replace(/<script type="module">[\s\S]*<\/script>/, ''))) problems.push('external file reference outside the bundle');
if (Buffer.byteLength(artifact) > 16 * 1024 * 1024) problems.push('larger than 16 MB');
if (problems.length) throw new Error(`single-file check failed: ${problems.join('; ')}`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`singularity.html ${kb(standalone)}, artifact.html ${kb(title + style + body + script)}`);
