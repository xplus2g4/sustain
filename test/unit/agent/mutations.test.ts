// The mutation engine's rule tables and line targeting (ADR 0031, ADR 0038).
import { describe, expect, test } from "vitest";
import { bugStillPresent, hunkCount, mutateLine, mutateText } from "../../../src/agent/modes/bugfix/mutations";

describe("mutateLine off-by-one", () => {
  test.each([
    ["for (let i = 0; i < n; i += 1) {", "for (let i = 0; i <= n; i += 1) {"],
    ["if (i <= last) {", "if (i < last) {"],
    ["while (x > 0) {", "while (x >= 0) {"],
    ["if (end >= size) {", "if (end > size) {"],
    ["return a<b ? a : b;", "return a<=b ? a : b;"],
  ])("%s → %s", (line, expected) => {
    expect(mutateLine(line, "off-by-one")).toBe(expected);
  });

  test.each([
    ["const f = (x) => x;", "arrow => is not a comparison"],
    ["i <<= 1;", "<<= is one token"],
    ["a << b;", "<< is a shift"],
    ["// i < n", "comment only"],
    ['const s = "i < n";', "string only"],
    ["no operators here;", "no target"],
  ])("no target: %s (%s)", (line) => {
    expect(mutateLine(line, "off-by-one")).toBeNull();
  });
});

describe("mutateLine flipped-comparison", () => {
  test.each([
    ["if (xs[i] === limit) continue;", "if (xs[i] !== limit) continue;"],
    ["while (a !== b) {", "while (a === b) {"],
    ["if (a <= b) {", "if (a >= b) {"],
    ["if (a >= b) {", "if (a <= b) {"],
    ["if (a < b) {", "if (a > b) {"],
    ["if (a > b) {", "if (a < b) {"],
    ["if (a == b) {", "if (a != b) {"],
    ["if (a != b) {", "if (a == b) {"],
    // First rule wins: === flips, not <=.
    ["ok = a === b && c <= d;", "ok = a !== b && c <= d;"],
    // The comment's === is invisible; the code's == mutates.
    ["if (a == b) c(); // a === d", "if (a != b) c(); // a === d"],
  ])("%s → %s", (line, expected) => {
    expect(mutateLine(line, "flipped-comparison")).toBe(expected);
  });

  test.each([
    ["const f = (x) => x;", "arrow =>"],
    ["i >>= 1;", ">>= is one token"],
    ["x = y;", "no comparison"],
  ])("no target: %s (%s)", (line) => {
    expect(mutateLine(line, "flipped-comparison")).toBeNull();
  });
});

describe("mutateLine missing-await", () => {
  test.each([
    ["  const data = await fetchData();", "  const data = fetchData();"],
    ["return await done();", "return done();"],
    ["for await (const x of stream) {", "for (const x of stream) {"],
    ["x = await   spaced();", "x = spaced();"],
    ["await flush();", "flush();"],
  ])("%s → %s", (line, expected) => {
    expect(mutateLine(line, "missing-await")).toBe(expected);
  });

  test.each([
    ["obj.await();", "property name, not the keyword"],
    ['const s = "await it";', "inside a string"],
    ["// await fetchData()", "inside a comment"],
    ["const awaiting = 1;", "awaiting is a different identifier"],
  ])("no target: %s (%s)", (line) => {
    expect(mutateLine(line, "missing-await")).toBeNull();
  });
});

describe("mutateLine comment and string safety", () => {
  test("a line comment cannot supply the target", () => {
    expect(mutateLine("i = j; // i < n", "off-by-one")).toBeNull();
    expect(mutateLine("i = j; /* i < n */", "off-by-one")).toBeNull();
  });

  test("the code part mutates even when the comment also matches", () => {
    expect(mutateLine("if (i < n) x(); // i < n here too", "off-by-one")).toBe("if (i <= n) x(); // i < n here too");
  });

  test("a string cannot supply the target but code after it can", () => {
    expect(mutateLine(`s = "a < b"; if (i < n) x();`, "off-by-one")).toBe(`s = "a < b"; if (i <= n) x();`);
  });
});

describe("mutateText", () => {
  const text = "a\nfor (let i = 0; i < n; i += 1) {\nb\n";

  test("mutates the named 1-based line and reports the hunk", () => {
    const result = mutateText(text, 2, "off-by-one");
    expect(result.region).toEqual({ startLine: 2, endLine: 2 });
    expect(result.pristineHunk).toBe("for (let i = 0; i < n; i += 1) {");
    expect(result.buggyHunk).toBe("for (let i = 0; i <= n; i += 1) {");
    expect(result.text).toBe("a\nfor (let i = 0; i <= n; i += 1) {\nb\n");
  });

  test.each([[0], [-1], [5], [1.5], [NaN]])("line %s is outside the file", (line) => {
    expect(() => mutateText(text, line, "off-by-one")).toThrow(/outside the file/);
  });

  test("a line with no target is an error naming the kind", () => {
    expect(() => mutateText(text, 1, "missing-await")).toThrow('line 1 has no "missing-await" target');
  });
});

describe("hunkCount / bugStillPresent", () => {
  test("counts trimmed-equal lines and respects pre-existing twins", () => {
    const text = "if (i <= n) {\nx\n  if (i <= n) {\n";
    expect(hunkCount(text, "if (i <= n) {")).toBe(2);
    expect(bugStillPresent(text, { buggyHunk: "if (i <= n) {", twins: 1 })).toBe(true);
    expect(bugStillPresent(text, { buggyHunk: "if (i <= n) {", twins: 2 })).toBe(false);
  });
});
