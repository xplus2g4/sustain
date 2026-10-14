---
status: accepted
date: 2026-10-14
decision-makers: owner
---

# Session state machine as bundled scripts, not an MCP server

## Context and Problem Statement

A learning session needs a referee: phase transitions, the bug manifest, fix verification and scoring must be deterministic and must not depend on the agent's memory or goodwill — the whole point is that the user, not the agent, does the work. What executes that logic?

## Considered Options

* Bundled `session.mjs` scripts beside the skill — the `repo-facts.mjs`/`validate.mjs` pattern ([ADR 0007](0007-validator-as-dependency-free-node-bundles.md))
* A `sustain` MCP server exposing session tools (`mcp__sustain__*` in Devin)
* Session state held in the skill prompt, managed by the agent

## Decision Outcome

Chosen option: "Bundled `session.mjs` scripts beside the skill", because the contract, testability and offline behaviour are already proven by the diagram flow.

* One dependency-free `.mjs` bundle per entry point, built from `src/agent/` TypeScript and sharing `src/model/`; the agent invokes them with `node` from the repository root. Each command prints one JSON object and uses the validator's exit-code contract ([ADR 0017](0017-validator-output-contract-and-exit-codes.md)).
* Command surface (fixed by the spec, indicative here): `init`, `plan`, `inject`, `status`, `report`, `verify`, `restore`, `abandon`, `complete`. `status` is the re-grounding call: the skill instructs the agent to run it at the start of every turn while a session is active, so the state machine — not model memory — is authoritative across compaction.
* State lives on disk in `.sustain/<run>/` (run-folder convention as in `.archify/`, [ADR 0013](0013-archify-json-v1-and-archify-folder-layout.md)): `session.json` plus mode files; the extension watches it exactly as it watches candidates today.
* The scripts reject illegal transitions themselves — the agent cannot mark a phase done without the command's checks passing.

### Consequences

* Good, because one TypeScript model serves extension, webview and scripts, with an existing test harness for `node` child processes.
* Good, because the flow still works on Claude Code and Codex targets ([ADR 0003](0003-target-claude-code-and-codex.md)) and fully offline (NFR-SEC-02).
* Bad, because tool calls are shell commands — coarser than an MCP tool schema — and the agent could invoke commands out of order; mitigated by transition checks inside the scripts.

## Pros and Cons of the Options

### Bundled `session.mjs` scripts

* Good, because the pattern, build pipeline and test style already exist.
* Good, because nothing must be configured per repository beyond installing the skill.
* Bad, because orchestration rules live in the prompt; only the scripts' own checks prevent misuse.

### MCP server

* Good, because tool calls are structured and self-describing, and a long-lived server could hold session state in memory.
* Bad, because it needs `.devin/mcp_config.json` in every target repo (or user config), an always-on process, and breaks Claude/Codex portability; defer until the extension itself wants to be the state server.

### Agent-managed state in the prompt

* Good, because nothing ships.
* Bad, because the agent can skip phases, forget after compaction, or fix the bugs it planted — the learning contract is unverifiable.
