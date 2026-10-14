---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Hunt-phase enforcement via Devin lifecycle hooks

## Context and Problem Statement

During the hunt phase the agent must not edit code or spawn subagents to fix the bugs it planted — the session reward ("finished without running the AI") is only meaningful if the agent mechanically cannot help. Prompt rules alone are a suggestion the model can violate. How is the learning contract enforced?

## Considered Options

* Prompt-only rules in the skill
* `.devin/hooks.v1.json` lifecycle hooks that block writes while the session is hunting
* Devin permission rules denying edits

## Decision Outcome

Chosen option: "`.devin/hooks.v1.json` lifecycle hooks that block writes while the session is hunting", because hooks are phase-aware and make "not AI-reliant" mechanically true.

* A `PreToolUse` hook script reads the active `.sustain/<run>/session.json`; while `phase` is `hunting` it blocks `edit`, `write`, `apply_patch` and `run_subagent` (exit 2 with a "user is hunting" reason). With no active session the hook is inert.
* `UserPromptSubmit` and `PostCompaction` hooks inject session state (phase, found/total) as `additionalContext`, so the agent re-grounds every turn without trusting memory — backing up the `status` command of [ADR 0030](0030-session-state-machine-as-bundled-scripts.md).
* Permission rules were rejected: they are static config and cannot express "deny edits only while a session file says hunting".
* The extension installs the hooks file next to the skill, merging into an existing `.devin/hooks.v1.json` — never overwriting — and namespacing Sustain's entries.

### Consequences

* Good, because the no-assist rule and the scoring claim behind the leaderboard are enforced, not hoped for.
* Good, because hook scripts can reuse `src/model/` session-state code like every other entry point.
* Bad, because `.devin/` lands in the user's repository: the file must be merge-safe, documented as Sustain-managed, and harmless for non-session Devin use.
* Bad, because enforcement strength now differs per agent target — see below.

### Consequences for Claude Code and Codex

The feature targets Devin first, but the skill remains multi-agent ([ADR 0003](0003-target-claude-code-and-codex.md)):

* **Devin CLI**: full enforcement as described.
* **Claude Code**: Claude has the same hook concept (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`) configured through `.claude/settings.json` — the same hook scripts port over with tool-name normalisation (Claude's `Edit`/`Write` vs Devin's `edit`/`write`). A Claude-targeted install writes the matching entries into `.claude/settings.json`, again merge-safe.
* **Codex**: no lifecycle-hook mechanism. Enforcement degrades to (a) the `session.mjs` gate — phases still cannot advance or be faked without the script's checks — and (b) prompt rules, which do not physically stop edits during a hunt. The "no AI assist" claim is honor-system there. If that is unacceptable for a mode, restrict that mode's session to Devin/Claude targets.
