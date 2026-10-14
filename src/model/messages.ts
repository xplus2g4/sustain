// Messages between the extension host and the webviews (FR-VIEW-04). Types only.
import type { LeaderboardEntry } from "./leaderboard";

/** Host → architecture webview. `doc` is the parsed diagram JSON; `file` its absolute path. */
export type HostMessage = { type: "load"; doc: unknown; file: string } | { type: "empty"; message: string };

/** Architecture webview → host. `index` is into the component's tolerant `sources` list. */
export type WebviewMessage = { type: "ready" } | { type: "openSource"; componentId: string; index: number };

/** What the session webview renders — public `session.json` fields plus the leaderboard. */
export interface SessionView {
  /** The shown run folder name (`.sustain/<run>`), or `null` when no session exists. */
  run: string | null;
  /** Whether `.sustain/active` names a live run — `false` means the shown run is history. */
  live: boolean;
  mode: string;
  phase: string;
  /** Live phase a paused session returns to, when set. */
  pausedFrom: string | null;
  stepIndex: number;
  stepsTotal: number;
  stepTitle: string | null;
  bugs: number;
  found: number;
  fixed: number;
  score: number;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
  /** Host time at send — the webview's elapsed timer offsets from this. */
  serverNow: string;
  leaderboard: LeaderboardEntry[];
  /** Sum of every leaderboard score — the user's accumulated points across runs. */
  totalScore: number;
}

/** Host → session webview. */
export type SessionHostMessage = { type: "session"; view: SessionView } | { type: "empty"; message: string };

/** Session webview → host. */
export type SessionWebviewMessage = { type: "ready" };
