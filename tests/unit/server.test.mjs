import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRequestPath } from "../../server.mjs";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const allowed = (path) => resolveRequestPath(path, root);

describe("dev server path policy", () => {
  it("serves the entry document from the root path", () => {
    assert.equal(allowed("/"), resolve(root, "index.html"));
    assert.equal(allowed("/index.html"), resolve(root, "index.html"));
  });

  it("serves the shipped directories", () => {
    assert.equal(allowed("/src/main.js"), resolve(root, "src/main.js"));
    assert.equal(allowed("/styles/app.css"), resolve(root, "styles/app.css"));
    assert.equal(allowed("/assets/art/gloob.png"), resolve(root, "assets/art/gloob.png"));
    assert.equal(allowed("/src/game/simulation.js"), resolve(root, "src/game/simulation.js"));
  });

  it("refuses traversal, encoded or not", () => {
    for (const path of [
      "/../package.json",
      "/src/../../package.json",
      "/%2e%2e/package.json",
      "/src/%2e%2e%2f%2e%2e%2fpackage.json",
      "/....//package.json"
    ]) {
      assert.equal(allowed(path), null, `${path} should be refused`);
    }
  });

  it("refuses project files that are not part of the game", () => {
    for (const path of ["/package.json", "/server.mjs", "/README.md", "/tests/static-checks.mjs", "/docs/ARCHITECTURE.md"]) {
      assert.equal(allowed(path), null, `${path} should be refused`);
    }
  });

  it("refuses dotfiles anywhere in the path", () => {
    assert.equal(allowed("/.git/config"), null);
    assert.equal(allowed("/src/.env"), null);
    assert.equal(allowed("/assets/.hidden/art.png"), null);
  });

  it("refuses directories and null bytes", () => {
    assert.equal(allowed("/src/"), null);
    assert.equal(allowed("/"), resolve(root, "index.html"));
    assert.equal(allowed("/src/main.js%00.png"), null);
  });

  it("ignores the query string when resolving", () => {
    assert.equal(allowed("/src/main.js?v=2"), resolve(root, "src/main.js"));
  });
});
