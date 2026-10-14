// The mutation engine that seeds bug-hunt bugs (ADR 0031): the agent chooses file, line
// and kind; the engine rewrites the first matching operator or keyword on that line —
// never inside a string or comment — and hands back the exact pristine and buggy hunks so
// the manifest can never disagree with the code. Pure functions over file text, plus a
// thin read/write wrapper. v1 is line-local JS/TS: no regex-literal or template-`${}`
// awareness (recorded in ADR 0038).
import { readFileSync, writeFileSync } from "node:fs";
import type { BugRegion, MutationKind } from "../../../model/session";

export interface MutationResult {
  /** The mutated line as a 1-based inclusive range (single-line hunks in v1). */
  region: BugRegion;
  /** The line before mutation. */
  pristineHunk: string;
  /** The mutated line; its absence is what `verify` checks for. */
  buggyHunk: string;
  /** Full file text after the mutation. */
  text: string;
}

/**
 * Per-line mask: `true` where a character is code, `false` inside `'…'`/`"…"`/`` `…` ``
 * strings, `//` line comments and `/* … *\/` block comments. Escaped characters keep their
 * quote's mask. Template-literal `${…}` contents count as string in v1 — conservative:
 * the engine simply will not mutate inside a template.
 */
function codeMask(line: string): boolean[] {
  const mask = new Array<boolean>(line.length).fill(true);
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quote !== null) {
      mask[i] = false;
      if (ch === "\\") {
        i += 1;
        if (i < line.length) mask[i] = false;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    const next = line[i + 1];
    if (ch === "/" && next === "/") {
      for (let j = i; j < line.length; j += 1) mask[j] = false;
      break;
    }
    if (ch === "/" && next === "*") {
      let j = i;
      while (j < line.length && !(line[j] === "*" && line[j + 1] === "/")) {
        mask[j] = false;
        j += 1;
      }
      if (j + 1 < line.length) {
        mask[j] = false;
        mask[j + 1] = false;
        j += 2;
      }
      i = j - 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      mask[i] = false;
      quote = ch;
    }
  }
  return mask;
}

interface Rule {
  find: RegExp;
  to: string;
}

/**
 * Ordered rewrite tables per kind (ADR 0038): the first rule with a code-region match on
 * the line wins, so a line with several candidates mutates deterministically. Off-by-one
 * shifts the bound (`<`→`<=`); flipped-comparison reverses the test (`===`→`!==`,
 * `<`→`>`); missing-await drops the keyword. Lookarounds keep `=>`, `<<`, `===` and `!==`
 * from being split mid-token.
 */
const RULES: Record<MutationKind, Rule[]> = {
  "off-by-one": [
    { find: /(?<![<>=!])<(?![<=])/g, to: "<=" },
    { find: /(?<![<>=!])<=/g, to: "<" },
    { find: /(?<![-=<>])>(?![=>])/g, to: ">=" },
    { find: /(?<![<>=!])>=/g, to: ">" },
  ],
  "flipped-comparison": [
    { find: /===/g, to: "!==" },
    { find: /!==/g, to: "===" },
    { find: /(?<![<>=!])<=/g, to: ">=" },
    { find: /(?<![<>=!])>=/g, to: "<=" },
    { find: /(?<![<>=!])<(?![<=])/g, to: ">" },
    { find: /(?<![-=<>])>(?![=>])/g, to: "<" },
    { find: /(?<![=!])==(?![=])/g, to: "!=" },
    { find: /!=(?![=])/g, to: "==" },
  ],
  "missing-await": [{ find: /(?<![.\w$])await\b\s*/g, to: "" }],
};

/** The first match of `rule` that lies entirely in code (not in a string or comment). */
function firstCodeMatch(line: string, mask: boolean[], rule: Rule): { start: number; end: number } | null {
  for (const match of line.matchAll(rule.find)) {
    const start = match.index;
    const end = start + match[0]!.length;
    let inCode = true;
    for (let i = start; i < end; i += 1) {
      if (!mask[i]) {
        inCode = false;
        break;
      }
    }
    if (inCode) return { start, end };
  }
  return null;
}

/** The line with its first matching target mutated, or `null` when the line has none. */
export function mutateLine(line: string, kind: MutationKind): string | null {
  const mask = codeMask(line);
  for (const rule of RULES[kind]) {
    const hit = firstCodeMatch(line, mask, rule);
    if (hit !== null) return line.slice(0, hit.start) + rule.to + line.slice(hit.end);
  }
  return null;
}

/**
 * Mutates `line` (1-based) of `text` for `kind`. Throws `line … is outside the file` or
 * `line … has no "<kind>" target` — the caller turns those into command failures.
 */
export function mutateText(text: string, line: number, kind: MutationKind): MutationResult {
  const lines = text.split("\n");
  if (!Number.isInteger(line) || line < 1 || line > lines.length) {
    throw new Error(`line ${line} is outside the file (${lines.length} lines)`);
  }
  const pristineHunk = lines[line - 1]!;
  const buggyHunk = mutateLine(pristineHunk, kind);
  if (buggyHunk === null || buggyHunk === pristineHunk) throw new Error(`line ${line} has no "${kind}" target`);
  lines[line - 1] = buggyHunk;
  return { region: { startLine: line, endLine: line }, pristineHunk, buggyHunk, text: lines.join("\n") };
}

/** Reads `path`, applies {@link mutateText} and writes the mutated text back. */
export function mutateFile(path: string, line: number, kind: MutationKind): MutationResult {
  const result = mutateText(readFileSync(path, "utf8"), line, kind);
  writeFileSync(path, result.text);
  return result;
}

/** How many trimmed lines of `text` equal `hunk` (trimmed). */
export function hunkCount(text: string, hunk: string): number {
  const trimmed = hunk.trim();
  if (trimmed === "") return 0;
  return text.split("\n").filter((line) => line.trim() === trimmed).length;
}

/**
 * Whether a seeded bug still shows in `text`: more trimmed `buggyHunk` lines than the
 * `twins` that pre-existed at injection, so a pre-existing identical line cannot pass a
 * fix off as done (ADR 0038).
 */
export function bugStillPresent(text: string, bug: { buggyHunk: string; twins: number }): boolean {
  return hunkCount(text, bug.buggyHunk) > bug.twins;
}

/**
 * `restore`/`abandon` (ADR 0033): writes `pristineHunk` back over the still-seeded
 * `buggyHunk` — the trimmed-matching line nearest `region.startLine`, which is the seeded
 * instance even when identical twins pre-existed. Returns the new file text, or `null`
 * when the seeded hunk is already absent (the file is never touched: only the recorded
 * hunk is restored, never a user edit elsewhere and never a pre-existing twin).
 */
export function restoreHunk(text: string, bug: { buggyHunk: string; pristineHunk: string; region: BugRegion; twins: number }): string | null {
  if (!bugStillPresent(text, bug)) return null;
  const trimmed = bug.buggyHunk.trim();
  const lines = text.split("\n");
  let best = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const distance = Math.abs(i + 1 - bug.region.startLine);
    if (lines[i]!.trim() === trimmed && (best === -1 || distance < Math.abs(best + 1 - bug.region.startLine))) best = i;
  }
  if (best === -1) return null;
  lines[best] = bug.pristineHunk;
  return lines.join("\n");
}
