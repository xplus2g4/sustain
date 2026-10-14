// Learning-session state under `<repo>/.sustain/` (ADRs 0029–0035): `session.json` is the
// public snapshot the extension renders, `events.jsonl` the append-only ledger the local
// leaderboard derives from, `manifest.json` the secret record of seeded bugs, and
// `.sustain/active` the one-session-per-repo lock. Written and read only by `session.mjs`;
// the webview must never see `manifest.json`.
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parseRunName } from "./runFolder";

export const SUSTAIN_DIR = ".sustain";
/** Names the live run folder; missing means no active session (ADR 0033). */
export const ACTIVE_FILE = "active";
export const SESSION_FILE = "session.json";
export const EVENTS_FILE = "events.jsonl";
export const MANIFEST_FILE = "manifest.json";

export type SessionMode = "bugfix";
export type SessionPhase = "clarify" | "implementing" | "hunting" | "paused" | "done";
/** Phases a session can resume into; `paused` and `done` are never resume targets. */
export type LivePhase = Exclude<SessionPhase, "paused" | "done">;

export const SESSION_PHASES: readonly SessionPhase[] = ["clarify", "implementing", "hunting", "paused", "done"];
export const LIVE_PHASES: readonly LivePhase[] = ["clarify", "implementing", "hunting"];
export const SESSION_MODES: readonly SessionMode[] = ["bugfix"];

/** A non-done session idle past this is stale: `status` flags it, `init` releases it (ADR 0033). */
export const STALE_IDLE_MS = 24 * 60 * 60 * 1000;

/** The bug kinds the mutation engine knows (ADR 0031); each tiers into the score table. */
export type MutationKind = "off-by-one" | "flipped-comparison" | "missing-await";
export const MUTATION_KINDS: readonly MutationKind[] = ["off-by-one", "flipped-comparison", "missing-await"];

/** Difficulty tiers from the bug taxonomy (ADR 0035): T1 line-local, T2 control-flow/async. */
export type DifficultyTier = "T1" | "T2" | "T3";
export const KIND_TIER: Record<MutationKind, DifficultyTier> = {
  "off-by-one": "T1",
  "flipped-comparison": "T1",
  "missing-await": "T2",
};
export const TIER_POINTS: Record<DifficultyTier, number> = { T1: 10, T2: 20, T3: 30 };

export type HintLevel = 1 | 2 | 3;
export const HINT_LEVELS: readonly HintLevel[] = [1, 2, 3];
export const HINT_COST: Record<HintLevel, number> = { 1: 5, 2: 10, 3: 15 };

/** Ledger event types (ADR 0034): lifecycle events `paused`/`resumed`/`restored`/`abandoned` per ADR 0033. */
export type EventType =
  | "init"
  | "planned"
  | "injected"
  | "found"
  | "fixed"
  | "hint"
  | "verified"
  | "completed"
  | "paused"
  | "resumed"
  | "restored"
  | "abandoned";

/** One `events.jsonl` line: `{"ts": <ISO>, "type": <EventType>, …details}`. */
export interface SessionEvent {
  ts: string;
  type: EventType;
  [detail: string]: unknown;
}

export interface SessionStep {
  title: string;
  /** Repo-relative files the step is expected to touch — announced at hunt start (ADR 0035). */
  files: string[];
  /** Optional per-step check command, reserved for guided mode (ADR 0035); unused by bugfix. */
  check?: string;
}

/** The public `session.json` snapshot — never locations, kinds or per-file counts. */
export interface SessionState {
  version: 1;
  mode: SessionMode;
  phase: SessionPhase;
  /** The live phase `pause` parked — where `resume` returns (ADR 0033). */
  pausedFrom?: LivePhase;
  /** 0-based index of the step the session is working on. */
  stepIndex: number;
  steps: SessionStep[];
  /** Bugs seeded so far; details live in `manifest.json`. */
  bugs: number;
  found: number;
  fixed: number;
  score: number;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** 1-based inclusive line range of a seeded hunk (a single line in v1). */
export interface BugRegion {
  startLine: number;
  endLine: number;
}

/** One seeded bug in `manifest.json` — the secret record only `session.mjs` reads. */
export interface ManifestBug {
  /** `bug-1`, `bug-2`, … in injection order. */
  id: string;
  /** `stepIndex` the bug was injected under. */
  step: number;
  /** Repo-relative path, `/` separators. */
  file: string;
  region: BugRegion;
  kind: MutationKind;
  /** The line before mutation; deleted by `complete` once the session is done (ADR 0033). */
  pristineHunk?: string;
  /** The mutated line — a bug is fixed when it no longer appears in the file. */
  buggyHunk: string;
  /** Trimmed lines identical to `buggyHunk` that already existed when the bug was seeded. */
  twins: number;
  found: boolean;
  fixed: boolean;
  /** `restore`/`abandon` wrote the pristine hunk back — the bug is unseeded and unscored. */
  restored?: boolean;
  /** Hint levels taken on this bug, in order (each is a score deduction). */
  hints: HintLevel[];
}

/** `manifest.json` — seeded regions, kinds and hunks (ADR 0034). */
export interface Manifest {
  version: 1;
  bugs: ManifestBug[];
}

export function newSession(mode: SessionMode, now = new Date()): SessionState {
  const ts = now.toISOString();
  return { version: 1, mode, phase: "clarify", stepIndex: 0, steps: [], bugs: 0, found: 0, fixed: 0, score: 0, createdAt: ts, updatedAt: ts };
}

export function newManifest(): Manifest {
  return { version: 1, bugs: [] };
}

/** Points per bug found *and* fixed × tier multiplier − hint deductions, floored at 0 (ADR 0035). */
export function scoreSession(manifest: Manifest): number {
  let score = 0;
  for (const bug of manifest.bugs) {
    if (bug.found && bug.fixed && bug.restored !== true) score += TIER_POINTS[KIND_TIER[bug.kind]];
    for (const level of bug.hints) score -= HINT_COST[level];
  }
  return Math.max(0, score);
}

/** Milliseconds since `session.updatedAt`; `NaN` timestamps count as infinitely idle. */
export function sessionIdleMs(session: SessionState, now = new Date()): number {
  const updated = Date.parse(session.updatedAt);
  return Number.isNaN(updated) ? Number.POSITIVE_INFINITY : now.getTime() - updated;
}

/** A non-done session idle past {@link STALE_IDLE_MS} — including `paused` (ADR 0033/0039). */
export function isSessionStale(session: SessionState, now = new Date()): boolean {
  return session.phase !== "done" && sessionIdleMs(session, now) > STALE_IDLE_MS;
}

/** Appends one JSON line (`{ts, type, …details}`) to `events.jsonl`, creating it if needed. */
export function appendEvent(runDir: string, event: { type: EventType; [detail: string]: unknown }, now = new Date()): void {
  mkdirSync(runDir, { recursive: true });
  const line: SessionEvent = { ts: now.toISOString(), ...event };
  appendFileSync(join(runDir, EVENTS_FILE), `${JSON.stringify(line)}\n`);
}

/** Temp-file + fsync + rename, the `publishCandidate` write pattern; watchers see whole files. */
function writeAtomic(path: string, content: string): void {
  const temp = join(dirname(path), `.tmp-${process.pid}-${Date.now()}`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/** Writes `value` as 2-space JSON with a trailing newline, atomically. */
export function writeJson(path: string, value: unknown): void {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function corrupt(file: string, problem: string): Error {
  return new Error(`${file} is corrupt: ${problem}`);
}

function checkSteps(value: unknown, file: string): SessionStep[] {
  if (!Array.isArray(value)) throw corrupt(file, `steps is not an array`);
  return value.map((item, i) => {
    if (!isRecord(item) || typeof item["title"] !== "string" || item["title"] === "") throw corrupt(file, `steps[${i}] has no title`);
    const files = item["files"] ?? [];
    if (!Array.isArray(files) || files.some((f) => typeof f !== "string")) throw corrupt(file, `steps[${i}].files is not a string list`);
    const step: SessionStep = { title: item["title"], files: files as string[] };
    if (typeof item["check"] === "string") step.check = item["check"];
    return step;
  });
}

/** Parses `session.json`, throwing a `corrupt session.json: …` error on any bad field. */
export function checkSession(value: unknown, file = SESSION_FILE): SessionState {
  if (!isRecord(value)) throw corrupt(file, "not an object");
  if (!SESSION_MODES.includes(value["mode"] as SessionMode)) throw corrupt(file, `unknown mode ${JSON.stringify(value["mode"])}`);
  if (!SESSION_PHASES.includes(value["phase"] as SessionPhase)) throw corrupt(file, `unknown phase ${JSON.stringify(value["phase"])}`);
  if (value["pausedFrom"] !== undefined && !LIVE_PHASES.includes(value["pausedFrom"] as LivePhase)) {
    throw corrupt(file, `pausedFrom is not a live phase`);
  }
  for (const key of ["stepIndex", "bugs", "found", "fixed", "score"]) {
    if (typeof value[key] !== "number") throw corrupt(file, `${key} is not a number`);
  }
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof value[key] !== "string") throw corrupt(file, `${key} is not a string`);
  }
  const steps = checkSteps(value["steps"], file);
  return { ...(value as unknown as SessionState), steps };
}

/** Parses `manifest.json`, throwing a `corrupt manifest.json: …` error on any bad field. */
export function checkManifest(value: unknown, file = MANIFEST_FILE): Manifest {
  if (!isRecord(value) || !Array.isArray(value["bugs"])) throw corrupt(file, "bugs is not an array");
  const bugs = (value["bugs"] as unknown[]).map((item, i): ManifestBug => {
    const at = `bugs[${i}]`;
    if (!isRecord(item)) throw corrupt(file, `${at} is not an object`);
    for (const key of ["id", "file", "kind", "buggyHunk"]) {
      if (typeof item[key] !== "string") throw corrupt(file, `${at}.${key} is not a string`);
    }
    if (!MUTATION_KINDS.includes(item["kind"] as MutationKind)) throw corrupt(file, `${at}.kind is unknown`);
    if (item["pristineHunk"] !== undefined && typeof item["pristineHunk"] !== "string") throw corrupt(file, `${at}.pristineHunk is not a string`);
    const region = item["region"];
    if (!isRecord(region) || typeof region["startLine"] !== "number" || typeof region["endLine"] !== "number") {
      throw corrupt(file, `${at}.region is malformed`);
    }
    if (typeof item["step"] !== "number" || typeof item["twins"] !== "number") throw corrupt(file, `${at} counters are malformed`);
    if (typeof item["found"] !== "boolean" || typeof item["fixed"] !== "boolean") throw corrupt(file, `${at} flags are malformed`);
    if (item["restored"] !== undefined && typeof item["restored"] !== "boolean") throw corrupt(file, `${at}.restored is not a boolean`);
    const hints = item["hints"] ?? [];
    if (!Array.isArray(hints) || hints.some((h) => !HINT_LEVELS.includes(h as HintLevel))) throw corrupt(file, `${at}.hints is malformed`);
    return { ...(item as unknown as ManifestBug), hints: hints as HintLevel[] };
  });
  return { version: 1, bugs };
}

/** Reads and validates a JSON file inside a run folder; throws on missing or corrupt data. */
function readJsonFile<T>(runDir: string, file: string, check: (value: unknown, file: string) => T): T {
  const path = join(runDir, file);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${file} is unreadable: ${(error as Error).message}`);
  }
  return check(value, file);
}

export function loadSession(runDir: string): SessionState {
  return readJsonFile(runDir, SESSION_FILE, checkSession);
}

/** Writes `session.json`, refreshing `updatedAt`. */
export function saveSession(runDir: string, session: SessionState, now = new Date()): void {
  session.updatedAt = now.toISOString();
  writeJson(join(runDir, SESSION_FILE), session);
}

export function loadManifest(runDir: string): Manifest {
  return readJsonFile(runDir, MANIFEST_FILE, checkManifest);
}

export function saveManifest(runDir: string, manifest: Manifest): void {
  writeJson(join(runDir, MANIFEST_FILE), manifest);
}

/**
 * The run folder named by `.sustain/active`, or `null` when no session holds the lock or
 * the lock does not name a `<prefix>-<slug>-<ts>[-N]` run folder.
 */
export function activeRun(root: string): string | null {
  try {
    const run = readFileSync(join(root, SUSTAIN_DIR, ACTIVE_FILE), "utf8").trim();
    return run !== "" && parseRunName(run) !== null ? run : null;
  } catch {
    return null;
  }
}

/** Whether `.sustain/<run>/` exists — a lock naming a missing run is stale. */
export function runExists(root: string, run: string): boolean {
  return existsSync(join(root, SUSTAIN_DIR, run));
}
