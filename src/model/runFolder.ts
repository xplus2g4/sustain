// Run folders under `<repo>/.archify/` (FR-RF-01, FR-VAL-01, FR-VAL-06), ported from the
// prototype's `archalign-repo/src/storage.rs` (slugify, run folders, atomic writes).
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

export const ARCHIFY_DIR = ".archify";
export const DRAFT_FILE = "draft.json";
export const CANDIDATE_FILE = "candidate.json";
/** Longest run-folder slug. */
export const SLUG_MAX = 40;
/** `<prefix>-<slug>-<YYYYMMDD-HHMMSS>[-N]` — the generic run-folder name shape. */
export const RUN_NAME_PATTERN = /^([a-z0-9]+)-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;
/** `architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]` */
export const RUN_FOLDER_PATTERN = /^architecture-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;

const MAX_COLLISIONS = 1000;

function kebab(text: string): string {
  let out = "";
  for (const ch of text) {
    if (/^[A-Za-z0-9]$/.test(ch)) out += ch.toLowerCase();
    else if (out !== "" && !out.endsWith("-")) out += "-";
    if (out.length > SLUG_MAX) break;
  }
  if (out.length > SLUG_MAX) {
    const head = out.slice(0, SLUG_MAX);
    const lastDash = head.lastIndexOf("-");
    out = out[SLUG_MAX] === "-" || lastDash < 0 ? head : head.slice(0, lastDash);
  }
  return out.replace(/-+$/, "");
}

/**
 * The run-folder slug: lowercase ASCII kebab-case (`[a-z0-9-]`) of the focus, else of the
 * repo folder name, else `repo`. Runs of other characters become one `-`; over
 * {@link SLUG_MAX} characters it is cut at the last word boundary that fits (hard-cut when
 * the first word alone is longer).
 */
export function slugify(focus: string, repoFolderName: string): string {
  return kebab(focus) || kebab(repoFolderName) || "repo";
}

/** `YYYYMMDD-HHMMSS` of `date` in local time. */
export function runTimestamp(date: Date): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-` +
    `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  );
}

export interface RunName {
  /** The run-folder prefix (`architecture`, a session mode, …); `[a-z0-9]+`, never a `-`. */
  prefix: string;
  slug: string;
  /** `YYYYMMDD-HHMMSS` */
  timestamp: string;
  /** Collision suffix `N` of `-N`, 1 when absent. */
  n: number;
}

export function parseRunName(name: string): RunName | null {
  const match = RUN_NAME_PATTERN.exec(name);
  if (!match) return null;
  return { prefix: match[1]!, slug: match[2]!, timestamp: match[3]!, n: match[4] === undefined ? 1 : Number(match[4]) };
}

export interface RunFolderName {
  slug: string;
  /** `YYYYMMDD-HHMMSS` */
  timestamp: string;
  /** Collision suffix `N` of `-N`, 1 when absent. */
  n: number;
}

/** The `architecture-…` specialisation of {@link parseRunName} for `.archify` runs. */
export function parseRunFolderName(name: string): RunFolderName | null {
  const parsed = parseRunName(name);
  if (parsed === null || parsed.prefix !== "architecture") return null;
  return { slug: parsed.slug, timestamp: parsed.timestamp, n: parsed.n };
}

function isInside(parentReal: string, childReal: string): boolean {
  return childReal.startsWith(parentReal.endsWith(sep) ? parentReal : parentReal + sep);
}

export interface RunFolderOptions {
  /** Directory under the root that holds run folders; default {@link ARCHIFY_DIR}. */
  dir?: string;
  /**
   * Run-name prefix for `<prefix>-<slug>-<timestamp>`, one `[a-z0-9]+` segment so the name
   * stays unambiguous; default `architecture`. Session runs pass the mode here (ADR 0034).
   */
  prefix?: string;
}

/**
 * Creates `<root>/<dir>/` if needed and a fresh `<prefix>-<slug>-<timestamp>` folder in it,
 * appending `-2`, `-3`, … when the name is taken. Returns the folder name. Throws when the
 * base directory is not a folder inside the root or the name is not one path segment.
 */
export function createRunFolder(root: string, slug: string, timestamp: string, options: RunFolderOptions = {}): string {
  const dir = options.dir ?? ARCHIFY_DIR;
  const prefix = options.prefix ?? "architecture";
  if (dir === "." || dir === ".." || /[/\\]/.test(dir)) throw new Error(`"${dir}" is not a valid run folder directory`);
  if (!/^[a-z0-9]+$/.test(prefix)) throw new Error(`"${prefix}" is not a valid run folder prefix`);
  const base = `${prefix}-${slug}-${timestamp}`;
  if (!parseRunName(base) || /[/\\]/.test(base)) throw new Error(`"${base}" is not a valid run folder name`);
  const parent = join(root, dir);
  mkdirSync(parent, { recursive: true });
  const parentReal = realpathSync(parent);
  if (!isInside(realpathSync(root), parentReal) || !statSync(parentReal).isDirectory()) {
    throw new Error(`${dir} must be a folder inside the repository root`);
  }
  for (let n = 1; n <= MAX_COLLISIONS; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(join(parentReal, name));
      return name;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`can't create ${dir}/${base}: too many folders with that name`);
}

export interface DraftLocation {
  /** Absolute repo root `<R>`. */
  root: string;
  /** Run folder name. */
  run: string;
  /** Slug parsed from the run folder name. */
  slug: string;
  /** Absolute path of `draft.json`. */
  draft: string;
}

/**
 * Interprets a validator argument (absolute or relative to `cwd`) as
 * `<R>/.archify/<run>/draft.json`, with `<run>` a run folder name. Throws with a usage
 * message otherwise.
 */
export function locateDraft(arg: string, cwd: string): DraftLocation {
  const draft = resolve(cwd, arg);
  const runDir = dirname(draft);
  const archify = dirname(runDir);
  const run = basename(runDir);
  if (basename(draft) !== DRAFT_FILE || basename(archify) !== ARCHIFY_DIR) {
    throw new Error(`expected a path of the form <repo>/${ARCHIFY_DIR}/<run>/${DRAFT_FILE}, got ${arg}`);
  }
  const parsed = parseRunFolderName(run);
  if (!parsed) throw new Error(`run folder "${run}" does not match architecture-<slug>-<YYYYMMDD-HHMMSS>[-N]`);
  return { root: dirname(archify), run, slug: parsed.slug, draft };
}

/**
 * Publishes `content` as `candidate.json` next to `draft`: written to a temp file in the
 * same folder, flushed, renamed over the target, then the draft is deleted.
 */
export function publishCandidate(draft: string, content: string): void {
  const dir = dirname(draft);
  const target = join(dir, CANDIDATE_FILE);
  const temp = join(dir, `.${CANDIDATE_FILE}.tmp-${process.pid}-${Date.now()}`);
  try {
    const fd = openSync(temp, "wx");
    try {
      writeSync(fd, content);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  unlinkSync(draft);
}
