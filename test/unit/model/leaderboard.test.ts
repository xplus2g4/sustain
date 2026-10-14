// `parseLedger`/`leaderboardEntry`/`rankLeaderboard` (model/leaderboard.ts): the pure
// aggregation behind the session panel's local leaderboard — reads events.jsonl and
// session.json only, never manifest.json.
import { describe, expect, test } from "vitest";
import { leaderboardEntry, parseLedger, rankLeaderboard, type LedgerEvent } from "../../../src/model/leaderboard";
import type { SessionState } from "../../../src/model/session";

const RUN = "bugfix-demo-20250101-000000";

function event(type: string, extra: Record<string, unknown> = {}): LedgerEvent {
  return { ts: "2025-01-01T00:00:00.000Z", type, ...extra };
}

function session(partial: Partial<SessionState> = {}): SessionState {
  return {
    version: 1,
    mode: "bugfix",
    phase: "done",
    stepIndex: 0,
    steps: [],
    bugs: 2,
    found: 1,
    fixed: 1,
    score: 90,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T01:00:00.000Z",
    ...partial,
  };
}

describe("parseLedger", () => {
  test("parses JSONL, skipping blank and malformed lines", () => {
    const ledger = parseLedger(
      `${JSON.stringify(event("session_started"))}\n\nnot json\n{"no_type":1}\n${JSON.stringify(event("found"))}\n`,
    );
    expect(ledger.map((entry) => entry.type)).toEqual(["session_started", "found"]);
  });

  test("an empty file yields no events", () => {
    expect(parseLedger("")).toEqual([]);
  });
});

describe("leaderboardEntry", () => {
  test("aggregates a completed run from session.json", () => {
    const events = [
      event("session_started"),
      event("injected"),
      event("injected"),
      event("found"),
      event("fixed"),
      event("hint", { cost: 10 }),
      event("hint", { cost: 25 }),
      event("completed", { score: 90, ts: "2025-01-01T01:00:00.000Z" }),
    ];
    const entry = leaderboardEntry(RUN, session(), events, false);
    expect(entry).toMatchObject({
      run: RUN,
      mode: "bugfix",
      status: "completed",
      score: 90,
      bugs: 2,
      found: 1,
      fixed: 1,
      hintCost: 35,
      endedAt: "2025-01-01T01:00:00.000Z",
    });
  });

  test("falls back to the ledger when session.json is unreadable", () => {
    const events = [
      event("injected"),
      event("injected"),
      event("injected"),
      event("found"),
      event("found"),
      event("fixed"),
      event("completed", { score: 70 }),
    ];
    const entry = leaderboardEntry(RUN, null, events, false);
    expect(entry).toMatchObject({ status: "completed", score: 70, bugs: 3, found: 2, fixed: 1, mode: "bugfix" });
  });

  test("abandoned runs keep a row with their final score", () => {
    const events = [event("injected"), event("abandoned", { score: 40 })];
    const entry = leaderboardEntry(RUN, null, events, false);
    expect(entry.status).toBe("abandoned");
    expect(entry.score).toBe(40);
  });

  test("active vs interrupted depends on the lock, not the file order", () => {
    const events = [event("session_started"), event("injected")];
    expect(leaderboardEntry(RUN, null, events, true).status).toBe("active");
    expect(leaderboardEntry(RUN, null, events, false).status).toBe("interrupted");
  });

  test("an empty ledger yields a zero row", () => {
    const entry = leaderboardEntry(RUN, null, [], false);
    expect(entry).toMatchObject({ status: "interrupted", score: 0, bugs: 0, found: 0 });
  });
});

describe("rankLeaderboard", () => {
  test("orders by score desc, then most recently ended", () => {
    const row = (run: string, score: number, endedAt: string) =>
      ({ run, mode: "bugfix", status: "completed", score, bugs: 0, found: 0, fixed: 0, hintCost: 0, startedAt: "", endedAt }) as const;
    const ranked = rankLeaderboard([
      { ...row("a", 10, "2025-01-02T00:00:00.000Z") },
      { ...row("b", 50, "2025-01-01T00:00:00.000Z") },
      { ...row("c", 10, "2025-01-03T00:00:00.000Z") },
    ]);
    expect(ranked.map((entry) => entry.run)).toEqual(["b", "c", "a"]);
  });
});
