---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# A mutation engine seeds the bugs; the agent only chooses where

## Context and Problem Statement

In bug-hunt mode the agent must plant realistic bugs in code it just wrote, and the referee must know exactly what was planted to judge the user's finds and fixes. If the agent freehands buggy edits and records a manifest afterwards, the manifest can drift from reality and "is it fixed?" becomes guesswork. How are bugs created?

## Considered Options

* The agent writes buggy code directly and records a manifest
* `session.mjs inject --file --line --kind <kind>` applies a deterministic mutation and records it exactly
* Pre-authored exercise repositories with known bugs

## Decision Outcome

Chosen option: "`session.mjs inject` applies a deterministic mutation and records it", because the manifest can then never disagree with the code.

* The agent selects the injection point and the bug kind from a taxonomy reference bundled with the skill (off-by-one, flipped condition, missing await, wrong operator, …); the script applies the mutation, snapshots the pristine hunk and appends `{file, region, kind, buggyHunk}` to the manifest.
* `verify` becomes exact: a bug is fixed when its recorded buggy hunk no longer appears and the file still parses; `report` matches a user's claimed location by file and line proximity.
* Snapshots also power `restore`: reverting seeded hunks returns the file to its pre-session state without touching the user's fixes elsewhere ([ADR 0029](0029-learning-modes-in-one-agent-session.md)).

### Consequences

* Good, because planting, matching and verification are all deterministic — the hard part of the mode is solved once in code, not per session in prose.
* Good, because the taxonomy doubles as the difficulty model: bug kinds tier by subtlety.
* Bad, because only mutations the engine knows can be planted — line-local faults; cross-file and design-level bugs are out of scope for v1.

## Pros and Cons of the Options

### Mutation engine

* Good, because the manifest is exact by construction.
* Good, because injected bugs are guaranteed to exist and to differ from correct code.
* Bad, because it needs a real mutation engine with per-language rules; v1 covers common JS/TS and line-generic kinds.

### Agent freehands the bugs

* Good, because any kind of bug is possible, including subtle design flaws.
* Bad, because the agent must then also be trusted to record them faithfully — the referee is blind to what was actually changed, and fix verification degrades to agent judgment.

### Pre-authored exercise repositories

* Good, because bugs are perfectly known and testable.
* Bad, because it abandons learning-on-real-code ([ADR 0029](0029-learning-modes-in-one-agent-session.md)).
