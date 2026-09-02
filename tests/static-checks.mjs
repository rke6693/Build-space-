/**
 * Whole-project assertions that no unit test would catch: markup contracts
 * between `index.html` and the modules that query it, the token-only colour
 * rule for CSS, image accessibility attributes, and the integrity of the
 * three generated art plates.
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");

const html = read("index.html");
const css = read("styles/app.css");
const tokens = read("styles/tokens.css");
const constants = read("src/core/constants.js");
const simulation = read("src/game/simulation.js");
const main = read("src/main.js");
const dom = read("src/ui/dom.js");

// ---------------------------------------------------------------- tokens

assert.match(css.split("\n")[0], /^\/\* Hallmark · macrostructure: Workbench/);
assert.match(tokens, /--color-accent-ink:/);
assert.match(tokens, /--font-display:/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, "CSS contains an untokenized hex colour");
assert.doesNotMatch(css, /\brgba?\(|\bhsla?\(/i, "CSS contains a non-OKLCH colour function");
assert.doesNotMatch(css, /transition-all|transition:\s*all/i);
assert.doesNotMatch(css, /overflow-x:\s*hidden/i);
assert.doesNotMatch(css, /width:\s*100vw/i);
assert.doesNotMatch(css, /font-style:\s*italic/i);
assert.match(css, /url\("\.\.\/assets\/art\//, "CSS art URLs must be relative to styles/");

// The game must make no third-party request: fonts are self-hosted.
for (const [label, source] of [["index.html", html], ["styles/app.css", css], ["styles/tokens.css", tokens]]) {
  assert.doesNotMatch(source, /https?:\/\/(?!www\.w3\.org)/, `${label} reaches for an external origin`);
}
for (const file of [
  "assets/fonts/bricolage-grotesque-latin.woff2",
  "assets/fonts/plus-jakarta-sans-latin.woff2",
  "assets/fonts/OFL-BricolageGrotesque.txt",
  "assets/fonts/OFL-PlusJakartaSans.txt"
]) {
  assert.ok(statSync(join(root, file)).size > 0, `${file} is missing`);
}
assert.match(css, /@font-face/, "Self-hosted faces must be declared");
assert.match(css, /font-display:\s*swap/, "Text must render before the font arrives");

// ------------------------------------------------------------ markup contract

const requiredIds = [...dom.matchAll(/"([a-zA-Z][\w]*)"/g)]
  .map((match) => match[1])
  .filter((id) => id !== "canvas" && id !== "gameCanvas");

for (const id of requiredIds) {
  assert.ok(
    html.includes(`id="${id}"`),
    `index.html is missing id="${id}", which src/ui/dom.js requires`
  );
}

assert.match(html, /<canvas[^>]+id="gameCanvas"[^>]+tabindex="-1"/);
assert.match(html, /id="touchControls"/);
assert.match(html, /id="storyDialog"/);
assert.match(html, /id="fieldDialog"/);
assert.match(html, /id="settingsDialog"/);
assert.match(html, /id="soundButton"[^>]+aria-pressed="false"/);
assert.match(html, /<script type="module" src="src\/main\.js">/);
assert.doesNotMatch(html, /<script(?![^>]*type="module")[^>]*\bsrc=/, "Only module scripts may be loaded");

// Every dialog needs an accessible name.
for (const tag of html.match(/<dialog\b[^>]*>/g) ?? []) {
  assert.match(tag, /aria-labelledby="[^"]+"/, `Dialog is missing an accessible name: ${tag}`);
}

// ------------------------------------------------------------------ modules

assert.match(constants, /export const STEP/, "The fixed timestep must be a shared constant");
assert.match(simulation, /export class Simulation/);

/** Comments legitimately mention these words; only real usage is a problem. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
for (const file of ["src/game/simulation.js", "src/game/level.js", "src/game/save.js", "src/core/math.js"]) {
  assert.doesNotMatch(
    stripComments(read(file)),
    /\b(?:document|window|navigator|localStorage)\s*[.[]|requestAnimationFrame\s*\(/,
    `${file} must stay free of browser globals so it can run under Node`
  );
}
assert.match(main, /window\.__SQUISHYMON__/);
assert.match(main, /prefers-reduced-motion/);
assert.match(main, /visibilitychange/, "The run must pause when the tab is hidden");
assert.match(read("src/render/effects.js"), /reducedMotion/);
assert.match(read("src/game/input.js"), /pollGamepad/);

// ------------------------------------------------------------------- images

const ART = [
  {
    file: "assets/art/lumenfen-marsh.png",
    sha256: "cbf86f913a661b4fd7c3b68029928f497491a2bd3a27d5e7aac9525c5a6470ba",
    width: 1672,
    height: 941
  },
  {
    file: "assets/art/gloob.png",
    sha256: "7872fe2193f018ff9deb23b49f064325acf8d1e2c16acbf6f3fca2c69791c3f9",
    width: 1236,
    height: 1272
  },
  {
    file: "assets/art/the-press.png",
    sha256: "c7b0c7748d650fa8b1c98ab9eb84512a20403af778a498eba0b3fbcd73c97709",
    width: 1536,
    height: 1536
  }
];

for (const entry of ART) {
  const path = join(root, entry.file);
  assert.ok(statSync(path).size > 100_000, `${entry.file} is unexpectedly small`);
  const png = readFileSync(path);
  assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a", `${entry.file} is not a PNG`);
  assert.equal(png.readUInt32BE(16), entry.width, `${entry.file} width changed`);
  assert.equal(png.readUInt32BE(20), entry.height, `${entry.file} height changed`);
  assert.equal(
    createHash("sha256").update(png).digest("hex"),
    entry.sha256,
    `${entry.file} does not match the checksum recorded in docs/ASSET_PROVENANCE.md`
  );
}

const provenance = read("docs/ASSET_PROVENANCE.md");
for (const entry of ART) {
  assert.ok(provenance.includes(entry.sha256), `${entry.file} checksum is missing from the provenance doc`);
}

const imgTags = html.match(/<img\b[^>]*>/g) ?? [];
assert.ok(imgTags.length >= 3, "Expected project art in the document");
for (const tag of imgTags) {
  assert.match(tag, /\balt="[^"]*"/, `Image is missing alt text: ${tag}`);
  assert.match(tag, /\bwidth="\d+"/, `Image is missing intrinsic width: ${tag}`);
  assert.match(tag, /\bheight="\d+"/, `Image is missing intrinsic height: ${tag}`);
}

console.log("STATIC_VALIDATION_PASS");
console.log(`MARKUP_IDS_CHECKED=${requiredIds.length}`);
console.log(`ART_ASSETS=${ART.length}`);
