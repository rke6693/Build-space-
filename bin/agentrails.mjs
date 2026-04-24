#!/usr/bin/env node
// agentrails — keep AGENTS.md, CLAUDE.md, GEMINI.md, .cursorrules, and
// .github/copilot-instructions.md in sync. Lint AGENTS.md for the rules every
// coding agent should follow. Zero dependencies, single file.
//
// Usage:
//   npx agentrails sync           # mirror AGENTS.md → wrapper files
//   npx agentrails sync --link    # use symlinks where possible
//   npx agentrails check          # lint AGENTS.md, exit 1 on serious issues
//   npx agentrails compose rules/ # build AGENTS.md from rules/*.md
//   npx agentrails list           # list rules in ./rules
//
// MIT License.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AGENTS = path.join(ROOT, "AGENTS.md");

const WRAPPERS = [
  { file: "CLAUDE.md", style: "markdown" },
  { file: "GEMINI.md", style: "markdown" },
  { file: ".cursorrules", style: "plain" },
  { file: ".github/copilot-instructions.md", style: "markdown" },
];

const REQUIRED_KEYWORDS = [
  { name: "verification loop", pattern: /verif|typecheck|run.{0,20}test/i },
  { name: "scope discipline", pattern: /\bscope\b|\bexactly\b.{0,40}asked/i },
  { name: "ambiguity / assumption", pattern: /assum|ambigu|don'?t.{0,20}assume/i },
  { name: "stop conditions", pattern: /\bstop\b|\bblock(ed|er)\b|\bask\b/i },
  { name: "tradeoffs", pattern: /tradeoff|alternative/i },
];

const FORBIDDEN_PHRASES = [
  /this should work/i,
  /\bsimplified the logic\b/i,
  /\bfor robustness\b/i,
  /\bto be safe\b.{0,30}\balso\b/i,
  /\bnoticed and fixed\b/i,
];

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function header(file) {
  return [
    `<!-- managed by agentrails: do not edit. source of truth is AGENTS.md. -->`,
    `<!-- run \`npx agentrails sync\` after editing AGENTS.md. -->`,
    "",
  ].join("\n");
}

function plainHeader() {
  return [
    `# managed by agentrails: do not edit. source of truth is AGENTS.md.`,
    `# run \`npx agentrails sync\` after editing AGENTS.md.`,
    "",
  ].join("\n");
}

function cmdSync(args) {
  const useLinks = args.includes("--link");
  const agents = read(AGENTS);
  if (!agents) {
    console.error("error: AGENTS.md not found in", ROOT);
    process.exit(2);
  }

  let wrote = 0;
  for (const { file, style } of WRAPPERS) {
    const target = path.join(ROOT, file);
    ensureDir(target);
    if (useLinks && process.platform !== "win32") {
      try {
        if (fs.existsSync(target)) fs.rmSync(target);
        const rel = path.relative(path.dirname(target), AGENTS);
        fs.symlinkSync(rel, target);
        console.log(`linked ${file} -> ${rel}`);
        wrote++;
        continue;
      } catch (e) {
        console.warn(`symlink failed for ${file} (${e.message}); falling back to copy`);
      }
    }
    const head = style === "plain" ? plainHeader() : header(file);
    fs.writeFileSync(target, head + agents);
    console.log(`wrote ${file}`);
    wrote++;
  }
  console.log(`\nsynced ${wrote} wrapper file(s) from AGENTS.md`);
}

function cmdCheck() {
  const agents = read(AGENTS);
  if (!agents) {
    console.error("error: AGENTS.md not found in", ROOT);
    process.exit(2);
  }

  const lines = agents.split("\n");
  const findings = [];
  let score = 100;

  if (lines.length > 250) {
    findings.push(`! AGENTS.md is ${lines.length} lines — over the 200-line target. Long files bury signal.`);
    score -= 10;
  }

  for (const { name, pattern } of REQUIRED_KEYWORDS) {
    if (!pattern.test(agents)) {
      findings.push(`x missing: ${name}`);
      score -= 12;
    } else {
      findings.push(`+ present: ${name}`);
    }
  }

  for (const phrase of FORBIDDEN_PHRASES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!phrase.test(line)) continue;
      // skip table rows (`| "phrase" | …`), quoted/code examples, and lines
      // inside the "forbidden phrases" section of AGENTS.md itself.
      if (/^\s*\|/.test(line)) continue;
      if (/^\s*[>`]/.test(line)) continue;
      const before = lines.slice(Math.max(0, i - 8), i).join("\n");
      if (/forbidden|smell|anti-?pattern|before\b/i.test(before)) continue;
      findings.push(`! line ${i + 1}: forbidden phrase: "${phrase.source}"`);
      score -= 8;
      break;
    }
  }

  if (!/project[- ]specific|project commands|getting started/i.test(agents)) {
    findings.push(`! no project-specific section — add commands and gotchas`);
    score -= 6;
  }

  console.log(findings.join("\n"));
  console.log(`\nagentrails score: ${Math.max(0, score)}/100`);
  if (score < 60) {
    console.log("→ AGENTS.md needs work. Run `npx agentrails compose rules/` to rebuild.");
    process.exit(1);
  }
}

function cmdCompose(args) {
  const dir = args[0] || "rules";
  const rulesDir = path.join(ROOT, dir);
  if (!fs.existsSync(rulesDir)) {
    console.error(`error: ${dir}/ not found`);
    process.exit(2);
  }
  const files = fs
    .readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    console.error(`error: no .md files in ${dir}/`);
    process.exit(2);
  }

  const out = [
    "# AGENTS.md",
    "",
    "> Generated by `agentrails compose`. Source rules in `" + dir + "/`.",
    "> Edit the files in `" + dir + "/` and re-run `npx agentrails compose " + dir + "`.",
    "",
    "---",
    "",
  ];
  for (const f of files) {
    const body = fs.readFileSync(path.join(rulesDir, f), "utf8").trim();
    out.push(body, "", "---", "");
  }
  fs.writeFileSync(AGENTS, out.join("\n"));
  console.log(`composed AGENTS.md from ${files.length} rule(s) in ${dir}/`);
}

function cmdList() {
  const dir = path.join(ROOT, "rules");
  if (!fs.existsSync(dir)) {
    console.error("error: rules/ not found");
    process.exit(2);
  }
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const body = fs.readFileSync(path.join(dir, f), "utf8");
    const title = (body.match(/^#\s+(.+)$/m) || [, f])[1];
    const tags = (body.match(/\*\*Tags:\*\*\s*(.+)$/m) || [, ""])[1].trim();
    console.log(`${f.padEnd(34)} ${title}`);
    if (tags) console.log(" ".repeat(34) + `tags: ${tags}`);
  }
}

function help() {
  console.log(`agentrails — one AGENTS.md, every coding agent.

usage:
  agentrails sync [--link]    mirror AGENTS.md to CLAUDE.md, GEMINI.md,
                              .cursorrules, .github/copilot-instructions.md
  agentrails check            lint AGENTS.md for missing principles
  agentrails compose [dir]    build AGENTS.md from dir/*.md (default: rules/)
  agentrails list             list rules in ./rules

repo: https://github.com/rke6693/build-space-
license: MIT
`);
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "sync": cmdSync(args); break;
  case "check": cmdCheck(); break;
  case "compose": cmdCompose(args); break;
  case "list": cmdList(); break;
  case undefined:
  case "-h":
  case "--help":
  case "help": help(); break;
  default:
    console.error(`unknown command: ${cmd}`);
    help();
    process.exit(2);
}
