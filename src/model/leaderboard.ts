// The local leaderboard (ADR 0034): aggregates `.sustain/<run>/events.jsonl` plus the run's
// public `session.json` into one ranked row per session. Pure functions — the extension
// host reads the files; `manifest.json` is never touched (the webview trust boundary).
import { parseRunName } from "./runFolder";
import type { SessionState } from "./session";

/** One `events.jsonl` line, tolerantly read: unknown fields pass through unchecked. */
export interface LedgerEvent {
  ts: string;
  type: string;
  score?: number;
  bug?: string;
  level?: number;
  [detail: string]: unknown;
}

export type LeaderboardStatus = "completed" | "abandoned" | "active" | "interrupted";

/** One leaderboard row — everything the webview is allowed to see. */
export interface LeaderboardEntry {
  /** Bare run folder name, e.g. `bugfix-demo-20261014-235718`. */
  run: string;
  /** The run-name prefix (session mode). */
  mode: string;
  status: LeaderboardStatus;
  score: number;
  bugs: number;
  found: number;
  fixed: number;
  /** Sum of hint levels taken across the session's bugs. */
  hintCost: number;
  startedAt: string;
  /** When the session finished (completed/abandoned event) or last moved. */
  endedAt: string;
}

/**
 * Tolerant `events.jsonl` reader: each line is `JSON.parse`d; a line that is not an object
 * or lacks a string `type` is skipped, so a half-written final line cannot fail the board.
 */
export function parseLedger(text: string): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      const value: unknown = JSON.parse(trimmed);
      if (typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string") {
        events.push(value as LedgerEvent);
      }
    } catch {
      // skip the bad line
    }
  }
  return events;
}

/**
 * Builds the row for one run. `session` is the parsed `session.json` when readable;
 * `events` the parsed ledger; `isActive` marks the run `.sustain/active` still names.
 */
export function leaderboardEntry(run: string, session: SessionState | null, events: LedgerEvent[], isActive: boolean): LeaderboardEntry {
  const last = events.at(-1);
  const status: LeaderboardStatus =
    last?.type === "completed" ? "completed" : last?.type === "abandoned" ? "abandoned" : isActive ? "active" : "interrupted";
  const finalEvent = events.findLast((event) => event.type === "completed" || event.type === "abandoned");
  const parsed = parseRunName(run);
  return {
    run,
    mode: session?.mode ?? parsed?.prefix ?? "?",
    status,
    score: typeof finalEvent?.score === "number" ? finalEvent.score : (session?.score ?? 0),
    bugs: session?.bugs ?? events.filter((event) => event.type === "injected").length,
    found: session?.found ?? events.filter((event) => event.type === "found").length,
    fixed: session?.fixed ?? events.filter((event) => event.type === "fixed").length,
    hintCost: events.filter((event) => event.type === "hint").reduce((sum, event) => sum + (typeof event["cost"] === "number" ? event["cost"] : 0), 0),
    startedAt: session?.createdAt ?? events[0]?.ts ?? "",
    endedAt: finalEvent?.ts ?? last?.ts ?? session?.updatedAt ?? "",
  };
}

/** Leaderboard order: score desc, then most recently finished/active first, then run name. */
export function rankLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => b.score - a.score || b.endedAt.localeCompare(a.endedAt) || a.run.localeCompare(b.run));
}
