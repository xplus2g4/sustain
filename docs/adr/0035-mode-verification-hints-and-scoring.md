---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Mode verification contracts, hints and scoring

## Context and Problem Statement

The referee must judge "did the user find it / fix it" deterministically, per mode, and reduce sessions to a score for the leaderboard. What does each mode check, how do hints work, and what is scored?

## Considered Options

* Per-mode verification rules feeding a shared scoring ledger (details below)
* Agent judgment for everything — the model decides what counts
* Test-suite-only verification for every mode

## Decision Outcome

Chosen option: "Per-mode verification rules feeding a shared scoring ledger", because every scored event must be script-confirmed rather than left to model judgment.

**Mode contract.** Modes plug into the session core via `init`/`status`/`verify`/`score`/`restore`; run folders, phases, the event ledger and the lock are shared ([ADR 0030](0030-session-state-machine-as-bundled-scripts.md)). Only bug-hunt ships first; guided plugs in later.

**Bug-hunt mode.**

* At hunt start the agent names the step's touched files — already known to the user, who watched the step being written — and never lines, kinds or per-file counts. Hiding the file list would be grep-the-repo difficulty, not pedagogy.
* `report --file <f>`: file-level match — the script confirms `<f>` holds an unfixed seeded bug; the agent judges the user's *description* before calling `report`, so a right file with a nonsense explanation does not score. Line-level matching fights line-shift as fixes land and adds precision the pedagogy does not need.
* `verify`: a bug is fixed when its recorded buggy hunk is absent and the file still parses. The project's test suite is a bonus signal, not the gate — real repositories may lack tests.

**Guided mode.** `plan` declares a check command per step (`npm test -- --grep x`, a smoke script, `tsc`…); `verify` runs the current step's check and reports pass/fail. Coverage is only as good as the declared check — accepted; the agent may show a suggested diff after the check passes, for learning.

**Hints.** A skill-defined ladder — L1 region nudge, L2 kind reveal, L3 near-explicit. `session.mjs hint --level N --bug <id>` appends to `events.jsonl`, so the deduction is deterministic and no hint is free.

**Scoring.** Points per bug found *and* fixed × difficulty-tier multiplier − hint deductions; agent edit attempts blocked by hooks do not count against the user. Tiers come from the bug taxonomy (T1 line-local, T2 control-flow/async, T3 cross-file); how levels are differentiated is deferred to a later design pass (backlog).

### Consequences

* Good, because every scored event is script-confirmed — the leaderboard rests on the ledger, not on model memory.
* Good, because guided and future modes need only a `verify` rule and scoring weights to join.
* Bad, because file-level report matching is coarse, and guided-mode check quality depends on the agent's plan.
