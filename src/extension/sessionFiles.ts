// Read-side aggregation behind the session webview: lists `.sustain/<run>` folders and
// builds the panel's snapshot from `session.json` + `events.jsonl` ONLY — `manifest.json`
// is never opened (the webview trust boundary of ADR 0034). No `vscode` import.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { leaderboardEntry, parseLedger, rankLeaderboard, type LeaderboardEntry, type LedgerEvent } from "../model/leaderboard";
import { parseRunName, type RunName } from "../model/runFolder";
import { ACTIVE_FILE, activeRun, checkSession, EVENTS_FILE, SESSION_FILE, SUSTAIN_DIR, type SessionState } from "../model/session";

/** `.sustain` run folders holding a `session.json`, newest timestamp (then `-N`) first. */
export function listSessionRuns(root: string): string[] {
  const dir = join(root, SUSTAIN_DIR);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map((name): { name: string; parsed: RunName | null } => ({ name, parsed: parseRunName(name) }))
    .filter((entry): entry is { name: string; parsed: RunName } => entry.parsed !== null && existsSync(join(dir, entry.name, SESSION_FILE)))
    .sort((a, b) => b.parsed.timestamp.localeCompare(a.parsed.timestamp) || b.parsed.n - a.parsed.n)
    .map((entry) => entry.name);
}

/** Parsed `session.json`, or `null` when missing/corrupt — the ledger still renders. */
function readSession(dir: string): SessionState | null {
  try {
    return checkSession(JSON.parse(readFileSync(join(dir, SESSION_FILE), "utf8")));
  } catch {
    return null;
  }
}

/** Parsed ledger lines; an unreadable `events.jsonl` aggregates as an empty list. */
function readEvents(dir: string): LedgerEvent[] {
  try {
    return parseLedger(readFileSync(join(dir, EVENTS_FILE), "utf8"));
  } catch {
    return [];
  }
}

/** What the session panel renders: the run it shows plus the full leaderboard. */
export interface SessionSnapshot {
  /** `.sustain/active` when it names a live run folder, else `null`. */
  activeRun: string | null;
  /** The run to display — the active one, else the newest — `null` when none exist. */
  shown: { run: string; session: SessionState | null } | null;
  leaderboard: LeaderboardEntry[];
  /** Sum of every leaderboard score — points accumulate across runs (ADR 0034). */
  totalScore: number;
}

export function readSessionSnapshot(root: string): SessionSnapshot {
  const dir = join(root, SUSTAIN_DIR);
  const runs = listSessionRuns(root);
  const held = activeRun(root);
  const live = held !== null && runs.includes(held) ? held : null;
  const shownName = live ?? runs[0] ?? null;
  const leaderboard = rankLeaderboard(
    runs.map((run) => leaderboardEntry(run, readSession(join(dir, run)), readEvents(join(dir, run)), run === live)),
  );
  return {
    activeRun: live,
    shown: shownName === null ? null : { run: shownName, session: readSession(join(dir, shownName)) },
    leaderboard,
    totalScore: leaderboard.reduce((sum, entry) => sum + entry.score, 0),
  };
}

/** The `.sustain/active` lock path — the session watcher re-reads the snapshot when it moves. */
export function activeLockPath(root: string): string {
  return join(root, SUSTAIN_DIR, ACTIVE_FILE);
}
