// Devin CLI detection for `Sustain: Start Learning Session` (ADR 0036). No `vscode`
// import, so the lookup order is unit-tested in Node.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { findOnPath } from "./agents";

/**
 * Well-known Devin CLI locations checked after PATH, most-specific first: the per-user
 * version store's `current` link and the Devin Desktop bundled binary (ADR 0040).
 */
export function devinFallbackPaths(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string[] {
  const home = env["HOME"] ?? env["USERPROFILE"] ?? homedir();
  const paths = [join(home, ".local", "share", "devin", "cli", "current", "bin", "devin")];
  if (platform === "darwin") {
    paths.push("/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin");
  } else if (platform === "win32") {
    const localAppData = env["LOCALAPPDATA"];
    if (localAppData !== undefined) paths.push(join(localAppData, "Programs", "Devin", "resources", "app", "extensions", "windsurf", "devin", "bin", "devin.exe"));
  }
  return paths;
}

/**
 * The `devin` executable for the session terminal: PATH first (via the shared
 * {@link findOnPath}), then the known install locations; `undefined` when nothing runs.
 * `exists` is injected for tests.
 */
export function findDevinCli(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const onPath = findOnPath("devin", env, platform);
  if (onPath !== undefined) return onPath;
  for (const candidate of devinFallbackPaths(env, platform)) {
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

/** The argument vector for `devin`: `--` separates the prompt from option parsing. */
export function devinPromptArgs(prompt: string): string[] {
  return ["--", prompt];
}
