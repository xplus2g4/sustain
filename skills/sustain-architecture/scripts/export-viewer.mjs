// src/browser/export.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join as join3, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// src/browser/html.ts
var FALLBACK_THEME = `:root {
  --vscode-editor-background: #1e1e1e;
  --vscode-foreground: #d4d4d4;
  --vscode-font-family: system-ui, sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: ui-monospace, Menlo, monospace;
  --vscode-panel-border: #3c3c3c;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-errorForeground: #f48771;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-editor-rangeHighlightBackground: rgba(255, 215, 0, 0.14);
  --vscode-editorLineNumber-foreground: #858585;
  --vscode-toolbar-hoverBackground: rgba(255, 255, 255, 0.1);
  --vscode-focusBorder: #007fd4;
  --vscode-widget-shadow: rgba(0, 0, 0, 0.36);
  --vscode-editorWidget-background: #252526;
  --vscode-editorWidget-border: #454545;
  --vscode-editorHoverWidget-background: #252526;
  --vscode-editorHoverWidget-foreground: #d4d4d4;
  --vscode-editorHoverWidget-border: #454545;
  --vscode-textLink-foreground: #3794ff;
  --vscode-textLink-activeForeground: #3794ff;
  --vscode-charts-foreground: #cccccc;
  --vscode-charts-red: #f14c4c;
  --vscode-charts-blue: #3794ff;
  --vscode-charts-yellow: #e2c08d;
  --vscode-charts-orange: #d18616;
  --vscode-charts-green: #89d185;
  --vscode-charts-purple: #b180d7;
}`;
var CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
function inlineScript(program) {
  return program.replace(/<\/script/gi, "<\\/script");
}
function snapshotHtml(page) {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Architecture</title>",
    `<style>${FALLBACK_THEME}</style>`,
    `<style>${page.style}</style>`,
    "</head>",
    "<body>",
    `<script>window.__SUSTAIN_SNAPSHOT__ = ${inlineJson(page.snapshot)};</script>`,
    `<script>${inlineScript(page.script)}</script>`,
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

// src/browser/snapshot.ts
import { readFileSync } from "node:fs";

// src/model/tolerant.ts
var COMPONENT_TYPES = ["frontend", "backend", "database", "cloud", "security", "messagebus", "external"];
var VARIANTS = ["default", "emphasis", "security", "dashed"];
function isObj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value) {
  return typeof value === "string" ? value : void 0;
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function pair(value) {
  if (!Array.isArray(value) || value.length !== 2) return void 0;
  const [a, b] = [num(value[0]), num(value[1])];
  return a === void 0 || b === void 0 ? void 0 : [a, b];
}
function readSources(value, pointer, skipped) {
  if (!Array.isArray(value)) return [];
  const sources = [];
  value.forEach((entry, k) => {
    const path = isObj(entry) ? str(entry["path"]) : void 0;
    if (!isObj(entry) || path === void 0) {
      skipped.push(`${pointer}/sources/${k}: no string path`);
      return;
    }
    const source = { path };
    const line = num(entry["line"]);
    const end = num(entry["end_line"]);
    const label = str(entry["label"]);
    if (line !== void 0) source.line = line;
    if (end !== void 0) source.end_line = end;
    if (label !== void 0) source.label = label;
    sources.push(source);
  });
  return sources;
}
function readGrid(value) {
  if (!isObj(value) || value["mode"] !== "grid") return void 0;
  const grid = { mode: "grid" };
  const origin = pair(value["origin"]);
  if (origin) grid.origin = origin;
  for (const key of ["cols", "gapX", "gapY", "cellW", "cellH"]) {
    const n = num(value[key]);
    if (n !== void 0) grid[key] = n;
  }
  return grid;
}
function readDiagram(value) {
  if (!isObj(value)) return { ok: false, reason: "the root is not a JSON object" };
  const rawComponents = value["components"];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    return { ok: false, reason: "it has no components" };
  }
  const skipped = [];
  const components = [];
  const ids = /* @__PURE__ */ new Set();
  rawComponents.forEach((raw, i) => {
    const pointer = `/components/${i}`;
    const id = isObj(raw) ? str(raw["id"]) : void 0;
    if (!isObj(raw) || id === void 0) {
      skipped.push(`${pointer}: no string id`);
      return;
    }
    if (ids.has(id)) {
      skipped.push(`${pointer}: duplicate id ${id}`);
      return;
    }
    ids.add(id);
    const type = str(raw["type"]);
    const component = {
      id,
      label: str(raw["label"]) || id,
      type: COMPONENT_TYPES.includes(type) ? type : "external",
      sources: readSources(raw["sources"], pointer, skipped)
    };
    const sublabel = str(raw["sublabel"]);
    const tag = str(raw["tag"]);
    const pos = pair(raw["pos"]);
    const size = pair(raw["size"]);
    const row = num(raw["row"]);
    const col = num(raw["col"]);
    if (sublabel) component.sublabel = sublabel;
    if (tag) component.tag = tag;
    if (pos) component.pos = pos;
    if (size) component.size = size;
    if (row !== void 0) component.row = row;
    if (col !== void 0) component.col = col;
    components.push(component);
  });
  if (components.length === 0) return { ok: false, reason: "it has no components with an id" };
  const connections = [];
  const rawConnections = value["connections"];
  if (Array.isArray(rawConnections)) {
    rawConnections.forEach((raw, i) => {
      const from = isObj(raw) ? str(raw["from"]) : void 0;
      const to = isObj(raw) ? str(raw["to"]) : void 0;
      if (!isObj(raw) || from === void 0 || to === void 0 || !ids.has(from) || !ids.has(to)) {
        skipped.push(`/connections/${i}: from/to do not resolve`);
        return;
      }
      const variant = str(raw["variant"]);
      const connection = { from, to, variant: VARIANTS.includes(variant) ? variant : "default" };
      const label = str(raw["label"]);
      if (label) connection.label = label;
      connections.push(connection);
    });
  }
  const boundaries = [];
  const rawBoundaries = value["boundaries"];
  if (Array.isArray(rawBoundaries)) {
    rawBoundaries.forEach((raw, i) => {
      const pointer = `/boundaries/${i}`;
      if (!isObj(raw)) {
        skipped.push(`${pointer}: not an object`);
        return;
      }
      const wraps = [];
      const rawWraps = Array.isArray(raw["wraps"]) ? raw["wraps"] : [];
      rawWraps.forEach((member, j) => {
        if (typeof member === "string" && ids.has(member)) {
          if (!wraps.includes(member)) wraps.push(member);
        } else skipped.push(`${pointer}/wraps/${j}: does not resolve`);
      });
      if (wraps.length === 0) {
        skipped.push(`${pointer}: no members left`);
        return;
      }
      boundaries.push({ kind: raw["kind"] === "security-group" ? "security-group" : "region", label: str(raw["label"]) ?? "", wraps });
    });
  }
  const diagram = { components, connections, boundaries };
  const meta = value["meta"];
  const title = isObj(meta) ? str(meta["title"]) : void 0;
  if (title) diagram.title = title;
  const grid = readGrid(value["layout"]);
  if (grid) diagram.grid = grid;
  return { ok: true, diagram, skipped };
}
function parseDiagram(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `invalid JSON (${error.message})` };
  }
  const result = readDiagram(value);
  return result.ok ? { ...result, value } : result;
}

// src/extension/sourceTarget.ts
import { realpathSync as realpathSync2 } from "node:fs";
import { join as join2 } from "node:path";

// src/model/citations.ts
import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
var MAX_CITED_BYTES = 2 * 1024 * 1024;
var BINARY_SNIFF_BYTES = 8 * 1024;
var MAX_PATH_LENGTH = 240;
function citationPathOk(path) {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
function countLines(bytes) {
  let newlines = 0;
  for (const byte of bytes) if (byte === 10) newlines += 1;
  if (bytes.length === 0) return 0;
  return bytes[bytes.length - 1] === 10 ? newlines : newlines + 1;
}
function probeFile(rootReal, path) {
  let real;
  try {
    real = realpathSync(join(rootReal, ...path.split("/")));
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    return { kind: "unreadable", reason: error.message };
  }
  if (real !== rootReal && !real.startsWith(rootReal.endsWith(sep) ? rootReal : rootReal + sep)) {
    return { kind: "outside" };
  }
  let fd;
  try {
    const stat = statSync(real);
    if (!stat.isFile()) return { kind: "notFile" };
    if (stat.size > MAX_CITED_BYTES) return { kind: "tooLarge", size: stat.size };
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_CITED_BYTES) + 1);
    fd = openSync(real, "r");
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_CITED_BYTES) return { kind: "tooLarge", size: length };
    const bytes = buffer.subarray(0, length);
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: "binary" };
    return { kind: "text", lineCount: countLines(bytes) };
  } catch (error) {
    return { kind: "unreadable", reason: error.message };
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}

// src/extension/sourceTarget.ts
function positiveInteger(value) {
  return value !== void 0 && Number.isInteger(value) && value >= 1 ? value : void 0;
}
function resolveSource(root, source) {
  const { path } = source;
  if (!citationPathOk(path)) return { kind: "error", message: `Invalid source path: \`${path}\`` };
  const probe = probeFile(realpathSync2(root), path);
  if (probe.kind === "outside") return { kind: "error", message: `Invalid source path: \`${path}\`` };
  if (probe.kind === "missing" || probe.kind === "notFile") {
    return { kind: "error", message: `Stale reference: \`${path}\` no longer exists` };
  }
  const file = join2(root, ...path.split("/"));
  const line = positiveInteger(source.line);
  if (line === void 0) return { kind: "open", file };
  const end = Math.max(line, positiveInteger(source.end_line) ?? line);
  if (probe.kind === "text" && end > probe.lineCount) {
    const cited = source.end_line !== void 0 ? `${line}\u2013${source.end_line}` : `${line}`;
    return { kind: "open", file, warning: `Stale reference: \`${path}\` has ${probe.lineCount} lines; the diagram cites ${cited}` };
  }
  return { kind: "open", file, lines: { start: line, end } };
}

// src/browser/protocol.ts
function sourceKey(componentId, index) {
  return `${componentId}:${index}`;
}

// src/browser/snapshot.ts
var CONTEXT_LINES = 8;
var HEAD_LINES = 40;
function embedSource(root, source) {
  const target = resolveSource(root, source);
  if (target.kind === "error") return { kind: "error", path: source.path, message: target.message };
  let text;
  try {
    text = readFileSync(target.file, "utf8");
  } catch (error) {
    return { kind: "error", path: source.path, message: `Stale reference: \`${source.path}\` cannot be read (${error.message})` };
  }
  const all = text.split("\n");
  let first;
  let last;
  let cited;
  if (target.lines) {
    cited = [target.lines.start, target.lines.end];
    first = Math.max(1, target.lines.start - CONTEXT_LINES);
    last = Math.min(all.length, target.lines.end + CONTEXT_LINES);
  } else {
    first = 1;
    last = Math.min(all.length, HEAD_LINES);
  }
  const lines = [];
  for (let n = first; n <= last; n += 1) lines.push({ n, text: all[n - 1] ?? "" });
  const embedded = { kind: "code", path: source.path, first, last, lines };
  if (source.label) embedded.label = source.label;
  if (cited) embedded.cited = cited;
  if (target.warning) embedded.warning = target.warning;
  return embedded;
}
function buildSnapshot(root, file, text) {
  const parsed = parseDiagram(text);
  if (!parsed.ok) throw new Error(`Can't show \`${file}\`: ${parsed.reason}`);
  const sources = {};
  for (const component of parsed.diagram.components) {
    component.sources.forEach((source, index) => {
      sources[sourceKey(component.id, index)] = embedSource(root, source);
    });
  }
  return { version: 1, doc: parsed.value, file, root, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), sources };
}

// src/browser/export.ts
function fail(message) {
  console.error(`export-viewer: ${message}`);
  process.exit(1);
}
function gitRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return void 0;
  }
}
function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, out: { type: "string" } }
  });
  const file = positionals[0];
  if (file === void 0 || positionals.length > 1) {
    fail("usage: node dist/export-viewer.mjs <diagram.json> [--root <repo>] [--out <page.html>]");
  }
  const diagramFile = resolve(file);
  const root = values.root !== void 0 ? resolve(values.root) : gitRoot(process.cwd()) ?? process.cwd();
  let text;
  try {
    text = readFileSync2(diagramFile, "utf8");
  } catch (error) {
    fail(`can't read \`${diagramFile}\`: ${error.message}`);
  }
  const snapshot = buildSnapshot(root, diagramFile, text);
  const here = dirname(fileURLToPath(import.meta.url));
  const page = snapshotHtml({
    script: readFileSync2(join3(here, "browser-viewer.js"), "utf8"),
    style: readFileSync2(join3(here, "webview.css"), "utf8"),
    snapshot
  });
  const out = values.out !== void 0 ? resolve(values.out) : join3(mkdtempSync(join3(tmpdir(), "sustain-viewer-")), `${basename(diagramFile, ".json")}.html`);
  writeFileSync(out, page);
  const errors = Object.values(snapshot.sources).filter((source) => source.kind === "error").length;
  console.log(JSON.stringify({ page: out, root, sources: Object.keys(snapshot.sources).length, errors }));
}
main();
