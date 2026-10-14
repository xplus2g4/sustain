// `node .agents/skills/sustain-bugfix/scripts/session.mjs <command> …`, run with cwd = repo
// root (ADRs 0030–0035). The deterministic referee for a learning session: phase
// transitions, the bug manifest, fix verification and scoring live here, not in the
// agent's memory. Contract (ADR 0017): one JSON object on stdout; exit 0 ok, 1 domain
// failure, 2 usage or I/O error (message on stderr, no stdout JSON). Command details and
// scoring constants: ADR 0037.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { isDenied } from "../model/deny";
import { collectGitFacts } from "../model/git";
import { createRunFolder, runTimestamp, slugify } from "../model/runFolder";
import {
  ACTIVE_FILE,
  activeRun,
  appendEvent,
  checkSession,
  HINT_COST,
  HINT_LEVELS,
  isSessionStale,
  loadManifest,
  loadSession,
  MUTATION_KINDS,
  newManifest,
  newSession,
  runExists,
  saveManifest,
  saveSession,
  scoreSession,
  SESSION_FILE,
  sessionIdleMs,
  SESSION_MODES,
  SUSTAIN_DIR,
  type HintLevel,
  type LivePhase,
  type Manifest,
  type ManifestBug,
  type MutationKind,
  type SessionMode,
  type SessionState,
  type SessionStep,
} from "../model/session";
import { bugStillPresent, hunkCount, mutateFile, restoreHunk, type MutationResult } from "./modes/bugfix/mutations";

const USAGE =
  "usage: node session.mjs <command>\n" +
  "  init --mode bugfix [--name <text>]     start a session, take the .sustain/active lock\n" +
  "  plan --steps '<json>'                  record the plan: [{\"title\":…,\"files\":[…]}] or [\"…\"]\n" +
  "  inject --file <f> --line <n> --kind <k>  seed one bug (kinds: off-by-one, flipped-comparison, missing-await)\n" +
  "  status                                 the authoritative session snapshot\n" +
  "  report --file <f>                      confirm <f> holds an unfixed seeded bug\n" +
  "  hint --level <1|2|3> [--bug <id>|--file <f>]  ledger a hint deduction\n" +
  "  verify [--check-cmd <cmd>]             judge fixes; advance the step when clean\n" +
  "  complete                               score the session, free the lock\n" +
  "  pause                                  park the session; hooks go inert\n" +
  "  resume                                 return to the phase pause parked\n" +
  "  restore [--bug <id>]                   write pristine hunks back, keep the session\n" +
  "  abandon                                restore seeded hunks, end the session, free the lock";

const JS_TS = /\.(mjs|cjs|mts|cts|js|jsx|ts|tsx)$/;
/** `.mjs`/`.cjs` are the only files `node --check` parses unambiguously (ADR 0037). */
const NODE_CHECKABLE = /\.(mjs|cjs)$/;
const CHECK_OUTPUT_TAIL = 1000;

const root = process.cwd();

interface Out {
  status: string;
  [key: string]: unknown;
}

/** Prints one JSON object and finishes with `code`. */
function report(code: number, out: Out): number {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return code;
}

function usageError(message: string): number {
  process.stderr.write(`session.mjs: ${message}\n`);
  return 2;
}

/** `--name value` pairs for the listed flags; `null` on anything unexpected. */
function flags(args: string[], names: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i]!;
    if (!name.startsWith("--") || !names.includes(name.slice(2))) return null;
    const value = args[i + 1];
    if (value === undefined) return null;
    out[name.slice(2)] = value;
    i += 1;
  }
  return out;
}

interface Active {
  run: string;
  dir: string;
  session: SessionState;
  manifest: Manifest;
}

/** The session under `.sustain/active`, or `null` when there is none or the run is gone. */
function loadActive(): Active | null {
  const run = activeRun(root);
  if (run === null || !runExists(root, run)) return null;
  const dir = join(root, SUSTAIN_DIR, run);
  const session = loadSession(dir);
  const manifest = loadManifest(dir);
  return { run, dir, session, manifest };
}

function noSession(): number {
  return report(1, { status: "no-session", message: "no active session — run `session.mjs init` first" });
}

/**
 * Gate shared by the play commands: a parked session refuses `plan`/`inject`/`report`/
 * `hint`/`verify`/`complete` (exit 1, `paused`) until `resume` or `abandon` (ADR 0033).
 * Returns the report code, or `null` when the session is not paused.
 */
function ifPaused(session: SessionState): number | null {
  if (session.phase !== "paused") return null;
  return report(1, { status: "paused", phase: "paused", message: "session is paused — resume or abandon it first" });
}

/**
 * Resolves `arg` to a regular file inside the repo root. Throws for missing files, paths
 * escaping the root, deny-listed paths and anything under `.sustain/`.
 */
function repoFile(arg: string): { abs: string; rel: string } {
  const abs = resolve(root, arg);
  let real: string;
  try {
    real = realpathSync(abs);
  } catch {
    throw new Error(`${arg} does not exist`);
  }
  const rootReal = realpathSync(root);
  if (real !== rootReal && !real.startsWith(rootReal + sep)) {
    throw new Error(`${arg} resolves outside the repository root`);
  }
  const rel = relative(rootReal, real).split(sep).join("/");
  if (rel === "") throw new Error(`${arg} is the repository root, not a file`);
  if (rel.split("/")[0] === SUSTAIN_DIR || isDenied(rel)) throw new Error(`${rel} is off-limits for sessions`);
  if (!statSync(real).isFile()) throw new Error(`${rel} is not a file`);
  return { abs: real, rel };
}

/** `rel` for matching against `manifest` paths; never throws, never touches the fs. */
function looseRel(arg: string): string | null {
  let abs: string;
  try {
    abs = realpathSync(resolve(root, arg));
  } catch {
    abs = resolve(root, arg);
  }
  const rootReal = realpathSync(root);
  if (abs !== rootReal && !abs.startsWith(rootReal + sep)) return null;
  return relative(rootReal, abs).split(sep).join("/");
}

function save(active: Active): void {
  saveSession(active.dir, active.session);
  saveManifest(active.dir, active.manifest);
}

// --------------------------------------------------------------------------- init

function cmdInit(args: string[]): number {
  const opts = flags(args, ["mode", "name"]);
  if (opts === null || opts["mode"] === undefined) return usageError(`init: ${USAGE.split("\n")[1]!.trim()}`);
  if (!SESSION_MODES.includes(opts["mode"] as SessionMode)) {
    return usageError(`init: unknown mode ${JSON.stringify(opts["mode"])} (modes: ${SESSION_MODES.join(", ")})`);
  }
  const mode = opts["mode"] as SessionMode;

  const warnings: string[] = [];
  const held = activeRun(root);
  if (held !== null) {
    // A lock is stale when its run is gone, its session is unreadable, it already reached
    // done, or it sat idle past STALE_IDLE_MS — even paused (ADR 0033: stale sessions
    // auto-release, they must not hold the repo hostage).
    let stale = !runExists(root, held);
    if (!stale) {
      try {
        const heldSession = checkSession(JSON.parse(readFileSync(join(root, SUSTAIN_DIR, held, SESSION_FILE), "utf8")));
        stale = heldSession.phase === "done" || isSessionStale(heldSession);
      } catch {
        stale = true;
      }
    }
    if (!stale) {
      return report(1, { status: "active", run: `${SUSTAIN_DIR}/${held}`, message: `session ${held} is still active` });
    }
    warnings.push(`released the stale lock of ${held}`);
  }

  // Collect git facts before `.sustain/` exists so the session's own files are not
  // counted as the user's uncommitted work in the dirty warning (ADR 0029).
  const git = collectGitFacts(root);
  const run = createRunFolder(root, slugify(opts["name"] ?? "", basename(root)), runTimestamp(new Date()), {
    dir: SUSTAIN_DIR,
    prefix: mode,
  });
  const dir = join(root, SUSTAIN_DIR, run);
  const session = newSession(mode);
  saveSession(dir, session);
  saveManifest(dir, newManifest());
  appendEvent(dir, { type: "init", mode });
  writeFileSync(join(root, SUSTAIN_DIR, ACTIVE_FILE), `${run}\n`);

  if (git !== null && git.dirtyCount > 0) {
    warnings.push(`repository has ${git.dirtyCount} uncommitted change(s); bug restore works on recorded hunks, not git`);
  }
  return report(0, {
    status: "ok",
    run: `${SUSTAIN_DIR}/${run}`,
    sessionFile: `${SUSTAIN_DIR}/${run}/${SESSION_FILE}`,
    mode,
    phase: session.phase,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty },
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

// --------------------------------------------------------------------------- status

function cmdStatus(args: string[]): number {
  if (args.length !== 0) return usageError(`status: takes no arguments`);
  const active = loadActive();
  if (active === null) return report(0, { status: "none" });
  const { session, manifest } = active;
  const step = session.steps[session.stepIndex];
  return report(0, {
    status: "ok",
    run: `${SUSTAIN_DIR}/${active.run}`,
    mode: session.mode,
    phase: session.phase,
    ...(session.pausedFrom !== undefined ? { pausedFrom: session.pausedFrom } : {}),
    stepIndex: session.stepIndex,
    stepsTotal: session.steps.length,
    step: step ? { title: step.title, files: step.files } : null,
    bugs: session.bugs,
    found: session.found,
    fixed: session.fixed,
    restored: manifest.bugs.filter((b) => b.restored === true).length,
    score: session.score,
    stale: isSessionStale(session),
    idleMs: sessionIdleMs(session),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
}

// --------------------------------------------------------------------------- plan

function parseSteps(json: string): SessionStep[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`--steps is not valid JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(value) || value.length === 0) throw new Error("--steps must be a non-empty JSON array");
  return value.map((item, i): SessionStep => {
    if (typeof item === "string") {
      if (item === "") throw new Error(`steps[${i}] is an empty title`);
      return { title: item, files: [] };
    }
    if (typeof item !== "object" || item === null) throw new Error(`steps[${i}] is not a string or object`);
    const record = item as Record<string, unknown>;
    if (typeof record["title"] !== "string" || record["title"] === "") throw new Error(`steps[${i}] has no title`);
    const files = record["files"] ?? [];
    if (!Array.isArray(files) || files.some((f) => typeof f !== "string")) throw new Error(`steps[${i}].files is not a string list`);
    const step: SessionStep = { title: record["title"], files: files as string[] };
    if (typeof record["check"] === "string") step.check = record["check"];
    return step;
  });
}

function cmdPlan(args: string[]): number {
  const opts = flags(args, ["steps"]);
  if (opts === null || opts["steps"] === undefined) return usageError(`plan: ${USAGE.split("\n")[2]!.trim()}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "clarify") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `plan runs in clarify, not ${session.phase}` });
  }
  let steps: SessionStep[];
  try {
    steps = parseSteps(opts["steps"]);
  } catch (error) {
    return usageError(`plan: ${(error as Error).message}`);
  }
  session.steps = steps;
  session.stepIndex = 0;
  session.phase = "implementing";
  appendEvent(active.dir, { type: "planned", steps: steps.length });
  save(active);
  return report(0, { status: "ok", phase: session.phase, steps: steps.length });
}

// -------------------------------------------------------------------------- inject

function cmdInject(args: string[]): number {
  const opts = flags(args, ["file", "line", "kind"]);
  if (opts === null || opts["file"] === undefined || opts["line"] === undefined || opts["kind"] === undefined) {
    return usageError(`inject: ${USAGE.split("\n")[3]!.trim()}`);
  }
  if (!MUTATION_KINDS.includes(opts["kind"] as MutationKind)) {
    return usageError(`inject: unknown kind ${JSON.stringify(opts["kind"])} (kinds: ${MUTATION_KINDS.join(", ")})`);
  }
  const kind = opts["kind"] as MutationKind;
  const line = Number(opts["line"]);
  if (!Number.isInteger(line)) return usageError(`inject: --line must be a positive integer, got ${JSON.stringify(opts["line"])}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "implementing" && session.phase !== "hunting") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `inject runs in implementing or hunting, not ${session.phase}` });
  }

  let target: { abs: string; rel: string };
  try {
    target = repoFile(opts["file"]!);
  } catch (error) {
    return report(1, { status: "error", message: (error as Error).message });
  }
  if (!JS_TS.test(target.rel)) {
    return report(1, { status: "error", message: `${target.rel}: mutations are JS/TS-only in v1` });
  }

  const pristineText = readFileSync(target.abs, "utf8");
  let mutation: MutationResult;
  try {
    mutation = mutateFile(target.abs, line, kind);
  } catch (error) {
    return report(1, { status: "error", file: target.rel, message: (error as Error).message });
  }

  const bug: ManifestBug = {
    id: `bug-${manifest.bugs.length + 1}`,
    step: session.stepIndex,
    file: target.rel,
    region: mutation.region,
    kind,
    pristineHunk: mutation.pristineHunk,
    buggyHunk: mutation.buggyHunk,
    twins: hunkCount(pristineText, mutation.buggyHunk),
    found: false,
    fixed: false,
    hints: [],
  };
  manifest.bugs.push(bug);
  session.bugs = manifest.bugs.length;
  session.phase = "hunting";
  appendEvent(active.dir, { type: "injected", bug: bug.id, step: bug.step });
  save(active);
  return report(0, { status: "ok", bug: bug.id, file: bug.file, region: bug.region, kind, phase: session.phase, bugs: session.bugs });
}

// -------------------------------------------------------------------------- report

function cmdReport(args: string[]): number {
  const opts = flags(args, ["file"]);
  if (opts === null || opts["file"] === undefined) return usageError(`report: ${USAGE.split("\n")[5]!.trim()}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  const rel = looseRel(opts["file"]!);
  const bug = rel === null ? undefined : manifest.bugs.find((b) => b.file === rel && !b.found && !b.fixed && b.restored !== true);
  if (bug === undefined) {
    return report(1, { status: "miss", file: opts["file"], message: `${opts["file"]} holds no unreported seeded bug` });
  }
  bug.found = true;
  session.found = manifest.bugs.filter((b) => b.found).length;
  appendEvent(active.dir, { type: "found", bug: bug.id });
  save(active);
  return report(0, { status: "found", bug: bug.id, found: session.found, bugs: session.bugs });
}

// --------------------------------------------------------------------------- hint

function cmdHint(args: string[]): number {
  const opts = flags(args, ["level", "bug", "file"]);
  if (opts === null || opts["level"] === undefined) return usageError(`hint: ${USAGE.split("\n")[6]!.trim()}`);
  const level = Number(opts["level"]);
  if (!HINT_LEVELS.includes(level as HintLevel)) return usageError(`hint: --level must be 1, 2 or 3`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  const live = (b: ManifestBug): boolean => !b.fixed && b.restored !== true;

  let bug: ManifestBug | undefined;
  if (opts["bug"] !== undefined) {
    bug = manifest.bugs.find((b) => b.id === opts["bug"]);
    if (bug === undefined) return report(1, { status: "no-bug", message: `unknown bug ${JSON.stringify(opts["bug"])}` });
    if (!live(bug)) return report(1, { status: "no-bug", bug: bug.id, message: `${bug.id} is already ${bug.fixed ? "fixed" : "restored"}` });
  } else if (opts["file"] !== undefined) {
    const rel = looseRel(opts["file"]!);
    bug = rel === null ? undefined : manifest.bugs.find((b) => b.file === rel && live(b));
    if (bug === undefined) return report(1, { status: "no-bug", file: opts["file"], message: `${opts["file"]} holds no unfixed seeded bug` });
  } else {
    bug = manifest.bugs.find((b) => b.step === session.stepIndex && live(b));
    if (bug === undefined) return report(1, { status: "no-bug", message: "no unfixed bug to hint" });
  }

  bug.hints.push(level as HintLevel);
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "hint", bug: bug.id, level, cost: HINT_COST[level as HintLevel] });
  save(active);
  return report(0, { status: "ok", bug: bug.id, level, score: session.score });
}

// -------------------------------------------------------------------------- verify

/** `node --check` on .mjs/.cjs; other extensions defer to `--check-cmd` (ADR 0037). */
function fileParses(abs: string): { ok: boolean; message?: string } {
  if (!NODE_CHECKABLE.test(abs)) return { ok: true };
  const check = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8" });
  if (check.status === 0) return { ok: true };
  return { ok: false, message: (check.stderr || check.stdout || "syntax error").trim().split("\n")[0] };
}

function cmdVerify(args: string[]): number {
  const opts = flags(args, ["check-cmd"]);
  if (opts === null) return usageError(`verify: ${USAGE.split("\n")[7]!.trim()}`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase === "done") return report(0, { status: "ok", phase: session.phase, stepIndex: session.stepIndex });
  if (session.phase === "clarify") {
    return report(1, { status: "bad-phase", phase: session.phase, message: "nothing to verify before `plan`" });
  }

  const pending = manifest.bugs.filter((b) => !b.fixed && b.restored !== true);
  const newlyFixed: string[] = [];
  for (const bug of pending) {
    const abs = join(root, bug.file);
    if (!existsSync(abs)) return report(1, { status: "error", file: bug.file, message: `${bug.file} no longer exists — restore the file and try again` });
    const text = readFileSync(abs, "utf8");
    if (bugStillPresent(text, bug)) continue;
    const parsed = fileParses(abs);
    if (!parsed.ok) return report(1, { status: "unparseable", file: bug.file, bug: bug.id, message: parsed.message });
    bug.fixed = true;
    newlyFixed.push(bug.id);
    appendEvent(active.dir, { type: "fixed", bug: bug.id });
  }
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;

  const remaining = pending.length - newlyFixed.length;
  if (remaining > 0) {
    session.score = scoreSession(manifest);
    save(active);
    return report(1, { status: "still-buggy", remaining, fixed: newlyFixed });
  }

  if (opts["check-cmd"] !== undefined) {
    const check = spawnSync(opts["check-cmd"], { cwd: root, shell: true, encoding: "utf8" });
    if (check.status !== 0) {
      const output = `${check.stdout ?? ""}${check.stderr ?? ""}`.trim();
      session.score = scoreSession(manifest);
      save(active);
      return report(1, {
        status: "check-failed",
        command: opts["check-cmd"],
        exitCode: check.status,
        output: output.slice(-CHECK_OUTPUT_TAIL),
      });
    }
  }

  const step = session.stepIndex;
  appendEvent(active.dir, { type: "verified", step });
  session.stepIndex += 1;
  session.phase = session.stepIndex >= session.steps.length ? "done" : "implementing";
  session.score = scoreSession(manifest);
  save(active);
  return report(0, { status: "ok", phase: session.phase, stepIndex: session.stepIndex, step, fixed: newlyFixed });
}

// ------------------------------------------------------------------------- complete

function cmdComplete(args: string[]): number {
  if (args.length !== 0) return usageError(`complete: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const parked = ifPaused(session);
  if (parked !== null) return parked;
  if (session.phase !== "done") {
    const remaining = manifest.bugs.filter((b) => !b.fixed && b.restored !== true).length;
    return report(1, { status: "not-complete", phase: session.phase, remaining, message: `phase is ${session.phase}; verify every step first` });
  }
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "completed", score: session.score });
  dropPristineSnapshots(manifest);
  save(active);
  unlinkSync(join(root, SUSTAIN_DIR, ACTIVE_FILE));
  return report(0, { status: "completed", score: session.score, found: session.found, fixed: session.fixed, bugs: session.bugs, run: `${SUSTAIN_DIR}/${active.run}` });
}

// ------------------------------------------------------------------ pause / resume

function cmdPause(args: string[]): number {
  if (args.length !== 0) return usageError(`pause: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  if (session.phase === "paused") return report(1, { status: "paused", phase: "paused", message: "session is already paused" });
  if (session.phase === "done") return report(1, { status: "bad-phase", phase: "done", message: "a finished session cannot pause — run `complete`" });
  const from = session.phase as LivePhase;
  session.pausedFrom = from;
  session.phase = "paused";
  appendEvent(active.dir, { type: "paused", from });
  save(active);
  return report(0, { status: "ok", phase: "paused", pausedFrom: from });
}

function cmdResume(args: string[]): number {
  if (args.length !== 0) return usageError(`resume: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session } = active;
  if (session.phase !== "paused") {
    return report(1, { status: "bad-phase", phase: session.phase, message: `resume runs while paused, not ${session.phase}` });
  }
  const to = session.pausedFrom ?? "implementing";
  delete session.pausedFrom;
  session.phase = to;
  appendEvent(active.dir, { type: "resumed", to });
  save(active);
  return report(0, { status: "ok", phase: to });
}

// --------------------------------------------------------------- restore / abandon

interface RestoreResult {
  /** Bugs whose buggy hunk was overwritten with the recorded pristine hunk. */
  restored: string[];
  /** Bugs whose hunk was already gone — fixed by the same rule `verify` applies. */
  fixed: string[];
  /** Bugs skipped because their file no longer exists (marked restored, nothing written). */
  missing: string[];
  /** Bugs still present but unrestorable (pristine snapshot already deleted). */
  unrestorable: string[];
}

/**
 * The only revert `restore`/`abandon` ever performs: writes each recorded `pristineHunk`
 * back over its still-seeded `buggyHunk` (ADR 0033 — only seeded hunks, never a git reset
 * and never user work around the seeded region).
 */
function restoreSeededBugs(runDir: string, bugs: ManifestBug[]): RestoreResult {
  const result: RestoreResult = { restored: [], fixed: [], missing: [], unrestorable: [] };
  for (const bug of bugs) {
    const abs = join(root, bug.file);
    if (!existsSync(abs)) {
      bug.restored = true;
      result.missing.push(bug.id);
      continue;
    }
    const text = readFileSync(abs, "utf8");
    if (!bugStillPresent(text, bug)) {
      bug.fixed = true;
      appendEvent(runDir, { type: "fixed", bug: bug.id });
      result.fixed.push(bug.id);
      continue;
    }
    const pristine = bug.pristineHunk;
    if (pristine === undefined) {
      result.unrestorable.push(bug.id);
      continue;
    }
    const next = restoreHunk(text, { ...bug, pristineHunk: pristine });
    if (next === null) continue; // unreachable while bugStillPresent; defensive
    writeFileSync(abs, next);
    bug.restored = true;
    result.restored.push(bug.id);
  }
  return result;
}

/** `complete`/`abandon` delete the pristine snapshots; the audit keeps `buggyHunk`. */
function dropPristineSnapshots(manifest: Manifest): void {
  for (const bug of manifest.bugs) delete bug.pristineHunk;
}

/** Bugs that still hold a seeded mutation — the only ones restore ever touches. */
function seededBugs(manifest: Manifest): ManifestBug[] {
  return manifest.bugs.filter((b) => !b.fixed && b.restored !== true);
}

function cmdRestore(args: string[]): number {
  const opts = flags(args, ["bug"]);
  if (opts === null) return usageError(`restore: [--bug <id>]`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  if (session.phase === "done") {
    return report(1, { status: "bad-phase", phase: "done", message: "the session is finished — nothing left to restore" });
  }
  let targets = seededBugs(manifest);
  if (opts["bug"] !== undefined) {
    targets = targets.filter((b) => b.id === opts["bug"]);
    if (targets.length === 0) return report(1, { status: "no-bug", bug: opts["bug"], message: `no seeded bug ${JSON.stringify(opts["bug"])} to restore` });
  }
  const result = restoreSeededBugs(active.dir, targets);
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;
  session.score = scoreSession(manifest);
  appendEvent(active.dir, { type: "restored", ...result });
  save(active);
  return report(0, { status: "ok", phase: session.phase, ...result });
}

function cmdAbandon(args: string[]): number {
  if (args.length !== 0) return usageError(`abandon: takes no arguments`);
  const active = loadActive();
  if (active === null) return noSession();
  const { session, manifest } = active;
  const result = restoreSeededBugs(active.dir, seededBugs(manifest));
  session.fixed = manifest.bugs.filter((b) => b.fixed).length;
  session.score = scoreSession(manifest);
  session.phase = "done";
  delete session.pausedFrom;
  appendEvent(active.dir, { type: "abandoned", ...result, score: session.score });
  dropPristineSnapshots(manifest);
  save(active);
  unlinkSync(join(root, SUSTAIN_DIR, ACTIVE_FILE));
  return report(0, { status: "abandoned", score: session.score, ...result, run: `${SUSTAIN_DIR}/${active.run}` });
}

// ----------------------------------------------------------------------------- main

const COMMANDS: Record<string, (args: string[]) => number> = {
  init: cmdInit,
  status: cmdStatus,
  plan: cmdPlan,
  inject: cmdInject,
  report: cmdReport,
  hint: cmdHint,
  verify: cmdVerify,
  complete: cmdComplete,
  pause: cmdPause,
  resume: cmdResume,
  restore: cmdRestore,
  abandon: cmdAbandon,
};

function main(args: string[]): number {
  const command = args[0];
  if (command === undefined) return usageError(USAGE);
  const handler = COMMANDS[command];
  if (handler === undefined) return usageError(`unknown command ${JSON.stringify(command)}\n${USAGE}`);
  try {
    return handler(args.slice(1));
  } catch (error) {
    return usageError(`${command}: ${(error as Error).message}`);
  }
}

// Set the code instead of calling process.exit(): stdout to a pipe is asynchronous on macOS.
process.exitCode = main(process.argv.slice(2));
