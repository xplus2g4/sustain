---
status: accepted
date: 2026-10-14
decision-makers: implementer
---

# session.mjs v1 command contract, phases and scoring weights

## Context and Problem Statement

ADRs [0030](0030-session-state-machine-as-bundled-scripts.md), [0033](0033-session-lifecycle-lock-pause-abandon-complete.md), [0034](0034-sustain-folder-layout-and-session-state-files.md) and [0035](0035-mode-verification-hints-and-scoring.md) fix the shape of a learning session — bundled commands, a per-repo lock, three state files, file-level report matching — but leave the command outputs, phase-transition table, score weights and edge cases unspecified. This records the contract `session.mjs` v1 implements.

## Considered Options

* Fix the v1 contract in one ADR alongside the first implementation
* Leave every detail to the skill prompt and future ADRs

## Decision Outcome

Chosen option: "Fix the v1 contract in one ADR alongside the first implementation", because the contract is a cross-module interface the skill, hooks and extension webview will all be written against.

**Phases.** `clarify → implementing → hunting → done`. `plan` moves clarify → implementing; `inject` moves implementing → hunting (a second `inject` in the same step stays hunting); `verify` moves hunting → implementing of the next step, or → done after the last step. `verify` in the implementing phase advances a step that has no seeded bugs, so bug-free steps stay expressible; `verify` in done is idempotent-ok. The `paused` phase of ADR 0033 arrives with the `pause`/`resume` commands and is not part of the v1 union.

**Output and exits.** Every command prints one JSON object ([ADR 0017](0017-validator-output-contract-and-exit-codes.md)): `{"status": "ok", …}` on success (exit 0); a domain result like `miss`, `still-buggy`, `check-failed`, `unparseable`, `bad-phase`, `no-session`, `active`, `not-complete`, `not-found`-style failures on exit 1; usage and I/O errors on stderr only with exit 2 — matching validate.mjs. `status` prints `{"status": "none"}` and exits 0 when no session is active, since "no session" is a valid answer to a query, not a failure.

**Command specifics.**

* `init --mode bugfix [--name <text>]` creates `.sustain/bugfix-<slug>-<ts>[-N]/` with the three files and writes the run name to `.sustain/active`. It refuses (`{"status": "active"}`) while a live session holds the lock, and treats the lock as stale — releasing it with a warning — when the named run is missing or its `session.json` is unreadable or already `done`. Git facts are collected *before* `.sustain/` is created so the session's own files never count in the dirty-tree warning (ADR 0029).
* `plan --steps <json>` takes `[{"title":…,"files":[…]}, …]` or bare title strings; runs only in clarify.
* `inject --file --line --kind` applies the mutation ([ADR 0031](0031-mutation-engine-seeds-the-bugs.md)), records `{id: "bug-N", step, file, region, kind, pristineHunk, buggyHunk, twins, found, fixed, hints}` in `manifest.json` and sets phase hunting. Files are realpath-resolved inside the repo root; the deny list plus `.sustain/` itself are off-limits, and v1 kinds only apply to `.js/.jsx/.ts/.tsx/.mjs/.cjs/.mts/.cts`.
* `report --file` marks the first unreported unfixed bug in that file `found` — one bug per call, so a second call for a file with two bugs reports the other. No phase gate: the manifest decides, anything else is a `miss` (ADR 0035).
* `hint --level <1|2|3> [--bug <id> | --file <f>]` appends a `hint` event and deducts; without a selector it hints the first unfixed bug of the current step. Hints on already-fixed bugs are refused.
* `verify [--check-cmd <cmd>]` checks every unfixed bug: buggy hunk gone and the file still parses → `fixed` (a `fixed` event each). Remaining bugs → `still-buggy` (exit 1) but earned fixes persist. A missing file → error; a file that no longer parses → `unparseable`. "Parses" is `node --check` for `.mjs`/`.cjs` only — the two extensions Node parses unambiguously; every other extension relies on `--check-cmd` (run through the shell, its failure tails are echoed in the output). All fixed → a `verified` event and the step advances.
* `complete` requires phase `done`, appends `completed` with the score, deletes every `pristineHunk` (the audit keeps `buggyHunk`), frees `.sustain/active`. `status` then reports `none` while the run folder and `events.jsonl` stay (ADR 0033).

**Fix detection.** A bug is fixed when the count of trimmed `buggyHunk` lines in the file drops to the `twins` count recorded at injection — the pre-existing identical lines — so a duplicate line elsewhere can neither fake a fix nor block one. Reindentation still counts as present (trimmed compare); a rewritten line counts as fixed. Hunks are single lines in v1.

**Scoring.** `score = max(0, Σ TIER_POINTS[kind] over bugs found *and* fixed − Σ HINT_COST[level])`, recomputed deterministically from the manifest after every state change: T1 10, T2 20, T3 30 points; hints cost 5/10/15. Kind → tier: `off-by-one` and `flipped-comparison` are T1 (line-local), `missing-await` is T2 (async control flow). A fix that was never `report`ed earns nothing — "found and fixed" is read literally, so the agent's judging of the user's description stays on the scoring path (ADR 0035).

### Consequences

* Good, because the whole contract is executable and testable; the skill, hooks and webview all consume the same fields the tests assert.
* Good, because scoring is a pure function of the manifest — replaying `events.jsonl` reproduces the leaderboard.
* Bad, because a user who fixes a bug without describing it loses the find; the skill must teach "describe it, wait for the agent to call report" as the flow.
* Bad, because `--check-cmd` runs an agent-supplied shell string; acceptable only because the invoking agent can already run shell commands — it adds no capability.

## Pros and Cons of the Options

### One ADR for the v1 contract

* Good, because every deferred detail lands in one reviewable place next to the code that implements it.
* Bad, because the contract will be superseded piecemeal as pause/resume, hooks and guided mode arrive.

### Leave details to the skill prompt

* Good, because no record to maintain.
* Bad, because the referee's behaviour would be undiscoverable except by reading the script — exactly what the ADRs exist to prevent.
