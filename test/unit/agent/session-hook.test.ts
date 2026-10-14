// session-hook.mjs (ADR 0032) run as a child process the way Devin runs it: hook-event
// JSON on stdin, cwd = repo root, DEVIN_PROJECT_DIR set. Asserts the mechanical part of
// the no-assist contract — blocked edits while hunting, context injection, inertness.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { put, runHook, runScript, tempDir } from "../support/temp";

const SOURCE = [
  "export function sumBelow(xs: number[], limit: number): number {",
  "  let total = 0;",
  "  for (let i = 0; i < xs.length; i += 1) {",
  "    total += xs[i]!;",
  "  }",
  "  return total;",
  "}",
  "",
].join("\n");

function preTool(tool: string, input: Record<string, unknown> = {}): Record<string, unknown> {
  return { hook_event_name: "PreToolUse", tool_name: tool, tool_input: input, session_id: "s1", prompt_id: "p1" };
}

function event(name: string): Record<string, unknown> {
  return { hook_event_name: name, session_id: "s1", prompt_id: "p1" };
}

/** A fixture repo one `inject` away from hunting. */
function hunting(): string {
  const root = tempDir();
  put(root, "src/demo.ts", SOURCE);
  runScript("session", ["init", "--mode", "bugfix"], { cwd: root });
  runScript("session", ["plan", "--steps", '[{"title":"Add sumBelow","files":["src/demo.ts"]}]'], { cwd: root });
  runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
  return root;
}

describe("no session", () => {
  test("every event is inert without .sustain/active", () => {
    const root = tempDir();
    for (const payload of [preTool("edit", { file_path: "a.ts" }), event("UserPromptSubmit"), event("PostCompaction"), event("SessionStart")]) {
      const run = runHook(payload, { cwd: root });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe("");
    }
  });

  test("a corrupt session.json cannot jam the agent", () => {
    const root = tempDir();
    put(root, ".sustain/active", "bugfix-x-20260101-000000\n");
    put(root, ".sustain/bugfix-x-20260101-000000/session.json", "{corrupt");
    const run = runHook(preTool("edit"), { cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });
});

describe("hunting enforcement", () => {
  test.each(["edit", "write", "apply_patch", "notebook_edit", "run_subagent"])("blocks %s while hunting", (tool) => {
    const root = hunting();
    const run = runHook(preTool(tool, { file_path: "src/demo.ts" }), { cwd: root });
    expect(run.status).toBe(2);
    const out = run.json();
    expect(out["decision"]).toBe("block");
    expect(out["reason"]).toMatch(/bug-hunt is live/);
    expect(out["reason"]).toMatch(tool);
    expect(run.stderr).toMatch(/bug-hunt is live/);
  });

  test.each(["read", "grep", "exec", "todo_write", "mcp__github__create_issue"])("lets %s through while hunting", (tool) => {
    const root = hunting();
    const run = runHook(preTool(tool), { cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });
});

describe("phase sensitivity", () => {
  test("edits pass while implementing, clarify and paused — block returns on resume", () => {
    const root = tempDir();
    put(root, "src/demo.ts", SOURCE);
    runScript("session", ["init", "--mode", "bugfix"], { cwd: root });
    expect(runHook(preTool("edit"), { cwd: root }).status).toBe(0); // clarify

    runScript("session", ["plan", "--steps", '["x"]'], { cwd: root });
    expect(runHook(preTool("write"), { cwd: root }).status).toBe(0); // implementing

    runScript("session", ["inject", "--file", "src/demo.ts", "--line", "3", "--kind", "off-by-one"], { cwd: root });
    expect(runHook(preTool("edit"), { cwd: root }).status).toBe(2); // hunting

    runScript("session", ["pause"], { cwd: root });
    expect(runHook(preTool("edit"), { cwd: root }).status).toBe(0); // paused: hook inert
    expect(runHook(preTool("run_subagent"), { cwd: root }).status).toBe(0);

    runScript("session", ["resume"], { cwd: root });
    expect(runHook(preTool("edit"), { cwd: root }).status).toBe(2); // re-armed
  });

  test("abandon un-seeds the repo and disarms the hook", () => {
    const root = hunting();
    runScript("session", ["abandon"], { cwd: root });
    expect(existsSync(join(root, ".sustain/active"))).toBe(false);
    const run = runHook(preTool("edit"), { cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });
});

describe("context injection", () => {
  test.each(["UserPromptSubmit", "PostCompaction", "SessionStart"])("%s injects live session state", (name) => {
    const root = hunting();
    const run = runHook(event(name), { cwd: root });
    expect(run.status).toBe(0);
    const out = run.json();
    expect(out.hookSpecificOutput?.hookEventName).toBe(name);
    const ctx = out.hookSpecificOutput?.additionalContext ?? "";
    expect(ctx).toMatch(/phase=hunting/);
    expect(ctx).toMatch(/step 1\/1 "Add sumBelow"/);
    expect(ctx).toMatch(/0 found \/ 0 fixed of 1/);
    expect(ctx).toMatch(/do not edit files/);
  });

  test("paused context tells the agent enforcement is inert", () => {
    const root = hunting();
    runScript("session", ["pause"], { cwd: root });
    const run = runHook(event("UserPromptSubmit"), { cwd: root });
    expect(run.json().hookSpecificOutput?.additionalContext).toMatch(/phase=paused/);
  });
});

describe("robustness", () => {
  test("unparseable stdin is inert", () => {
    const root = hunting();
    const run = runHook({ not: "an event" } as Record<string, unknown>, { cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });

  test("unrelated hook events pass silently even while hunting", () => {
    const root = hunting();
    const run = runHook(event("SessionEnd"), { cwd: root });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
  });

  test("a removed session.json mid-hunt disarms rather than blocks", () => {
    const root = hunting();
    const run = readFileSync(join(root, ".sustain/active"), "utf8").trim();
    writeFileSync(join(root, ".sustain", run, "session.json"), "{bad json");
    const edit = runHook(preTool("edit"), { cwd: root });
    expect(edit.status).toBe(0);
  });
});
