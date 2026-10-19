// src/agent/repo-facts.ts
import { basename as basename2 } from "node:path";

// src/model/git.ts
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
var MAX_DIRTY_PATHS = 200;
var GIT_READS = {
  topLevel: ["--no-optional-locks", "rev-parse", "--show-toplevel"],
  head: ["--no-optional-locks", "rev-parse", "--verify", "--quiet", "HEAD"],
  origin: ["--no-optional-locks", "config", "--get", "remote.origin.url"],
  status: ["--no-optional-locks", "status", "--porcelain=v1", "-z"]
};
function run(program, root, argv) {
  const result = spawnSync(program, argv, {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.toString("utf8");
}
function sanitizeOrigin(url) {
  const match = /^(https?):\/\/(.*)$/is.exec(url);
  if (!match) return url;
  const scheme = match[1];
  const rest = match[2];
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd < 0 ? "" : rest.slice(authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  return `${scheme}://${host}${tail}`;
}
function parsePorcelainZ(output) {
  const fields = output.split("\0");
  const paths = [];
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i];
    if (record.length < 4) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) i += 1;
  }
  return paths;
}
function collectGitFacts(root, program = "git") {
  const top = run(program, root, GIT_READS.topLevel);
  if (top === null) return null;
  try {
    if (realpathSync(top.trim()) !== realpathSync(root)) return null;
  } catch {
    return null;
  }
  const head = run(program, root, GIT_READS.head)?.trim().toLowerCase();
  if (head === void 0 || !/^[0-9a-f]{40}$/.test(head)) return null;
  const origin = run(program, root, GIT_READS.origin)?.trim() ?? "";
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "");
  return {
    head,
    origin: origin === "" ? null : sanitizeOrigin(origin),
    dirtyCount: allDirty.length,
    dirty: allDirty.slice(0, MAX_DIRTY_PATHS)
  };
}

// src/model/runFolder.ts
import { closeSync, fsyncSync, mkdirSync, openSync, realpathSync as realpathSync2, renameSync, rmSync, statSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
var ARCHIFY_DIR = ".archify";
var DRAFT_FILE = "draft.json";
var SLUG_MAX = 40;
var RUN_FOLDER_PATTERN = /^architecture-(.+)-(\d{8}-\d{6})(?:-(\d+))?$/;
var MAX_COLLISIONS = 1e3;
function kebab(text) {
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
function slugify(focus, repoFolderName) {
  return kebab(focus) || kebab(repoFolderName) || "repo";
}
function runTimestamp(date) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}
function parseRunFolderName(name) {
  const match = RUN_FOLDER_PATTERN.exec(name);
  if (!match) return null;
  return { slug: match[1], timestamp: match[2], n: match[3] === void 0 ? 1 : Number(match[3]) };
}
function isInside(parentReal, childReal) {
  return childReal.startsWith(parentReal.endsWith(sep) ? parentReal : parentReal + sep);
}
function createRunFolder(root, slug, timestamp) {
  const base = `architecture-${slug}-${timestamp}`;
  if (!parseRunFolderName(base) || /[/\\]/.test(base)) throw new Error(`"${base}" is not a valid run folder name`);
  const archify = join(root, ARCHIFY_DIR);
  mkdirSync(archify, { recursive: true });
  const archifyReal = realpathSync2(archify);
  if (!isInside(realpathSync2(root), archifyReal) || !statSync(archifyReal).isDirectory()) {
    throw new Error(`${ARCHIFY_DIR} must be a folder inside the repository root`);
  }
  for (let n = 1; n <= MAX_COLLISIONS; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      mkdirSync(join(archifyReal, name));
      return name;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`can't create ${ARCHIFY_DIR}/${base}: too many folders with that name`);
}

// src/agent/repo-facts.ts
function main(args) {
  let focus = "";
  if (args.length === 2 && args[0] === "--focus") focus = args[1];
  else if (args.length !== 0) {
    process.stderr.write("repo-facts.mjs: usage: node repo-facts.mjs [--focus <text>]\n");
    return 2;
  }
  const root = process.cwd();
  let run2;
  try {
    run2 = createRunFolder(root, slugify(focus, basename2(root)), runTimestamp(/* @__PURE__ */ new Date()));
  } catch (error) {
    process.stderr.write(`repo-facts.mjs: ${error.message}
`);
    return 2;
  }
  const git = collectGitFacts(root);
  const facts = {
    root,
    runFolder: `${ARCHIFY_DIR}/${run2}`,
    draft: `${ARCHIFY_DIR}/${run2}/${DRAFT_FILE}`,
    git: git && { head: git.head, origin: git.origin, dirtyCount: git.dirtyCount, dirty: git.dirty }
  };
  process.stdout.write(`${JSON.stringify(facts, null, 2)}
`);
  return 0;
}
process.exitCode = main(process.argv.slice(2));
