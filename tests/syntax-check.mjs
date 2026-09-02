/**
 * Parses every shipped module. `node --check` catches syntax errors without
 * evaluating the file, which matters because most of `src/` expects a DOM.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.m?js$/.test(entry)) files.push(path);
  }
  return files;
}

const targets = [
  ...walk(join(root, "src")),
  ...walk(join(root, "tests")),
  join(root, "server.mjs")
].sort();

let failures = 0;
for (const file of targets) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failures += 1;
    console.error(`SYNTAX FAIL ${relative(root, file)}`);
    console.error(String(error.stderr ?? error.message).trim());
  }
}

if (failures) {
  console.error(`\n${failures} file(s) failed to parse.`);
  process.exit(1);
}

console.log(`SYNTAX_PASS files=${targets.length}`);
