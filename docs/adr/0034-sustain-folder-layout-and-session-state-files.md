---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# .sustain run-folder layout and session state files

## Context and Problem Statement

A learning session needs on-disk state that the referee scripts can read and write, the extension can watch and render, and that never exposes the bug answers to the webview — or trivially to the user standing in the same repository. Where does session state live and in what shape?

## Considered Options

* `.sustain/<mode>-<slug>-<ts>[-N]/` with separate `session.json`, `events.jsonl` and `manifest.json`
* One `session.json` containing state, ledger and secrets
* Session state in the extension's `globalStorage`

## Decision Outcome

Chosen option: "`.sustain/<mode>-<slug>-<ts>[-N]/` with separate `session.json`, `events.jsonl` and `manifest.json`", because the run-folder machinery already exists and the trust boundary is cleanest at file level.

* `session.json` — the public snapshot: mode, phase, step index, found/fixed counts, score-so-far, timestamps. The only file the extension watches and renders; it shows phase, progress and score, never locations or kinds — matching the existing "webview receives diagram JSON only, never file contents" boundary (NFR-SEC-01).
* `events.jsonl` — the append-only ledger (`found`, `fixed`, `hint`, `paused`, `resumed`, `completed`); the local leaderboard derives from it and audits replay.
* `manifest.json` — seeded regions, bug kinds and pristine/buggy hunks; written by `inject`, read only by `report`/`verify`/`restore`.
* `.sustain/active` names the live run — the hook's fast path ([ADR 0033](0033-session-lifecycle-lock-pause-abandon-complete.md)); missing file means inert.
* Run folders reuse `createRunFolder` naming ([ADR 0018](0018-repo-facts-creates-the-run-folder.md)); the extension appends `.sustain/` to the repo `.gitignore` on install. With a local leaderboard, in-repo storage is self-policed — a user who peeks only cheats themselves; revisit when a shared leaderboard exists.

### Consequences

* Good, because run-folder, watcher and gitignore mechanics are all reused from the diagram flow.
* Good, because the secret boundary needs no reader discipline — the webview never touches `manifest.json`.
* Bad, because a determined user can still read the manifest; accepted while scoring is local, flagged for the shared-leaderboard ADR.

## Pros and Cons of the Options

### Three files in a `.sustain` run folder

* Good, because snapshot, ledger and secrets have different readers and lifetimes.
* Good, because file-level separation is enforceable, unlike field-level.

### One `session.json`

* Good, because there is one file to watch.
* Bad, because it mixes public rendering data with secrets and makes the ledger overwrite-prone.

### Extension `globalStorage`

* Good, because the manifest is truly hidden from the repo.
* Bad, because out-of-repo paths must be threaded through every script call and across agents.
