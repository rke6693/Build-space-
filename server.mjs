#!/usr/bin/env node
/**
 * The local dev server for Squishymon.
 *
 * Zero dependencies, and deliberately strict: it resolves every request to a
 * real path and refuses anything that escapes the project root or lands
 * outside the small set of directories the game actually ships. That keeps
 * `..%2f` traversal, dotfiles, and stray editor backups off the wire even
 * though this only ever listens on loopback.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number.parseInt(process.env.PORT ?? "4173", 10);
const HOST = process.env.SQUISHYMON_HOST ?? "127.0.0.1";

/** Files servable from the project root itself. */
const ROOT_FILES = new Set(["index.html", "favicon.ico"]);
/** Directories whose contents are servable, recursively. */
const PUBLIC_DIRS = ["src", "styles", "assets"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin"
};

/**
 * Maps a request path to an absolute file path, or null when the request is
 * not allowed. Exported so the test suite can assert the policy directly.
 */
export function resolveRequestPath(requestPath, root = ROOT) {
  let decoded;
  try {
    decoded = decodeURIComponent(new URL(requestPath, "http://localhost").pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (relativePath === "" || relativePath.endsWith("/")) return null;

  const absolute = resolve(join(root, relativePath));
  const inside = relative(root, absolute);
  if (inside.startsWith("..") || inside === "" || (inside.includes(":") && sep === "\\")) return null;

  const segments = inside.split(sep);
  if (segments.some((segment) => segment.startsWith("."))) return null;

  if (segments.length === 1) return ROOT_FILES.has(segments[0]) ? absolute : null;
  return PUBLIC_DIRS.includes(segments[0]) ? absolute : null;
}

async function respond(request, response) {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { ...SECURITY_HEADERS, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Squishymon only answers GET and HEAD.\n");
    return;
  }

  const path = resolveRequestPath(request.url ?? "/");
  const info = path ? await stat(path).catch(() => null) : null;
  if (!path || !info?.isFile()) {
    response.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
    response.end("Squishymon could not find that path.\n");
    return;
  }

  // mtime + size is enough for a dev server and costs one stat we already did.
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = {
    ...SECURITY_HEADERS,
    "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
    "Content-Length": String(info.size),
    "Cache-Control": "no-cache",
    ETag: etag
  };

  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, SECURITY_HEADERS);
    response.end();
    return;
  }

  response.writeHead(200, headers);
  if (method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(path).on("error", () => response.destroy()).pipe(response);
}

export function createSquishymonServer() {
  return createServer((request, response) => {
    respond(request, response).catch((error) => {
      console.error("Squishymon request failed.", error);
      if (!response.headersSent) {
        response.writeHead(500, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
      }
      response.end("The marsh flooded. Check the server log.\n");
    });
  });
}

// Only listen when run directly, so tests can import the policy for free.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const server = createSquishymonServer();
  server.listen(PORT, HOST, () => {
    console.log(`Squishymon is awake at http://${HOST}:${PORT}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
}
