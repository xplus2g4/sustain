import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import { SCRIPTS_DIR } from "./buildScripts";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fresh real-path temp folder, removed after the current test. */
export function tempDir(prefix = "sustain-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

/** Writes `content` at `root/rel`, creating parent folders. */
export function put(root: string, rel: string, content: string | Uint8Array): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Runs git isolated from the user's and system configuration (no signing, fixed identity). */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args],
    { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

/** A committed repo containing `files`. */
export function gitRepo(files: Record<string, string>): string {
  const root = tempDir("sustain-git-");
  git(root, "init", "-q");
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

/** validate.mjs stdout (FR-VAL-01). */
export interface ValidateReport {
  status: "accepted" | "rejected";
  candidate?: string;
  errors: { pointer: string; message: string }[];
  warnings: { pointer: string; message: string }[];
  hint?: string;
}

/** repo-facts.mjs stdout (FR-RF-01). */
export interface RepoFacts {
  root: string;
  runFolder: string;
  draft: string;
  git: { head: string; origin: string | null; dirtyCount: number; dirty: string[] } | null;
}

/** session.mjs stdout: `status` plus command-specific fields (ADR 0037). */
export interface SessionReport {
  status: string;
  [key: string]: unknown;
}

export interface ScriptRun<Output> {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON; throws when it is not exactly one JSON value. */
  json(): Output;
}

interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/** Runs a built skill script with `node`, as the agent does. */
export function runScript(script: "validate", args: string[], options: RunOptions): ScriptRun<ValidateReport>;
export function runScript(script: "repo-facts", args: string[], options: RunOptions): ScriptRun<RepoFacts>;
export function runScript(script: "session", args: string[], options: RunOptions): ScriptRun<SessionReport>;
export function runScript(
  script: "validate" | "repo-facts" | "session",
  args: string[],
  options: RunOptions,
): ScriptRun<ValidateReport | RepoFacts | SessionReport> {
  const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, `${script}.mjs`), ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    // Names the documented output contract; the tests assert every field they read.
    json: () => JSON.parse(result.stdout) as ValidateReport | RepoFacts | SessionReport,
  };
}

/** session-hook.mjs stdout: a Devin hook control object (`decision`/`hookSpecificOutput`). */
export interface HookReport {
  decision?: "approve" | "block";
  reason?: string;
  hookSpecificOutput?: { hookEventName: string; additionalContext?: string; updatedInput?: Record<string, unknown> };
  [key: string]: unknown;
}

/**
 * Runs the built session-hook.mjs exactly as Devin's lifecycle hooks do: the event JSON
 * on stdin, cwd = repo root, `DEVIN_PROJECT_DIR` set (ADR 0032).
 */
export function runHook(payload: Record<string, unknown>, options: RunOptions): ScriptRun<HookReport> {
  const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, "session-hook.mjs")], {
    cwd: options.cwd,
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...process.env, DEVIN_PROJECT_DIR: options.cwd, ...options.env },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: () => JSON.parse(result.stdout) as HookReport,
  };
}

/** An environment whose PATH holds no `git` (only an empty folder). */
export function envWithoutGit(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: tempDir("sustain-nogit-") };
}
