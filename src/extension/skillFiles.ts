// File operations behind `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006; the
// learning-session install extends the same targets per ADR 0036). No `vscode` import,
// so the symlink fallback is unit-tested in Node.
import { cpSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

/** The skills `Sustain: Install Agent Skills` ships: architecture + the learning session. */
export const SKILL_NAMES: readonly string[] = ["sustain-architecture", "sustain-bugfix"];

/** Repo-relative `.agents/skills/<name>`, `/`-separated (also used in messages). */
export function agentsSkillDir(name: string): string {
  return `.agents/skills/${name}`;
}

/** Repo-relative `.claude/skills/<name>` — the Claude-side entry (symlink or copy). */
export function claudeSkillLink(name: string): string {
  return `.claude/skills/${name}`;
}

export interface SkillTargets {
  agentsDir: string;
  claudeLink: string;
}

export function skillTargets(root: string, name: string): SkillTargets {
  return {
    agentsDir: join(root, ...agentsSkillDir(name).split("/")),
    claudeLink: join(root, ...claudeSkillLink(name).split("/")),
  };
}

/** Whether anything (including a dangling symlink) exists at either target. */
export function skillInstalled(targets: SkillTargets): boolean {
  return [targets.agentsDir, targets.claudeLink].some((path) => {
    try {
      lstatSync(path);
      return true;
    } catch {
      return false;
    }
  });
}

export type LinkFn = (target: string, path: string, type: "dir" | "junction") => void;

/**
 * Removes both targets (a symlink is removed, not followed), copies `source` to the
 * `.agents` folder and links the `.claude` entry to it; copies there too when `link` throws.
 * Returns how the `.claude` entry was created.
 */
export function writeSkill(source: string, targets: SkillTargets, name: string, link: LinkFn = symlinkSync): "symlink" | "copy" {
  rmSync(targets.agentsDir, { recursive: true, force: true });
  rmSync(targets.claudeLink, { recursive: true, force: true });
  cpSync(source, targets.agentsDir, { recursive: true });
  mkdirSync(dirname(targets.claudeLink), { recursive: true });
  try {
    link(`../../.agents/skills/${name}`, targets.claudeLink, process.platform === "win32" ? "junction" : "dir");
    return "symlink";
  } catch {
    rmSync(targets.claudeLink, { recursive: true, force: true });
    cpSync(source, targets.claudeLink, { recursive: true });
    return "copy";
  }
}
