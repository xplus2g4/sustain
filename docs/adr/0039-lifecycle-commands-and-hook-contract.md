---
status: accepted
date: 2026-10-14
decision-makers: implementer
---

# Lifecycle command contract and the session-hook wire format

## Context and Problem Statement

[ADR 0033](0033-session-lifecycle-lock-pause-abandon-complete.md) fixes the lifecycle — lock, pause, resume, abandon, complete — and [ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md) fixes the enforcement mechanism, but neither pins down the command outputs, the paused-phase mechanics, the staleness threshold, or the exact hook I/O. This records what `session.mjs` and `session-hook.mjs` implement.

## Considered Options

* Fix the lifecycle contract in one ADR alongside the implementation
* Scatter the details across code comments and the skill prompt

## Decision Outcome

Chosen option: "Fix the lifecycle contract in one ADR alongside the implementation", because — as with [ADR 0037](0037-session-command-contract-and-scoring.md) — the hook, skill and future webview all consume these fields.

**The `paused` phase.** `pause` records `pausedFrom` (the live phase it parked — `clarify`, `implementing` or `hunting`) in `session.json` and sets `phase: "paused"`; `resume` restores `pausedFrom` (default `implementing` for hand-edited files). `pause` on an already-paused session exits 1 with `{"status": "paused"}`; on `done` it is `bad-phase`. `resume` outside `paused` is `bad-phase`. While paused, `plan`/`inject`/`report`/`hint`/`verify`/`complete` refuse with `{"status": "paused"}` (exit 1); `status`, `pause`, `resume`, `restore` and `abandon` still work — restoring or abandoning a parked session is a deliberate act, not gameplay.

**Staleness.** A non-`done` session whose `updatedAt` is more than `STALE_IDLE_MS` (24h) old is stale — `status` reports `stale: true` plus `idleMs`, and `init` releases the lock with a warning, the same as a done or corrupt one. `paused` sessions count: pause is a break, not a way to hold the repo hostage forever (ADR 0033's whole point).

**`restore [--bug <id>]`.** For every seeded (unfixed, un-restored) bug — or the one named by `--bug` — `restoreHunk` writes the recorded `pristineHunk` back over the trimmed `buggyHunk` line nearest `region.startLine`. Only that line is written: never a pre-existing twin, never surrounding user edits, never a git reset. Outcomes are bucketed: `restored` (written back), `fixed` (hunk already absent — judged by the same `bugStillPresent` rule `verify` uses, with a `fixed` ledger event), `missing` (file gone; marked restored, nothing written), `unrestorable` (hunk present but the pristine snapshot is already deleted). A restored bug drops out of `report`/`hint`/`verify` matching and scores nothing even if found+fixed flags are set. The session stays active; `restore` in `done` is `bad-phase`.

**`abandon`.** Runs the same restore over all seeded bugs, appends an `abandoned` event with the buckets and final score, deletes `pristineHunk` snapshots like `complete`, sets `phase: "done"`, frees `.sustain/active`. Implemented step code stays; only the bugs are removed — exactly ADR 0033's promise.

**The hook wire format.** `session-hook.mjs` reads one hook-event JSON on stdin and resolves the repo via `DEVIN_PROJECT_DIR` (falling back to cwd). `PreToolUse` while `phase === "hunting"` exits 2 **and** prints `{"decision": "block", "reason": …}` (belt-and-braces: Devin honours either channel, and the reason also goes to stderr). The blocklist is `edit`, `write`, `apply_patch`, `notebook_edit`, `run_subagent` — ADR 0032's list plus `notebook_edit`, which is the same file-mutation surface. `exec` is deliberately not blocked: the session commands themselves run through it. `UserPromptSubmit`, `PostCompaction` **and `SessionStart`** print `hookSpecificOutput.additionalContext` with run, phase, step, found/fixed/score and a phase-appropriate instruction — SessionStart is added beyond ADR 0032 so a fresh agent session also re-grounds. Anything else — no lock, corrupt session, unparsable stdin, unrelated events — exits 0 silently: a hook must never jam a repo without a live hunt.

**`hooks.v1.json`.** Hand-written at `.devin/hooks.v1.json` using `node "$DEVIN_PROJECT_DIR/.agents/skills/sustain-bugfix/scripts/session-hook.mjs"` — the installed-skill path, identical to what the Phase-3 installer will merge into user repos. A missing script exits non-2, which Devin logs without blocking, so the file is inert wherever the skill is absent.

### Consequences

* Good, because every new state transition and hook verdict is script-confirmed and unit-tested like the v1 contract.
* Good, because the committed hooks file is already the production shape — Phase 3 only adds merging.
* Bad, because a paused session older than 24h loses its lock on the next `init` — the run folder survives but nothing can resume it; acceptable per ADR 0033's no-hostage rule.
* Bad, because `exec` staying open means a determined agent could still `sed` a file during hunting — the blocklist covers the declared mutation tools, prompt rules cover the rest (ADR 0032 accepts this gap).

## Pros and Cons of the Options

### One ADR for the lifecycle + hook contract

* Good, because Phase-2 decisions land next to ADR 0037's Phase-1 contract in one reviewable record.
* Bad, because future per-mode hooks (guided) will supersede parts again.

### Scatter the details

* Good, because nothing to maintain.
* Bad, because the hook's fail-open behaviour and the paused gate are precisely the details an implementer will re-litigate.
