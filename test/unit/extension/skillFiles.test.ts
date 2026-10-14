// FR-INS-01 file operations: the symlink layout and the copy fallback when linking fails.
import { existsSync, lstatSync, readFileSync, readlinkSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { skillInstalled, skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { put, tempDir } from "../support/temp";

function source(): string {
  const dir = tempDir();
  put(dir, "SKILL.md", "new skill\n");
  put(dir, "scripts/validate.mjs", "// v\n");
  return dir;
}

describe("FR-INS-01 skill files", () => {
  const NAME = "sustain-architecture";

  test("copies into .agents and links .claude relatively", () => {
    const root = tempDir();
    const targets = skillTargets(root, NAME);
    expect(skillInstalled(targets)).toBe(false);
    expect(writeSkill(source(), targets, NAME)).toBe("symlink");
    expect(readFileSync(join(root, ".agents/skills/sustain-architecture/scripts/validate.mjs"), "utf8")).toBe("// v\n");
    expect(lstatSync(targets.claudeLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(targets.claudeLink)).toBe("../../.agents/skills/sustain-architecture");
    expect(readFileSync(join(targets.claudeLink, "SKILL.md"), "utf8")).toBe("new skill\n");
    expect(skillInstalled(targets)).toBe(true);
  });

  test("copies into .claude when the symlink cannot be created", () => {
    const root = tempDir();
    const targets = skillTargets(root, NAME);
    const failingLink = (): void => {
      throw Object.assign(new Error("EPERM: operation not permitted, symlink"), { code: "EPERM" });
    };
    expect(writeSkill(source(), targets, NAME, failingLink)).toBe("copy");
    expect(lstatSync(targets.claudeLink).isDirectory()).toBe(true);
    expect(readFileSync(join(targets.claudeLink, "SKILL.md"), "utf8")).toBe("new skill\n");
  });

  test("replaces an existing install and removes a stale link without following it", () => {
    const root = tempDir();
    const targets = skillTargets(root, NAME);
    put(root, ".agents/skills/sustain-architecture/old.txt", "old");
    const elsewhere = tempDir();
    put(elsewhere, "keep.txt", "keep");
    put(root, ".claude/skills/.keep", "");
    symlinkSync(elsewhere, targets.claudeLink);
    expect(skillInstalled(targets)).toBe(true);

    writeSkill(source(), targets, NAME);
    expect(existsSync(join(targets.agentsDir, "old.txt"))).toBe(false);
    expect(readlinkSync(targets.claudeLink)).toBe("../../.agents/skills/sustain-architecture");
    expect(readFileSync(join(elsewhere, "keep.txt"), "utf8")).toBe("keep");
  });

  test("a dangling .claude link counts as installed", () => {
    const root = tempDir();
    const targets = skillTargets(root, NAME);
    put(root, ".claude/skills/.keep", "");
    symlinkSync("../../.agents/skills/sustain-architecture", targets.claudeLink);
    expect(skillInstalled(targets)).toBe(true);
  });
});
