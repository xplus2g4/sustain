// session.mjs (ADRs 0029–0035, contract ADR 0037) against the built bundle, run with
// `node` as a child process against a fixture repo, like the FR-VAL tests.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { ManifestBug } from "../../../src/model/session";
import { gitRepo, put, runScript, type SessionReport, tempDir } from "../support/temp";

const SUM_BELOW = [
  "export function sumBelow(xs: number[], limit: number): number {",
  "  let total = 0;",
  "  for (let i = 0; i < xs.length; i += 1) {",
  "    if (xs[i] === limit) continue;",
  "    total += xs[i]!;",
  "  }",
  "  return total;",
  "}",
  "",
].join("\n");

const LOADER = ["export async function load(): Promise<string> {", "  const data = await fetchData();", "  return data;", "}", ""].join("\n");

/** Two loops; the second is one bound off the first, so mutating it duplicates a line. */
const TWIN_LOOPS = [
  "export function counts(a: number[]): number {",
  "  let total = 0;",
  "  for (let i = 0; i <= a.length; i += 1) {",
  "    total += 1;",
  "  }",
  "  for (let i = 0; i < a.length; i += 1) {",
  "    total += 2;",
  "  }",
  "  return total;",
  "}",
  "",
].join("\n");

const RUN_NAME = /^bugfix-([a-z0-9-]+)-(\d{8}-\d{6})(-\d+)?$/;

function fixture(): string {
  const root = tempDir();
  put(root, "src/demo.ts", SUM_BELOW);
  put(root, "src/api.ts", LOADER);
  return root;
}

function init(root: string, name = "demo"): SessionReport {
  const run = runScript("session", ["init", "--mode", "bugfix", "--name", name], { cwd: root });
  expect(run.status).toBe(0);
  const out = run.json();
  expect(out["status"]).toBe("ok");
  return out;
}

function plan(root: string, steps: unknown[] = [{ title: "Add sumBelow", files: ["src/demo.ts"] }]): SessionReport {
  const run = runScript("session", ["plan", "--steps", JSON.stringify(steps)], { cwd: root });
  expect(run.status).toBe(0);
  return run.json();
}

/** The bare run folder name from a command's `run` field. */
function runName(out: SessionReport): string {
  return (out["run"] as string).replace(/^\.sustain\//, "");
}

function sessionJson(root: string, run: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, ".sustain", run, "session.json"), "utf8"));
}

function events(root: string, run: string): Record<string, unknown>[] {
  return readFileSync(join(root, ".sustain", run, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function manifestBugs(root: string, run: string): ManifestBug[] {
  return (JSON.parse(readFileSync(join(root, ".sustain", run, "manifest.json"), "utf8")) as { bugs: ManifestBug[] }).bugs;
}

describe("init", () => {
  test("creates the .sustain run, the three state files and the active lock", () => {
    const root = fixture();
    const out = init(root);
    const run = runName(out);
    expect(run).toMatch(RUN_NAME);
    expect(RUN_NAME.exec(run)![1]).toBe("demo");
    expect(out["sessionFile"]).toBe(`.sustain/${run}/session.json`);
    const session = sessionJson(root, run);
    expect(session).toMatchObject({ version: 1, mode: "bugfix", phase: "clarify", stepIndex: 0, steps: [], bugs: 0, found: 0, fixed: 0, score: 0 });
    expect(manifestBugs(root, run)).toEqual([]);
    expect(events(root, run)).toEqual([expect.objectContaining({ type: "init", mode: "bugfix" })]);
    expect(readFileSync(join(root, ".sustain/active"), "utf8")).toBe(`${run}\n`);
    expect(out["git"]).toBeNull();
    expect(out["warnings"]).toBeUndefined();
  });

  test("refuses while another session holds the lock", () => {
    const root = fixture();
    init(root);
    const second = runScript("session", ["init", "--mode", "bugfix"], { cwd: root });
    expect(second.status).toBe(1);
    expect(second.json()["status"]).toBe("active");
  });

  test("releases a stale lock: missing run folder or a done session", () => {
    const root = fixture();
    put(root, ".sustain/active", "bugfix-ghost-20260101-000000\n");
    const out = init(root);
    expect(out["warnings"]).toEqual([expect.stringContaining("stale lock")]);

    // A session that reached done but never ran complete frees the lock too.
    const run = runName(out);
    const session = sessionJson(root, run);
    session["phase"] = "done";
    writeFileSync(join(root, ".sustain", run, "session.json"), JSON.stringify(session));
    const second = init(root, "second");
    expect(second["warnings"]).toEqual([expect.stringContaining("stale lock")]);
  });

  test("warns on a dirty git tree, stays quiet on a clean one", () => {
    const clean = gitRepo({ "src/demo.ts": SUM_BELOW });
    const out = init(clean);
    expect(out["warnings"]).toBeUndefined();
    expect(out["git"]).toMatchObject({ dirtyCount: 0 });

    // In a dirty repo the warning fires — and the session's own .sustain files do not
    // count as the user's uncommitted work (facts are collected before they exist).
    const dirty = gitRepo({ "src/demo.ts": SUM_BELOW });
    writeFileSync(join(dirty, "src/demo.ts"), `// touched\n${SUM_BELOW}`);
    const outDirty = init(dirty);
    expect(outDirty["warnings"]).toEqual([expect.stringContaining("1 uncommitted change")]);
  });
});

describe("status and session commands without a session", () => {
  test("status reports none, then the live snapshot", () => {
    const root = fixture();
    const none = runScript("session", ["status"], { cwd: root });
    expect(none.status).toBe(0);
    expect(none.json()).toEqual({ status: "none" });

    init(root);
    plan(root);
    const out = runScript("session", ["status"], { cwd: root }).json();
    expect(out).toMatchObject({
      status: "ok",
      phase: "implementing",
      stepIndex: 0,
      stepsTotal: 1,
      step: { title: "Add sumBelow", files: ["src/demo.ts"] },
      bugs: 0,
    });
  });

  test.each([
    [["plan", "--steps", '["x"]']],
    [["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"]],
    [["report", "--file", "src/demo.ts"]],
    [["hint", "--level", "1"]],
    [["verify"]],
    [["complete"]],
  ])("%j without a session is no-session", (args: string[]) => {
    const run = runScript("session", args, { cwd: fixture() });
    expect(run.status).toBe(1);
    expect(run.json()["status"]).toBe("no-session");
  });
});

describe("plan", () => {
  test("records steps and moves clarify → implementing", () => {
    const root = fixture();
    const out = init(root);
    plan(root, ["Write the parser", { title: "Wire it up", files: ["src/demo.ts"] }]);
    const session = sessionJson(root, runName(out));
    expect(session["phase"]).toBe("implementing");
    expect(session["steps"]).toEqual([
      { title: "Write the parser", files: [] },
      { title: "Wire it up", files: ["src/demo.ts"] },
    ]);
    expect(events(root, runName(out)).map((e) => e["type"])).toEqual(["init", "planned"]);
  });

  test("rejects a second plan", () => {
    const root = fixture();
    init(root);
    plan(root);
    const run = runScript("session", ["plan", "--steps", '["again"]'], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json()["status"]).toBe("bad-phase");
  });

  test.each([["{nope"], ["[]"], ['[{"files":[]}]']])("rejects malformed steps %s", (stepsArg) => {
    const root = fixture();
    init(root);
    const run = runScript("session", ["plan", "--steps", stepsArg], { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
  });
});

describe("inject", () => {
  test("off-by-one rewrites the bound, records the manifest entry and hunts", () => {
    const root = fixture();
    const out = init(root);
    plan(root);
    const inject = runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    expect(inject.status).toBe(0);
    expect(inject.json()).toMatchObject({ status: "ok", bug: "bug-1", file: "src/demo.ts", kind: "off-by-one", phase: "hunting", bugs: 1 });
    const text = readFileSync(join(root, "src/demo.ts"), "utf8");
    expect(text).toContain("i <= xs.length");
    const bugs = manifestBugs(root, runName(out));
    expect(bugs).toHaveLength(1);
    expect(bugs[0]).toMatchObject({
      id: "bug-1",
      step: 0,
      file: "src/demo.ts",
      region: { startLine: 3, endLine: 3 },
      kind: "off-by-one",
      pristineHunk: "  for (let i = 0; i < xs.length; i += 1) {",
      buggyHunk: "  for (let i = 0; i <= xs.length; i += 1) {",
      twins: 0,
      found: false,
      fixed: false,
      hints: [],
    });
    expect(events(root, runName(out)).map((e) => e["type"])).toEqual(["init", "planned", "injected"]);
  });

  test("flipped-comparison and missing-await hit their targets", () => {
    const root = fixture();
    init(root);
    plan(root);
    const flip = runScript("session", ["inject", "--file", "src/demo.ts", "--line", "4", "--kind", "flipped-comparison"], { cwd: root });
    expect(flip.status).toBe(0);
    expect(readFileSync(join(root, "src/demo.ts"), "utf8")).toContain("xs[i] !== limit");
    const awaited = runScript("session", ["inject", "--file", "src/api.ts", "--line", "2", "--kind", "missing-await"], { cwd: root });
    expect(awaited.status).toBe(0);
    expect(readFileSync(join(root, "src/api.ts"), "utf8")).toContain("const data = fetchData();");
  });

  test.each([
    ["a line with no target", ["--line", "1"], /has no "off-by-one" target/],
    ["a line outside the file", ["--line", "99"], /outside the file/],
  ])("fails for %s and leaves the file untouched", (_name, lineArg, message) => {
    const root = fixture();
    init(root);
    plan(root);
    const before = readFileSync(join(root, "src/demo.ts"), "utf8");
    const run = runScript("session", ["inject", "--file", "src/demo.ts", ...lineArg, "--kind", "off-by-one"], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json()["message"]).toMatch(message);
    expect(readFileSync(join(root, "src/demo.ts"), "utf8")).toBe(before);
  });

  test.each([
    ["a deny-listed file", ".env"],
    ["a file outside the root", "../outside.ts"],
    ["a non-JS/TS file", "README.md"],
    ["a file under .sustain itself", null],
  ])("refuses %s", (_name, file) => {
    const root = fixture();
    put(root, ".env", "SECRET=1\n");
    put(root, "README.md", "# readme\n");
    const run = runName(init(root));
    plan(root);
    const target = file ?? `.sustain/${run}/session.json`;
    const inject = runScript("session", ["inject", "--file", target, "--line", "1", "--kind", "off-by-one"], { cwd: root });
    expect(inject.status).toBe(1);
    expect(inject.json()["status"]).toBe("error");
  });

  test("refuses in clarify phase", () => {
    const root = fixture();
    init(root);
    const inject = runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    expect(inject.status).toBe(1);
    expect(inject.json()["status"]).toBe("bad-phase");
  });
});

describe("report", () => {
  test("misses the wrong file, finds the seeded one, then misses again", () => {
    const root = fixture();
    const out = init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });

    const miss = runScript("session", ["report", "--file", "src/api.ts"], { cwd: root });
    expect(miss.status).toBe(1);
    expect(miss.json()["status"]).toBe("miss");

    const found = runScript("session", ["report", "--file", "src/demo.ts"], { cwd: root });
    expect(found.status).toBe(0);
    expect(found.json()).toMatchObject({ status: "found", bug: "bug-1", found: 1 });
    expect(events(root, runName(out)).map((e) => e["type"])).toContain("found");

    const again = runScript("session", ["report", "--file", "src/demo.ts"], { cwd: root });
    expect(again.status).toBe(1);
    expect(again.json()["status"]).toBe("miss");
  });
});

describe("hint", () => {
  test("ledgers a deduction on the named bug", () => {
    const root = fixture();
    const out = init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    const hint = runScript("session", ["hint", "--level", "2", "--bug", "bug-1"], { cwd: root });
    expect(hint.status).toBe(0);
    const list = events(root, runName(out));
    expect(list[list.length - 1]).toMatchObject({ type: "hint", bug: "bug-1", level: 2, cost: 10 });
    expect(manifestBugs(root, runName(out))[0]!["hints"]).toEqual([2]);
  });

  test.each([
    ["an unknown bug", ["--level", "1", "--bug", "bug-9"], 1],
    ["a bad level", ["--level", "9"], 2],
  ])("rejects %s", (_name, args, code) => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    const hint = runScript("session", ["hint", ...args], { cwd: root });
    expect(hint.status).toBe(code);
  });
});

describe("verify", () => {
  function seeded(root: string): void {
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
  }

  test("reports still-buggy until the hunk is gone, then finishes the single step", () => {
    const root = fixture();
    const out = init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });

    const early = runScript("session", ["verify"], { cwd: root });
    expect(early.status).toBe(1);
    expect(early.json()).toMatchObject({ status: "still-buggy", remaining: 1 });

    // A fix that rewrites the line counts the same as a revert to pristine.
    put(root, "src/demo.ts", SUM_BELOW.replace("i < xs.length", "i <= xs.length - 1"));
    const ok = runScript("session", ["verify"], { cwd: root });
    expect(ok.status).toBe(0);
    expect(ok.json()).toMatchObject({ status: "ok", phase: "done", fixed: ["bug-1"] });
    expect(sessionJson(root, runName(out))).toMatchObject({ phase: "done", fixed: 1 });
  });

  test("advances to the next step in a multi-step plan", () => {
    const root = fixture();
    init(root);
    plan(root, [
      { title: "Step one", files: ["src/demo.ts"] },
      { title: "Step two", files: ["src/api.ts"] },
    ]);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    put(root, "src/demo.ts", SUM_BELOW);
    const out = runScript("session", ["verify"], { cwd: root }).json();
    expect(out).toMatchObject({ status: "ok", phase: "implementing", stepIndex: 1 });
  });

  test("a pre-existing twin of the buggy line does not block the fix", () => {
    const root = tempDir();
    // Line 3 already reads exactly what mutating line 6 will produce.
    put(root, "src/twins.ts", TWIN_LOOPS);
    init(root);
    plan(root);
    const inject = runScript("session", ["inject", "--file", "src/twins.ts", "--line", "6", "--kind", "off-by-one"], { cwd: root });
    expect(inject.status).toBe(0);
    put(root, "src/twins.ts", TWIN_LOOPS); // the user fixes only the seeded line
    const out = runScript("session", ["verify"], { cwd: root });
    expect(out.status).toBe(0);
    expect(out.json()).toMatchObject({ status: "ok", phase: "done" });
  });

  test("a deleted bug file cannot be verified", () => {
    const root = fixture();
    seeded(root);
    rmSync(join(root, "src/demo.ts"));
    const run = runScript("session", ["verify"], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json()["status"]).toBe("error");
  });

  test("--check-cmd gates the step", () => {
    const root = fixture();
    seeded(root);
    put(root, "src/demo.ts", SUM_BELOW);
    const failed = runScript("session", ["verify", "--check-cmd", "exit 3"], { cwd: root });
    expect(failed.status).toBe(1);
    expect(failed.json()).toMatchObject({ status: "check-failed", exitCode: 3 });
    const ok = runScript("session", ["verify", "--check-cmd", "exit 0"], { cwd: root });
    expect(ok.status).toBe(0);
  });
});

describe("complete and the full loop", () => {
  test("complete requires done", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    const run = runScript("session", ["complete"], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json()).toMatchObject({ status: "not-complete", phase: "hunting", remaining: 1 });
  });

  test("init → plan → inject → report → hint → verify → complete scores and frees the lock", () => {
    const root = fixture();
    const out = init(root);
    const run = runName(out);
    plan(root);
    runScript("session", ["inject", "--file", "src/api.ts", "--line", "2", "--kind", "missing-await"], { cwd: root });
    runScript("session", ["report", "--file", "src/api.ts"], { cwd: root });
    runScript("session", ["hint", "--level", "1", "--bug", "bug-1"], { cwd: root });
    put(root, "src/api.ts", LOADER);
    expect(runScript("session", ["verify"], { cwd: root }).json()).toMatchObject({ phase: "done" });

    const done = runScript("session", ["complete"], { cwd: root });
    expect(done.status).toBe(0);
    // T2 (missing-await) 20 points − L1 hint 5 = 15.
    expect(done.json()).toMatchObject({ status: "completed", score: 15, found: 1, fixed: 1, bugs: 1 });
    const ledger = events(root, run);
    expect(ledger.map((e) => e["type"])).toEqual(["init", "planned", "injected", "found", "hint", "fixed", "verified", "completed"]);
    expect(ledger.at(-1)).toMatchObject({ type: "completed", score: 15 });
    // Pristine snapshots are deleted; the buggy hunk stays for the audit (ADR 0033).
    const bugs = manifestBugs(root, run);
    expect(bugs[0]!["pristineHunk"]).toBeUndefined();
    expect(bugs[0]!["buggyHunk"]).toBe("  const data = fetchData();");
    expect(existsSync(join(root, ".sustain/active"))).toBe(false);
    expect(runScript("session", ["status"], { cwd: root }).json()).toEqual({ status: "none" });
  });

  test("a fix that was never reported scores nothing", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    put(root, "src/demo.ts", SUM_BELOW);
    runScript("session", ["verify"], { cwd: root });
    const done = runScript("session", ["complete"], { cwd: root }).json();
    expect(done).toMatchObject({ status: "completed", score: 0, found: 0, fixed: 1 });
  });
});

describe("pause and resume", () => {
  test("pause parks the phase, blocks play commands, resume returns to it", () => {
    const root = fixture();
    const out = init(root);
    const run = runName(out);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });

    const paused = runScript("session", ["pause"], { cwd: root });
    expect(paused.status).toBe(0);
    expect(paused.json()).toMatchObject({ status: "ok", phase: "paused", pausedFrom: "hunting" });
    expect(sessionJson(root, run)).toMatchObject({ phase: "paused", pausedFrom: "hunting" });

    // Every play command refuses while parked — including complete.
    for (const args of [
      ["inject", "--file", "src/api.ts", "--line", "2", "--kind", "missing-await"],
      ["report", "--file", "src/demo.ts"],
      ["hint", "--level", "1"],
      ["verify"],
      ["complete"],
    ]) {
      const blocked = runScript("session", args, { cwd: root });
      expect(blocked.status).toBe(1);
      expect(blocked.json()["status"]).toBe("paused");
    }
    // Pause is idempotent-refusal; status still works and shows pausedFrom.
    expect(runScript("session", ["pause"], { cwd: root }).json()["status"]).toBe("paused");
    expect(runScript("session", ["status"], { cwd: root }).json()).toMatchObject({ phase: "paused", pausedFrom: "hunting" });

    const resumed = runScript("session", ["resume"], { cwd: root });
    expect(resumed.status).toBe(0);
    expect(resumed.json()).toMatchObject({ status: "ok", phase: "hunting" });
    expect(events(root, run).map((e) => e["type"])).toEqual(["init", "planned", "injected", "paused", "resumed"]);
    expect(sessionJson(root, run)["pausedFrom"]).toBeUndefined();
  });

  test("resume outside paused and pause in done are bad-phase", () => {
    const root = fixture();
    init(root);
    plan(root);
    const resumed = runScript("session", ["resume"], { cwd: root });
    expect(resumed.status).toBe(1);
    expect(resumed.json()).toMatchObject({ status: "bad-phase", phase: "implementing" });

    // done cannot pause.
    const heldRun = readFileSync(join(root, ".sustain/active"), "utf8").trim();
    const session = sessionJson(root, heldRun);
    session["phase"] = "done";
    writeFileSync(join(root, ".sustain", heldRun, "session.json"), JSON.stringify(session));
    const paused = runScript("session", ["pause"], { cwd: root });
    expect(paused.status).toBe(1);
    expect(paused.json()["status"]).toBe("bad-phase");
  });

  test("pause in clarify keeps resume target clarify", () => {
    const root = fixture();
    init(root);
    runScript("session", ["pause"], { cwd: root });
    const resumed = runScript("session", ["resume"], { cwd: root });
    expect(resumed.json()).toMatchObject({ phase: "clarify" });
    // And plan works again afterwards.
    const planned = plan(root);
    expect(planned["phase"]).toBe("implementing");
  });
});

describe("restore", () => {
  test("writes pristine hunks back, keeps the session, drops the bug from pending", () => {
    const root = fixture();
    const out = init(root);
    const run = runName(out);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    expect(readFileSync(join(root, "src/demo.ts"), "utf8")).toContain("i <= xs.length");

    const restored = runScript("session", ["restore"], { cwd: root });
    expect(restored.status).toBe(0);
    expect(restored.json()).toMatchObject({ status: "ok", phase: "hunting", restored: ["bug-1"], fixed: [] });
    expect(readFileSync(join(root, "src/demo.ts"), "utf8")).toBe(SUM_BELOW);

    const bugs = manifestBugs(root, run);
    expect(bugs[0]).toMatchObject({ restored: true, fixed: false });
    // verify now sees nothing pending and finishes the step.
    const verified = runScript("session", ["verify"], { cwd: root });
    expect(verified.status).toBe(0);
    expect(verified.json()).toMatchObject({ status: "ok", phase: "done" });
    // A restored bug scores nothing even after the step advances.
    expect(sessionJson(root, run)["score"]).toBe(0);
    const ledger = events(root, run).map((e) => e["type"]);
    expect(ledger).toContain("restored");
    expect(ledger).toContain("verified");
  });

  test("--bug restores one of several, --bug on a fixed bug fails", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    runScript("session", ["inject", "--file", "src/api.ts", "--line", "2", "--kind", "missing-await"], { cwd: root });

    const one = runScript("session", ["restore", "--bug", "bug-1"], { cwd: root });
    expect(one.json()).toMatchObject({ restored: ["bug-1"] });
    expect(readFileSync(join(root, "src/api.ts"), "utf8")).toContain("fetchData()");

    // Bug-2's hunk gone → restore counts it fixed, not restored.
    put(root, "src/api.ts", LOADER);
    const two = runScript("session", ["restore", "--bug", "bug-2"], { cwd: root });
    expect(two.json()).toMatchObject({ restored: [], fixed: ["bug-2"] });

    const again = runScript("session", ["restore", "--bug", "bug-2"], { cwd: root });
    expect(again.status).toBe(1);
    expect(again.json()["status"]).toBe("no-bug");
  });

  test("a deleted bug file is marked restored with the missing bucket", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    rmSync(join(root, "src/demo.ts"));
    const run = runScript("session", ["restore"], { cwd: root });
    expect(run.status).toBe(0);
    expect(run.json()).toMatchObject({ restored: [], missing: ["bug-1"] });
  });

  test("restore in done is bad-phase; restore keeps working while paused", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    runScript("session", ["pause"], { cwd: root });
    const run = runScript("session", ["restore"], { cwd: root });
    expect(run.status).toBe(0);
    expect(run.json()).toMatchObject({ phase: "paused", restored: ["bug-1"] });
    // Resume still returns to hunting even though nothing is seeded — verify ends it.
    runScript("session", ["resume"], { cwd: root });
    expect(runScript("session", ["verify"], { cwd: root }).json()).toMatchObject({ phase: "done" });
    const late = runScript("session", ["restore"], { cwd: root });
    expect(late.status).toBe(1);
    expect(late.json()["status"]).toBe("bad-phase");
  });
});

describe("abandon", () => {
  test("restores seeded hunks, frees the lock, keeps the run for audit", () => {
    const root = fixture();
    const out = init(root);
    const run = runName(out);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    runScript("session", ["inject", "--file", "src/api.ts", "--line", "2", "--kind", "missing-await"], { cwd: root });
    // The user fixed bug-1 already (found + fixed), bug-2 is still seeded.
    runScript("session", ["report", "--file", "src/demo.ts"], { cwd: root });
    put(root, "src/demo.ts", SUM_BELOW);

    const done = runScript("session", ["abandon"], { cwd: root });
    expect(done.status).toBe(0);
    expect(done.json()).toMatchObject({ status: "abandoned", restored: ["bug-2"], fixed: ["bug-1"], score: 10 });
    // Only the seeded hunks were touched: bug-2's line is pristine again, the user's
    // fix of bug-1 stands, and the implemented step code is otherwise untouched.
    expect(readFileSync(join(root, "src/api.ts"), "utf8")).toBe(LOADER);
    expect(readFileSync(join(root, "src/demo.ts"), "utf8")).toBe(SUM_BELOW);

    expect(existsSync(join(root, ".sustain/active"))).toBe(false);
    expect(runScript("session", ["status"], { cwd: root }).json()).toEqual({ status: "none" });
    const ledger = events(root, run);
    expect(ledger.at(-1)).toMatchObject({ type: "abandoned", score: 10 });
    // Snapshots are dropped for the audit trail, like complete does.
    expect(manifestBugs(root, run).every((b) => b["pristineHunk"] === undefined)).toBe(true);
    expect(sessionJson(root, run)["phase"]).toBe("done");

    // init starts cleanly afterwards.
    const next = init(root, "next");
    expect(next["warnings"]).toBeUndefined();
  });

  test("abandon works while paused", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    runScript("session", ["pause"], { cwd: root });
    const done = runScript("session", ["abandon"], { cwd: root });
    expect(done.status).toBe(0);
    expect(done.json()).toMatchObject({ status: "abandoned", restored: ["bug-1"] });
    expect(existsSync(join(root, ".sustain/active"))).toBe(false);
  });
});

describe("stale sessions", () => {
  function ageSession(root: string, msAgo: number): void {
    const run = readFileSync(join(root, ".sustain/active"), "utf8").trim();
    const path = join(root, ".sustain", run, "session.json");
    const session = JSON.parse(readFileSync(path, "utf8"));
    session["updatedAt"] = new Date(Date.now() - msAgo).toISOString();
    writeFileSync(path, JSON.stringify(session));
  }

  test("status flags a session idle past 24h as stale", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    const fresh = runScript("session", ["status"], { cwd: root }).json();
    expect(fresh["stale"]).toBe(false);
    ageSession(root, 25 * 60 * 60 * 1000);
    const old = runScript("session", ["status"], { cwd: root }).json();
    expect(old).toMatchObject({ status: "ok", phase: "hunting", stale: true });
    expect(old["idleMs"]).toBeGreaterThan(24 * 60 * 60 * 1000);
  });

  test("init releases a stale lock even for a paused session", () => {
    const root = fixture();
    init(root);
    plan(root);
    runScript("session", ["pause"], { cwd: root });
    ageSession(root, 25 * 60 * 60 * 1000);
    const out = init(root, "fresh");
    expect(out["warnings"]).toEqual([expect.stringContaining("stale lock")]);
    // A fresh pause under 24h still holds the lock.
    runScript("session", ["pause"], { cwd: root });
    const refused = runScript("session", ["init", "--mode", "bugfix"], { cwd: root });
    expect(refused.status).toBe(1);
    expect(refused.json()["status"]).toBe("active");
  });
});

describe("usage and exit codes", () => {
  test.each([
    [[], "usage"],
    [["bogus"], "unknown command"],
    [["inject", "--file", "src/demo.ts"], "inject"],
    [["init"], "init"],
    [["status", "--extra"], "status"],
  ])("%j exits 2 with stderr and no stdout", (args: string[], message: string) => {
    const run = runScript("session", args, { cwd: tempDir() });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(new RegExp(message));
  });
});
