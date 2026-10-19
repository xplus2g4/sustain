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

/**
 * The skill scripts: ESM for Node ≥ 18 with every dependency inlined (ADR 0007).
 * @param {string} outdir
 */
export async function buildScripts(outdir) {
  await esbuild.build({
    ...common,
    entryPoints: {
      "repo-facts": join(root, "src/agent/repo-facts.ts"),
      validate: join(root, "src/agent/validate.ts"),
      "export-viewer": join(root, "src/browser/export.ts"),
    },
    outdir,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    format: "esm",
    target: "node18",
  });
}

async function buildDist() {
  rmSync(dist, { recursive: true, force: true });

  // Static skill files (SKILL.md, agents/, references/) ship as-is. The scripts are built
  // into the committed tree too, so the folder can be fetched directly (e.g. npx degit).
  await buildScripts(join(root, "skills/sustain-architecture/scripts"));

  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/extension/extension.ts")],
    outfile: join(dist, "extension.js"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
  });

  // The webviews: one IIFE each (elkjs included). main.ts runs under the panel's strict
  // CSP (NFR-SEC-01); browser.ts is inlined into the self-contained snapshot page.
  await esbuild.build({
    ...common,
    entryPoints: {
      webview: join(root, "webview/main.ts"),
      "browser-viewer": join(root, "webview/browser.ts"),
    },
    outdir: dist,
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  });
  cpSync(join(root, "webview/styles.css"), join(dist, "webview.css"));

  // The skill ships the standalone viewer too, so `sustain-architecture` can end with the
  // page open beside the chat (SKILL.md step 7). The same files sit at the dist root.
  const skillScripts = join(root, "skills/sustain-architecture/scripts");
  cpSync(join(dist, "browser-viewer.js"), join(skillScripts, "browser-viewer.js"));
  cpSync(join(root, "webview/styles.css"), join(skillScripts, "webview.css"));
  for (const name of ["export-viewer.mjs", "browser-viewer.js", "webview.css"]) {
    cpSync(join(skillScripts, name), join(dist, name));
  }

  // Static skill files ship as-is; copied last so dist/skills gets the generated files too.
  cpSync(join(root, "skills"), join(dist, "skills"), { recursive: true });
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
