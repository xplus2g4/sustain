---
status: accepted
date: 2026-10-15
decision-makers: implementer
---

# Hooks-merge mechanics, session-panel read side and Devin CLI detection

## Context and Problem Statement

[ADR 0036](0036-session-install-skills-and-managed-hooks.md) decides the extension merges a managed block into `.devin/hooks.v1.json`, and [ADR 0034](0034-sustain-folder-layout-and-session-state-files.md) fixes the `.sustain/` layout the panel reads — but neither pins down how a JSON file without comments marks "our" entries, how the panel picks which run to show, or how the launcher finds `devin` when it is not on PATH. This records what `hooksFiles.ts`, `sessionFiles.ts`/`sessionPanel.ts`/`sessionWatcher.ts` and `devin.ts`/`learn.ts` implement.

## Considered Options

* Fix the Phase-3 contract in one ADR alongside the implementation
* Scatter the details across code comments and command help

## Decision Outcome

Chosen option: "Fix the Phase-3 contract in one ADR alongside the implementation", because — as with ADRs [0037](0037-session-command-contract-and-scoring.md) and [0039](0039-lifecycle-commands-and-hook-contract.md) — the merge rule, the read contract and the detection order are all things a future agent-surface port (guided mode, other CLIs) will consume.

**The merge marker.** `hooks.v1.json` is JSON — no comments, so a "Sustain block" cannot be a marked region. A hook *object* is ours iff `command` contains `.agents/skills/sustain-` (the installed-skill path prefix all Sustain hooks share). Merge = strip every such object from every event group, then append the fresh `sustainHooks()` block: rewriting ours on update, preserving everything else byte-for-byte in structure — user hook objects, unknown top-level keys (foreign metadata), and groups that do not match the `{matcher, hooks}` shape all pass through untouched. Idempotent: a second merge is a no-op. A corrupt or non-object file throws; the install command reports the warning and nothing is overwritten — a hooks file is user config, never regenerated. `removeHooks` strips the same objects and deletes the file only when nothing else remains. The `.gitignore` step appends `.sustain/` unless a `.sustain` or `.sustain/` line already exists, creating the file when missing. `ensureSessionAssets` runs both on every `install` *and* every session launch — the merge is cheap and idempotent, so a deleted `.devin/` self-heals.

**The read side.** `sessionFiles.ts` is the only reader: the shown run is the one `.sustain/active` names (when it still exists) else the newest `session.json`-holding run; every run folder gets a leaderboard row aggregated from `session.json` + `events.jsonl` — `manifest.json` is never opened, keeping the webview trust boundary at the file layer, not just the code layer. Rows rank by score, then recency, then name; a run without a closing event is `active` when it holds the lock, else `interrupted`. `SessionView` carries only `session.json` fields plus `serverNow`, so the webview's elapsed timer offsets from host time instead of trusting its own clock.

**The watcher.** A separate `SessionWatcher` — not a generalisation of the `.archify` candidate watcher, which navigates-and-notifies on a different trigger — watches `.sustain/active` and `.sustain/*/session.json` per workspace folder, reusing `ChangeBatch`'s debounce. Every change just reloads the panel: a session writes `session.json` many times per turn, so there is nothing to notify.

**Devin detection.** `devin` resolves in order: PATH (`findOnPath`, the same lookup `agents.ts` uses), the per-user version store `~/.local/share/devin/cli/current/bin/devin`, then the Devin Desktop bundle (`/Applications/Devin.app/…/devin/bin/devin` on macOS, `%LOCALAPPDATA%\Programs\Devin\…\devin.exe` on Windows). The terminal launches with `shellPath`/`shellArgs` exactly like `generateArchitectureCommand` (ADR 0020): `devin -- "/sustain-bugfix <task>"`, the `--` keeping the slash-prompt out of option parsing. When nothing resolves, the warning offers to copy the prompt instead of failing silently.

### Consequences

* Good, because the merge is marker-based, it survives a user hand-editing anything except our own hook commands — and those are exactly the entries an update should rewrite.
* Good, because the launch path re-verifies assets every time, a user deleting `.devin/` or the gitignore line does not silently lose enforcement.
* Bad, because a hook command containing `.agents/skills/sustain-` that is *not* ours (a user's own fork with a matching layout) would be rewritten as ours — accepted: the marker is documented and the layout is ours by convention.
* Bad, because three hard-coded install locations will lag Devin's packaging changes — each miss degrades to a clear warning, not a failure.

## Pros and Cons of the Options

### One ADR for the Phase-3 contract

* Good, because the marker rule and the read contract are the kind of detail Phase 4 (guided mode, more agents) must not re-litigate.
* Bad, because it records choices that may need revisiting if Devin's hooks schema gains namespacing.

### Scatter the details

* Good, because nothing extra to maintain.
* Bad, because "which entries are ours" is a data-integrity rule — exactly the sort of decision that looks arbitrary without a record.
