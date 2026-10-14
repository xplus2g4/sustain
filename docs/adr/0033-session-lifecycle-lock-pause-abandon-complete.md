---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Session lifecycle: lock, pause, resume, abandon, complete

## Context and Problem Statement

A learning session can span days and shares the repository with the user's normal work — including unrelated agent sessions, which the hunt-phase hooks ([ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md)) would otherwise keep blocking forever. How does a session start, pause, resume, end and expire?

## Considered Options

* An explicit lifecycle: `init` takes a single-session lock; `pause`/`resume` toggle enforcement; `complete` keeps the code; `abandon` restores pristine hunks; stale sessions auto-expire
* Sessions run until finished — hooks stay armed for the duration
* Time-boxed sessions only

## Decision Outcome

Chosen option: "An explicit lifecycle", because a forgotten session must not hold the repository hostage.

* One active session per repository: `.sustain/active` names the live run and `init` refuses or warns while another is active — this prevents double-seeding the same files and leaked enforcement state.
* `pause` sets `phase: paused`; the hook goes inert and the user works normally. `resume` re-arms. `status` flags sessions idle past a threshold, the skill offers resume or `abandon`, and stale sessions auto-release the lock.
* `complete`: the user's fixed code is already the correct end state; pristine snapshots are deleted and the run folder plus `events.jsonl` are kept for the leaderboard audit, as `.archify/` runs are kept.
* `abandon`: `restore` writes the pre-mutation hunks back — the user keeps the agent's correct implementation and loses only their fix attempts — then releases the lock. Never a git reset; `init` warns on a dirty tree so restore stays meaningful.

### Consequences

* Good, because interruption is safe: the enforcement state is always recoverable or releasable.
* Good, because `abandon` is safe by construction — only seeded hunks are restored, never user work.
* Bad, because `restore` is only as precise as the recorded hunks, and heavy user edits around a seeded region can make restoration fuzzy.

## Pros and Cons of the Options

### Explicit lifecycle

* Good, because every state is reachable and releasable.
* Bad, because it adds commands and an idle-expiry policy to the state machine.

### Run until finished

* Good, because there is nothing to expire.
* Bad, because a paused or forgotten session blocks edits in the repo indefinitely ([ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md)).

### Time-boxed sessions

* Good, because expiry is automatic.
* Bad, because learning does not fit a fixed window — a user may legitimately hunt for days.
