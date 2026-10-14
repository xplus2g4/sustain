---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Session install: skills into .agents, managed hooks per agent config

## Context and Problem Statement

Learning sessions need the skill installed where each agent finds it plus the enforcement hooks ([ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md)) — inside the user's repository, without breaking config the user already has. Where does each piece go, and who manages it over the extension's lifetime?

## Considered Options

* Extend the existing installer: `.agents/skills/` canonical, plus Sustain-namespaced entries in `.devin/hooks.v1.json` (and `.claude/settings.json` for Claude)
* Install skills per-agent: `.devin/skills/` for Devin, `.claude/skills/` for Claude
* User-level config for everything (`~/.config/devin/`)

## Decision Outcome

Chosen option: "Extend the existing installer", because `.agents/skills/` already reaches Devin and the hooks only need a merge, not a new install surface.

* Devin loads skills from `.agents/skills/` (verified in this repository), so `writeSkill` stays the single canonical install ([ADR 0006](0006-install-skill-into-agents-with-claude-symlink.md)); no `.devin/skills/` symlink is needed. The `.claude` symlink remains for Claude targets.
* Hooks are project-local, not user-level: `.devin/hooks.v1.json` lives in repos that run sessions and leaves other projects untouched.
* The extension adds clearly-marked Sustain entries, rewrites *only those* on extension update, and removes them on uninstall — deleting the file only if it becomes empty. Never a blind overwrite: a user's own hooks must survive.
* Claude targets get the equivalent entries in `.claude/settings.json` with tool-name normalisation ([ADR 0032](0032-hunt-phase-enforcement-via-devin-hooks.md)).

### Consequences

* Good, because the user's own hooks and config are never clobbered, and upgrades are merges rather than reinstalls.
* Good, because install stays one code path in `skillFiles.ts` plus a hooks step.
* Bad, because merging must be idempotent and tolerant of hand-edited files — the Sustain block needs unambiguous markers.

## Pros and Cons of the Options

### `.agents/skills/` + managed hooks entries

* Good, because nothing duplicates and the merge surface is small.
* Bad, because merge/uninstall logic must be written carefully.

### Per-agent skill directories

* Good, because each agent's native location is used.
* Bad, because the same skill ships twice; Devin does not need `.devin/skills/`.

### User-level config

* Good, because nothing lands in the user's repo.
* Bad, because hooks would fire in every project for a per-repo feature, and the skill is meant to travel with the workspace.
