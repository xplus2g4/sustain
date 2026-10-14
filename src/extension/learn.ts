// `Sustain: Start Learning Session` (ADRs 0029–0036): folder + mode + task, ensures the
// skill and hooks are in place, then launches `devin -- "/sustain-bugfix <task>"` in a
// terminal — the same shellPath/shellArgs shape as `generateArchitectureCommand` (ADR 0020).
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { devinPromptArgs, findDevinCli } from "./devin";
import { pickRepoRoot } from "./folders";
import { ensureSessionAssets, installSkill } from "./install";
import { SessionPanel } from "./sessionPanel";
import { agentsSkillDir } from "./skillFiles";

interface LearningMode {
  label: string;
  detail: string;
  /** Skill invocation prefix inside the agent session. */
  invoke: string;
}

const MODES: readonly LearningMode[] = [
  { label: "Bug hunt", detail: "The agent implements your task in steps and plants one hidden bug per step — find and fix them", invoke: "/sustain-bugfix" },
];

export async function startLearningSessionCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;

  if (!existsSync(join(root, ...agentsSkillDir("sustain-bugfix").split("/"), "SKILL.md"))) {
    const choice = await vscode.window.showInformationMessage("Install the Sustain skills first?", "Install", "Cancel");
    if (choice !== "Install") return;
    if ((await installSkill(extensionUri, root)) === "cancelled") return;
  }

  const mode = await vscode.window.showQuickPick(MODES.map((entry) => ({ label: entry.label, detail: entry.detail, mode: entry })), {
    placeHolder: "Learning mode",
  });
  if (!mode) return;

  const task = await vscode.window.showInputBox({
    prompt: "What should the agent implement? This becomes the session's task.",
    validateInput: (value) => (value.trim() === "" ? "A task is required — the agent implements it step by step" : undefined),
  });
  if (task === undefined) return;

  try {
    ensureSessionAssets(root);
  } catch (error) {
    const choice = await vscode.window.showWarningMessage(
      `The Devin hooks could not be merged — hunt edits won't be blocked: ${(error as Error).message}`,
      "Start anyway",
      "Cancel",
    );
    if (choice !== "Start anyway") return;
  }

  const prompt = `${mode.mode.invoke} ${task.trim()}`;
  const devin = findDevinCli(process.env);
  if (devin === undefined) {
    const action = await vscode.window.showWarningMessage("`devin` was not found on PATH or the known install locations.", "Copy prompt");
    if (action === "Copy prompt") await vscode.env.clipboard.writeText(prompt);
    return;
  }
  const terminal = vscode.window.createTerminal({ name: `Sustain: ${mode.mode.label}`, cwd: root, shellPath: devin, shellArgs: devinPromptArgs(prompt) });
  terminal.show();
  SessionPanel.show(extensionUri, root);
}
