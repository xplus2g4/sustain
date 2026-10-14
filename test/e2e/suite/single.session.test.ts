// The learning-session launcher + panel in a single-folder workspace (ADRs 0034/0036/0040):
// install prompt → mode pick → task input → hooks merge → `devin -- /sustain-bugfix <task>`
// terminal → session panel.
import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

const HOOKS = join(".devin", "hooks.v1.json");

suite("Learning session launcher", () => {
  let ui: UiStubs;
  let hook: TestHook;
  let root: string;
  let savedPath: string | undefined;
  let savedCreateTerminal: typeof vscode.window.createTerminal;
  /** `createTerminal` options — a real one would spawn `devin` inside the test host. */
  let terminals: (vscode.TerminalOptions | string)[];

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    terminals = [];
    savedCreateTerminal = vscode.window.createTerminal;
    (vscode.window as { createTerminal: unknown }).createTerminal = (options: vscode.TerminalOptions | string) => {
      terminals.push(options);
      return { show: () => undefined, dispose: () => undefined };
    };
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
    // A fake `devin` on PATH makes detection deterministic wherever the suite runs.
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const devin = join(bin, "devin");
    writeFileSync(devin, "#!/bin/sh\n");
    chmodSync(devin, 0o755);
    savedPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${savedPath ?? ""}`;
  });

  teardown(() => {
    ui.restore();
    vscode.window.createTerminal = savedCreateTerminal;
    if (savedPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = savedPath;
    for (const dir of ["bin", ".agents", ".claude", ".devin", ".sustain"]) rmSync(join(root, dir), { recursive: true, force: true });
    rmSync(join(root, ".gitignore"), { force: true });
  });

  test("declining the skill install stops before any other prompt", async () => {
    ui.answers.info.push(undefined); // "Install the Sustain skills first?" → dismiss
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.infos.length, 1);
    assert.match(ui.infos[0]!.message, /Install the Sustain skills first/);
    assert.equal(ui.quickPicks.length, 0);
    assert.equal(terminals.length, 0);
    assert.equal(hook.sessionPanelState().open, false);
  });

  test("dismissing the mode pick or an empty task stops without a terminal", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    ui.answers.quickPick.push(undefined);
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.quickPicks.length, 1);
    assert.equal(ui.inputBoxes.length, 0);
    assert.equal(terminals.length, 0);

    ui.answers.quickPick.push("Bug hunt");
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.inputBoxes.length, 1);
    assert.equal(terminals.length, 0);
  });

  test("the happy path installs, merges hooks, launches devin and opens the panel", async () => {
    ui.answers.info.push("Install"); // skill missing → install it
    ui.answers.quickPick.push("Bug hunt");
    ui.answers.inputBox.push("add a helper");
    await vscode.commands.executeCommand("sustain.startLearning");

    assert.ok(existsSync(join(root, ".agents/skills/sustain-bugfix/SKILL.md")), "skill installed");
    assert.ok(existsSync(join(root, HOOKS)), "hooks merged");
    assert.equal(terminals.length, 1);
    const options = terminals[0] as vscode.TerminalOptions;
    assert.equal(options.name, "Sustain: Bug hunt");
    assert.match(String(options.shellPath), /devin$/);
    assert.deepEqual(options.shellArgs, ["--", "/sustain-bugfix add a helper"]);
    assert.equal(String(options.cwd), root);
    assert.equal(hook.sessionPanelState().open, true);
    await hook.postFromSessionWebview({ type: "ready" }); // host re-sends the view; must not throw
  });
});
