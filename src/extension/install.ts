// `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006; learning-session assets per ADRs
// 0032/0036): copies both skills into `.agents/skills/`, merges the Sustain block into
// `.devin/hooks.v1.json` and appends `.sustain/` to `.gitignore`.
import * as vscode from "vscode";
import { pickRepoRoot } from "./folders";
import { ensureSustainGitignore, mergeHooks } from "./hooksFiles";
import { SKILL_NAMES, skillInstalled, skillTargets, writeSkill } from "./skillFiles";

/**
 * The session-side assets: the managed hooks block and the `.sustain/` gitignore line.
 * Idempotent — safe on install and on every session launch; a corrupt hooks file throws
 * and the caller reports it rather than overwriting (ADR 0036).
 */
export function ensureSessionAssets(root: string): void {
  mergeHooks(root);
  ensureSustainGitignore(root);
}

/**
 * Installs the built skills into `root`, asking before replacing an existing install.
 * Cancel changes nothing.
 */
export async function installSkill(extensionUri: vscode.Uri, root: string): Promise<"installed" | "cancelled"> {
  const installed = SKILL_NAMES.filter((name) => skillInstalled(skillTargets(root, name)));
  if (installed.length > 0) {
    const choice = await vscode.window.showWarningMessage(`Overwrite the existing ${installed.join(" and ")} skill${installed.length > 1 ? "s" : ""}?`, { modal: true }, "Overwrite");
    if (choice !== "Overwrite") return "cancelled";
  }
  const kinds = new Set<"symlink" | "copy">();
  for (const name of SKILL_NAMES) {
    const source = vscode.Uri.joinPath(extensionUri, "dist", "skills", name).fsPath;
    kinds.add(writeSkill(source, skillTargets(root, name), name));
  }
  try {
    ensureSessionAssets(root);
  } catch (error) {
    void vscode.window.showWarningMessage(`Skills installed, but the Devin hooks could not be merged: ${(error as Error).message}`);
  }
  void vscode.window.showInformationMessage(`Installed the Sustain skills in .agents/skills/ (${[...kinds].join("/")} for .claude) with the .devin hooks and .sustain/ gitignore.`);
  return "installed";
}

export async function installSkillsCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (folder) await installSkill(extensionUri, folder.uri.fsPath);
}
