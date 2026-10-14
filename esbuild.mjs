// Builds the shipped bundles into dist/ (see docs/spec.md §6).
// `node esbuild.mjs`        → dist/
// `node esbuild.mjs --e2e`  → out/e2e/ (the @vscode/test-electron suite; never shipped)
import * as esbuild from "esbuild";
import { cpSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

/** @type {import("esbuild").BuildOptions} */
const common = {
  bundle: true,
  logLevel: "warning",
  sourcemap: false,
  legalComments: "inline",
};

/** The script entry points, emitted as `<name>.mjs`. @type {Record<string, string>} */
const SCRIPT_ENTRIES = {
  "repo-facts": "src/agent/repo-facts.ts",
  validate: "src/agent/validate.ts",
  session: "src/agent/session.ts",
  "session-hook": "src/agent/session-hook.ts",
};

/**
 * The skill scripts: ESM for Node ≥ 18 with every dependency inlined (ADR 0007).
 * @param {string} outdir
 * @param {string[]} [names] which entries to build; default all (used by the test setup,
 *   which stages every script side by side in out/test-scripts/)
 */
export async function buildScripts(outdir, names = Object.keys(SCRIPT_ENTRIES)) {
  await esbuild.build({
    ...common,
    entryPoints: Object.fromEntries(
      names.map((name) => {
        const entry = SCRIPT_ENTRIES[name];
        if (entry === undefined) throw new Error(`buildScripts: unknown script entry ${name}`);
        return [name, join(root, entry)];
      }),
    ),
    outdir,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    format: "esm",
    target: "node18",
  });
}

async function buildDist() {
  rmSync(dist, { recursive: true, force: true });

  // Static skill files (SKILL.md, agents/, references/) ship as-is.
  cpSync(join(root, "skills"), join(dist, "skills"), { recursive: true });
  await buildScripts(join(dist, "skills/sustain-architecture/scripts"), ["repo-facts", "validate"]);
  await buildScripts(join(dist, "skills/sustain-bugfix/scripts"), ["session", "session-hook"]);

  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/extension/extension.ts")],
    outfile: join(dist, "extension.js"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
  });

  // The webviews: one IIFE each (the diagram one includes elkjs) loaded by nonce under a
  // strict CSP (NFR-SEC-01).
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/main.ts")],
    outfile: join(dist, "webview.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  });
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/session.ts")],
    outfile: join(dist, "session-webview.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  });
  cpSync(join(root, "webview/styles.css"), join(dist, "webview.css"));
  cpSync(join(root, "webview/session.css"), join(dist, "session-webview.css"));
}

async function buildE2e() {
  const out = join(root, "out/e2e");
  rmSync(out, { recursive: true, force: true });
  const suiteDir = join(root, "test/e2e/suite");
  const suiteFiles = readdirSync(suiteDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(suiteDir, name));
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "test/e2e/runTest.ts"), ...suiteFiles],
    outdir: out,
    outbase: join(root, "test/e2e"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode", "mocha", "@vscode/test-electron"],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--e2e")) await buildE2e();
  else await buildDist();
}
