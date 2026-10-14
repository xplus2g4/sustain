---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Learning modes run in one agent session in the user's repository

## Context and Problem Statement

Sustain expands from diagram viewing into guided learning modes — bug hunt, guided build, buddy tour — where the agent builds real code while the user does the finding and fixing. A session is a multi-turn interaction loop (clarify → plan → per-step implement/inject → hunt → fix → verify), not a one-shot artifact run. Where does that loop execute, and on which repository?

## Considered Options

* One interactive agent session in the user's repository; the extension launches it and watches session state
* The extension orchestrates phases via non-interactive agent invocations
* Learning in a separate exercise or sandbox repository

## Decision Outcome

Chosen option: "One interactive agent session in the user's repository", because the conversation itself is the loop and the finished, user-fixed code is real work the user keeps.

* Devin's non-interactive mode (`devin -p`) cannot ask the user questions or wait for input mid-run, so a per-phase subprocess orchestration cannot host the loop. The extension's role stays the same as for diagrams: launch the agent terminal, watch the state directory, render results — now progress and leaderboard instead of a diagram.
* The hunt loop is per plan step: implement → inject → user finds and fixes → verify → next step. The skill caps injection at roughly one or two bugs per step and merges trivial steps in the plan.
* Sessions run in real code the user intends to keep, so seeded bugs must be restorable: [ADR 0031](0031-mutation-engine-seeds-the-bugs.md) snapshots pristine hunks and `session.mjs` provides `restore`/`abandon`.
* A clean-git warning at `init` is required so restoration and review diffs stay meaningful.

### Consequences

* Good, because learning happens on real work; the user ends with correct, reviewed code in their own project.
* Good, because no new UI surface is needed for the loop — the agent's chat and Devin's `ask_user_question` carry it.
* Bad, because an abandoned session can leave seeded bugs in real files; restore and stale-session handling are mandatory, not optional.
* Bad, because session state must survive context compaction; hooks re-inject it ([ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md)).

## Pros and Cons of the Options

### One interactive session in the user's repository

* Good, because the user learns on the code they actually ship.
* Good, because ask/clarify/hunt/fix turns need no orchestration layer.
* Bad, because mistakes touch real files; the safety net must be solid.

### Extension orchestrates non-interactive runs

* Good, because the extension could drive a strict state machine.
* Bad, because non-interactive invocation cannot prompt the user, which is the core of every phase.

### Sandbox / exercise repository

* Good, because nothing real is at stake.
* Bad, because exercises are artificial; the pitch is learning while building real things, faster than unaided coding.
