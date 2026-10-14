// The `.devin/hooks.v1.json` merge/remove and `.gitignore` append behind Install Agent
// Skills (ADR 0036/0039): partial existing file, hand-edited file, empty file, corrupt
// file — a user's own hooks must always survive.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ensureSustainGitignore, mergeHooks, removeHooks, SUSTAIN_HOOK_MARKER, sustainHooks } from "../../../src/extension/hooksFiles";
import { put, tempDir } from "../support/temp";

const HOOKS = ".devin/hooks.v1.json";

function readHooks(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, HOOKS), "utf8"));
}

function sustainHookCommands(root: string): string[] {
  const file = readHooks(root);
  const commands: string[] = [];
  for (const groups of Object.values(file)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      for (const hook of (group as { hooks?: { command?: string }[] }).hooks ?? []) {
        if (hook.command?.includes(SUSTAIN_HOOK_MARKER)) commands.push(hook.command);
      }
    }
  }
  return commands;
}

describe("mergeHooks", () => {
  test("creates the file with only the Sustain block when none exists", () => {
    const root = tempDir();
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    expect(Object.keys(file).sort()).toEqual(["PostCompaction", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
    expect(sustainHookCommands(root)).toHaveLength(4);
    // The blocklist matcher covers the mutation + subagent tools.
    const pre = file["PreToolUse"] as { matcher?: string }[];
    expect(pre[0]!["matcher"]).toContain("edit");
    expect(pre[0]!["matcher"]).toContain("run_subagent");
  });

  test("preserves a user's own entries and is idempotent", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({
      PreToolUse: [{ matcher: "exec", hooks: [{ type: "command", command: "./scripts/check.sh", timeout: 10 }] }],
      Stop: [{ matcher: "", hooks: [{ type: "prompt", prompt: "Did you run tests?" }] }],
      "x-custom": { note: "user metadata" },
    })}\n`);
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    // User's exec check, Stop hook and metadata key all survive alongside ours.
    const pre = file["PreToolUse"] as { matcher?: string }[];
    expect(pre.some((group) => group["matcher"] === "exec")).toBe(true);
    expect(pre.some((group) => group["matcher"]?.includes("edit"))).toBe(true);
    expect(file["Stop"]).toHaveLength(1);
    expect(file["x-custom"]).toEqual({ note: "user metadata" });
    // Second merge changes nothing — idempotent.
    const before = readFileSync(join(root, HOOKS), "utf8");
    expect(mergeHooks(root)).toBe(false);
    expect(readFileSync(join(root, HOOKS), "utf8")).toBe(before);
  });

  test("rewrites only Sustain's entries when hand-edited", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({
      PreToolUse: [
        // A stale Sustain entry (old command path) plus the user's own hook in one group.
        {
          matcher: "^(edit)$",
          hooks: [
            { type: "command", command: "node .agents/skills/sustain-bugfix/scripts/old-hook.mjs" },
            { type: "command", command: "./scripts/user-check.sh" },
          ],
        },
      ],
      UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: "node .agents/skills/sustain-bugfix/scripts/session-hook.mjs" }] }],
    })}\n`);
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    // The stale sustain command is gone from PreToolUse; the user's hook stayed in its group.
    const pre = file["PreToolUse"] as { hooks: { command: string }[] }[];
    const commands = pre.flatMap((group) => group.hooks.map((hook) => hook.command));
    expect(commands).toContain("./scripts/user-check.sh");
    expect(commands.some((command) => command.includes("old-hook.mjs"))).toBe(false);
    // Exactly one Sustain block per event — the stale UserPromptSubmit entry was replaced.
    expect(sustainHookCommands(root)).toHaveLength(4);
  });

  test("an empty file merges like a missing one", () => {
    const root = tempDir();
    put(root, HOOKS, "  \n");
    expect(mergeHooks(root)).toBe(true);
    expect(sustainHookCommands(root)).toHaveLength(4);
  });

  test.each([
    ["unparseable JSON", "{PreToolUse:"],
    ["a non-object", '["not","object"]'],
  ])("a corrupt file (%s) throws and is left untouched", (_name, content) => {
    const root = tempDir();
    put(root, HOOKS, content);
    expect(() => mergeHooks(root)).toThrow(/corrupt/);
    expect(readFileSync(join(root, HOOKS), "utf8")).toBe(content);
  });
});

describe("removeHooks", () => {
  test("deletes the file only when nothing else remains", () => {
    const root = tempDir();
    mergeHooks(root);
    expect(removeHooks(root)).toBe("deleted");
    expect(existsSync(join(root, HOOKS))).toBe(false);
  });

  test("keeps user entries and reports updated", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({ Stop: [{ hooks: [{ type: "command", command: "./mine.sh" }] }] })}\n`);
    mergeHooks(root);
    expect(removeHooks(root)).toBe("updated");
    const file = readHooks(root);
    expect(file["Stop"]).toHaveLength(1);
    expect(Object.keys(file)).toEqual(["Stop"]);
    // Second removal is a no-op on a file without Sustain entries.
    expect(removeHooks(root)).toBe("none");
  });

  test("missing file is a no-op", () => {
    expect(removeHooks(tempDir())).toBe("none");
  });
});

describe("ensureSustainGitignore", () => {
  test("creates .gitignore when missing, appends preserving the last line", () => {
    const root = tempDir();
    expect(ensureSustainGitignore(root)).toBe(true);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(".sustain/\n");

    const root2 = tempDir();
    put(root2, ".gitignore", "node_modules"); // no trailing newline
    expect(ensureSustainGitignore(root2)).toBe(true);
    expect(readFileSync(join(root2, ".gitignore"), "utf8")).toBe("node_modules\n.sustain/\n");
  });

  test.each([".sustain/", ".sustain", "  .sustain/  "])("an existing %q line counts", (line) => {
    const root = tempDir();
    put(root, ".gitignore", `dist/\n${line}\n`);
    expect(ensureSustainGitignore(root)).toBe(false);
  });

  test("a substring like .sustainx does not count", () => {
    const root = tempDir();
    put(root, ".gitignore", ".sustainx/\n");
    expect(ensureSustainGitignore(root)).toBe(true);
  });
});

describe("sustainHooks", () => {
  test("covers the enforcement blocklist and the context events", () => {
    const hooks = sustainHooks();
    expect(Object.keys(hooks).sort()).toEqual(["PostCompaction", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
    expect(JSON.stringify(hooks)).toContain("session-hook.mjs");
  });
});
