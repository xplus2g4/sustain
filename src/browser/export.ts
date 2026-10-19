// `export-viewer`: builds a self-contained architecture page from a diagram file.
//
//   node dist/export-viewer.mjs <diagram.json> [--root <repo>] [--out <page.html>]
//
// Reads the built viewer bundle and stylesheet next to this script, embeds them with the
// snapshot of citations resolved against the repo root, writes one HTML file (a fresh
// folder under the OS temp dir unless --out), and prints one JSON result on stdout.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { snapshotHtml } from "./html";
import { buildSnapshot } from "./snapshot";

function fail(message: string): never {
  console.error(`export-viewer: ${message}`);
  process.exit(1);
}

/** The enclosing git work tree's root, or `undefined` outside one. */
function gitRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function main(): void {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, out: { type: "string" } },
  });
  const file = positionals[0];
  if (file === undefined || positionals.length > 1) {
    fail("usage: node dist/export-viewer.mjs <diagram.json> [--root <repo>] [--out <page.html>]");
  }
  const diagramFile = resolve(file);
  const root = values.root !== undefined ? resolve(values.root) : gitRoot(process.cwd()) ?? process.cwd();
  let text: string;
  try {
    text = readFileSync(diagramFile, "utf8");
  } catch (error) {
    fail(`can't read \`${diagramFile}\`: ${(error as Error).message}`);
  }
  const snapshot = buildSnapshot(root, diagramFile, text);
  const here = dirname(fileURLToPath(import.meta.url));
  const page = snapshotHtml({
    script: readFileSync(join(here, "browser-viewer.js"), "utf8"),
    style: readFileSync(join(here, "webview.css"), "utf8"),
    snapshot,
  });
  const out = values.out !== undefined ? resolve(values.out) : join(mkdtempSync(join(tmpdir(), "sustain-viewer-")), `${basename(diagramFile, ".json")}.html`);
  writeFileSync(out, page);
  const errors = Object.values(snapshot.sources).filter((source) => source.kind === "error").length;
  console.log(JSON.stringify({ page: out, root, sources: Object.keys(snapshot.sources).length, errors }));
}

main();
