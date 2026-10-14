---
status: accepted
date: 2026-10-14
decision-makers: implementer
---

# Mutation engine v1: three kinds as ordered rewrite tables on one line

## Context and Problem Statement

[ADR 0031](0031-mutation-engine-seeds-the-bugs.md) decides that `inject` applies a deterministic mutation — but not which bugs the engine knows or how it finds them in source text. A mutation that misfires (rewrites a string literal, an arrow `=>`, or the wrong operator of two on a line) would either plant no bug or plant a different one than the manifest records. What are the v1 rules?

## Considered Options

* Ordered per-kind rewrite tables over a comment/string-aware line mask
* A real JS/TS parser (AST) driving structured mutations
* Plain regexes over the raw line

## Decision Outcome

Chosen option: "Ordered per-kind rewrite tables over a comment/string-aware line mask", because it is dependency-free, deterministic, and the failure mode is "no target" rather than a wrong mutation.

* **Scope.** Exactly three kinds ship first — `off-by-one`, `flipped-comparison`, `missing-await` — all single-line JS/TS faults (T1/T2 of [ADR 0035](0035-mode-verification-hints-and-scoring.md)). The target line is the `--line` argument exactly; there is no fuzzy search — an unmutatable line is an `inject` error, not a surprise elsewhere.
* **Code mask.** Before matching, each line is scanned for `'…'`/`"…"`/`` `…` `` strings (with escapes), `//` line comments and `/* … */` inline block comments; a candidate match must lie entirely outside them. Template-literal `${…}` contents count as string in v1 — conservative: the engine simply declines to mutate there.
* **Tables.** The first rule with a code-region match wins; each rule replaces its whole match once. Off-by-one shifts the bound keeping direction: `<`→`<=`, `<=`→`<`, `>`→`>=`, `>=`→`>` (in that order). Flipped-comparison reverses the test: `===`↔`!==`, `<=`↔`>=`, `<`↔`>`, `==`↔`!=`. Missing-await deletes `await` plus following whitespace. Lookarounds keep `=>`, `<<`/`>>`, `<<=`/`>>=` and `===`/`!==` from being split mid-token, and `.`-prefixed `await` (a property name) out.
* **Limits, accepted.** No regex-literal or multi-line awareness; a mutation is one token on one line. A line where the rewrite is a no-op is refused.

### Consequences

* Good, because every seeded bug is exactly one token away from pristine — easy to verify, easy to reason about, and `restore` can swap the hunk back mechanically.
* Good, because the tables are the difficulty model: adding a kind is appending a rules list, never touching the state machine.
* Bad, because real bugs are not always one token; the taxonomy must grow (cross-file, multi-line) before bug-hunt feels like real debugging — tracked in the backlog.

## Pros and Cons of the Options

### Ordered rewrite tables + code mask

* Good, because deterministic and dependency-free — the whole engine is a pure function of file text.
* Good, because failures are legible: "line N has no <kind> target" instead of a subtly wrong edit.
* Bad, because it understands text, not syntax — a comparison inside a regex literal could be misread.

### A real parser (AST)

* Good, because mutations could target nodes semantically (loop bounds only, real awaits).
* Bad, because it needs a JS/TS parser dependency inside a bundle that ships dependency-free, and v1 kinds do not need it.

### Plain regexes, no mask

* Good, because simplest.
* Bad, because `"a < b"` in a string or `// i < n` in a comment would produce plausible-looking non-bugs — the worst failure mode for a learning tool.
