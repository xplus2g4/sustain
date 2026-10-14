// `findDevinCli`/`devinPromptArgs` (extension/devin.ts): PATH first, then the version
// store's `current` link, then the Devin Desktop bundle — `undefined` when none runs.
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { devinFallbackPaths, devinPromptArgs, findDevinCli } from "../../../src/extension/devin";
import { put, tempDir } from "../support/temp";

function stubDevin(dir: string, name = "devin"): string {
  const path = join(dir, name);
  put(dir, name, "#!/bin/sh\n");
  chmodSync(path, 0o755);
  return path;
}

describe("devinPromptArgs", () => {
  test("separates the prompt with --", () => {
    expect(devinPromptArgs("/sustain-bugfix add a thing")).toEqual(["--", "/sustain-bugfix add a thing"]);
  });
});

describe("devinFallbackPaths", () => {
  test("always lists the version-store link, plus the app bundle on darwin", () => {
    const home = tempDir();
    const darwin = devinFallbackPaths({ HOME: home }, "darwin");
    expect(darwin[0]).toBe(join(home, ".local", "share", "devin", "cli", "current", "bin", "devin"));
    expect(darwin[1]).toBe("/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin");

    const linux = devinFallbackPaths({ HOME: home }, "linux");
    expect(linux).toHaveLength(1);
  });

  test("win32 uses LOCALAPPDATA for the app bundle", () => {
    const paths = devinFallbackPaths({ HOME: tempDir(), LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "win32");
    expect(paths[1]).toContain("Devin");
    expect(paths[1]).toContain("devin.exe");
  });
});

describe("findDevinCli", () => {
  test("a devin on PATH wins over every fallback", () => {
    const bin = tempDir();
    const onPath = stubDevin(bin);
    const found = findDevinCli({ PATH: bin, HOME: tempDir() }, () => true);
    expect(found).toBe(onPath);
  });

  test("falls back to the version-store link when PATH is empty", () => {
    const home = tempDir();
    const store = join(home, ".local", "share", "devin", "cli", "current", "bin");
    const expected = stubDevin(store);
    const found = findDevinCli({ PATH: "", HOME: home }, undefined, "linux");
    expect(found).toBe(expected);
  });

  test("returns undefined when nothing is installed", () => {
    expect(findDevinCli({ PATH: "", HOME: tempDir() }, undefined, "linux")).toBeUndefined();
  });
});
