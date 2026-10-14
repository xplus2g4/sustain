// `listSessionRuns`/`readSessionSnapshot` (extension/sessionFiles.ts): the read side of
// the session panel — aggregates `.sustain/<run>/session.json` + `events.jsonl` only.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { listSessionRuns, readSessionSnapshot } from "../../../src/extension/sessionFiles";
import { ACTIVE_FILE, SESSION_FILE, SUSTAIN_DIR } from "../../../src/model/session";
import { put, tempDir } from "../support/temp";

const RUN_OLD = "bugfix-alpha-20250101-000000";
const RUN_NEW = "bugfix-beta-20250102-000000";

function sessionJson(phase = "done", extra: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    version: 1,
    mode: "bugfix",
    phase,
    stepIndex: 0,
    steps: [{ title: "t", files: [] }],
    bugs: 1,
    found: 1,
    fixed: 1,
    score: 80,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T01:00:00.000Z",
    ...extra,
  })}\n`;
}

function makeRun(root: string, run: string, session: string | null, events: string[] = []): void {
  const dir = join(root, SUSTAIN_DIR, run);
  mkdirSync(dir, { recursive: true });
  if (session !== null) put(root, `${SUSTAIN_DIR}/${run}/${SESSION_FILE}`, session);
  if (events.length > 0) {
    put(root, `${SUSTAIN_DIR}/${run}/events.jsonl`, `${events.map((e) => JSON.stringify({ ts: "2025-01-01T00:00:00.000Z", type: e })).join("\n")}\n`);
  }
}

describe("listSessionRuns", () => {
  test("empty repo yields no runs", () => {
    expect(listSessionRuns(tempDir())).toEqual([]);
  });

  test("only run-named folders with a session.json count, newest first", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, sessionJson());
    makeRun(root, RUN_NEW, sessionJson());
    // A run-named folder without session.json, a stray dir, and the lock file are ignored.
    mkdirSync(join(root, SUSTAIN_DIR, "bugfix-ghost-20250103-000000"), { recursive: true });
    mkdirSync(join(root, SUSTAIN_DIR, "not-a-run"), { recursive: true });
    put(root, `${SUSTAIN_DIR}/${ACTIVE_FILE}`, RUN_NEW);
    expect(listSessionRuns(root)).toEqual([RUN_NEW, RUN_OLD]);
  });
});

describe("readSessionSnapshot", () => {
  test("empty repo shows nothing and an empty leaderboard", () => {
    expect(readSessionSnapshot(tempDir())).toEqual({ activeRun: null, shown: null, leaderboard: [], totalScore: 0 });
  });

  test("shows the newest run when no session is active", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, sessionJson("done"), ["completed"]);
    makeRun(root, RUN_NEW, sessionJson("hunting", { found: 0, fixed: 0 }), ["injected"]);
    const snapshot = readSessionSnapshot(root);
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.shown?.run).toBe(RUN_NEW);
    expect(snapshot.shown?.session?.phase).toBe("hunting");
    expect(snapshot.leaderboard).toHaveLength(2);
  });

  test("an active lock wins over recency and marks the row active", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, sessionJson("hunting"), ["injected"]);
    makeRun(root, RUN_NEW, sessionJson("done"), ["completed"]);
    put(root, `${SUSTAIN_DIR}/${ACTIVE_FILE}`, RUN_OLD);
    const snapshot = readSessionSnapshot(root);
    expect(snapshot.activeRun).toBe(RUN_OLD);
    expect(snapshot.shown?.run).toBe(RUN_OLD);
    expect(snapshot.leaderboard.find((entry) => entry.run === RUN_OLD)?.status).toBe("active");
    expect(snapshot.leaderboard.find((entry) => entry.run === RUN_NEW)?.status).toBe("completed");
  });

  test("a lock naming a missing run is ignored", () => {
    const root = tempDir();
    makeRun(root, RUN_NEW, sessionJson("done"), ["completed"]);
    put(root, `${SUSTAIN_DIR}/${ACTIVE_FILE}`, "bugfix-gone-20250103-000000");
    const snapshot = readSessionSnapshot(root);
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.shown?.run).toBe(RUN_NEW);
  });

  test("a corrupt session.json still renders the run from its ledger", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, "{corrupt", ["injected", "found", "completed"]);
    const snapshot = readSessionSnapshot(root);
    expect(snapshot.shown?.session).toBeNull();
    const entry = snapshot.leaderboard.find((row) => row.run === RUN_OLD);
    expect(entry).toMatchObject({ status: "completed", bugs: 1, found: 1 });
  });

  test("a session.json with a wrong shape is treated as corrupt", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, sessionJson("bogus-phase"), []);
    expect(readSessionSnapshot(root).shown?.session).toBeNull();
  });

  test("totalScore accumulates every row — live sessions included", () => {
    const root = tempDir();
    makeRun(root, RUN_OLD, sessionJson("done", { score: 80 }), ["completed"]);
    makeRun(root, RUN_NEW, sessionJson("hunting", { score: 30, found: 1, fixed: 0 }), ["injected"]);
    put(root, `${SUSTAIN_DIR}/${ACTIVE_FILE}`, RUN_NEW);
    const snapshot = readSessionSnapshot(root);
    expect(snapshot.leaderboard.map((entry) => entry.score)).toEqual([80, 30]);
    expect(snapshot.totalScore).toBe(110);
  });
});
