# Architecture decision records

Decisions for Sustain in [MADR 4.0](https://adr.github.io/madr/) format; the process is [ADR 0001](0001-record-architecture-decisions-with-madr.md). New ADRs copy [`template.md`](template.md), take the next free number, and are added to this table in the same change. `npm run check:docs` verifies the files and this index.

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-record-architecture-decisions-with-madr.md) | Record architecture decisions with MADR | accepted | 2026-10-10 |
| [0002](0002-external-coding-agent-generates-diagrams.md) | External coding agent generates diagrams through a skill | accepted | 2026-10-10 |
| [0003](0003-target-claude-code-and-codex.md) | Target Claude Code and Codex | accepted | 2026-10-10 |
| [0004](0004-one-skill-with-bundled-scripts.md) | One skill with bundled repo-facts and validate scripts | accepted | 2026-10-10 |
| [0005](0005-manual-invocation-and-claude-pre-approvals.md) | Manual skill invocation and Claude tool pre-approvals | accepted | 2026-10-10 |
| [0006](0006-install-skill-into-agents-with-claude-symlink.md) | Install the skill into .agents/skills with a .claude symlink | accepted | 2026-10-10 |
| [0007](0007-validator-as-dependency-free-node-bundles.md) | Validator and repo facts as dependency-free Node bundles | accepted | 2026-10-10 |
| [0008](0008-validator-publishes-draft-as-candidate.md) | Validator publishes draft.json as candidate.json | accepted | 2026-10-10 |
| [0009](0009-validator-owns-geometry-and-meta-fields.md) | Validator owns geometry, presentation and repository metadata | accepted | 2026-10-10 |
| [0010](0010-elkjs-layout-in-the-webview.md) | elkjs layout in the webview, authored positions when complete | accepted | 2026-10-10 |
| [0011](0011-webview-panel-viewer-with-code-beside.md) | WebviewPanel viewer with code in the other column | accepted | 2026-10-10 |
| [0012](0012-no-validation-on-load-tolerant-parsing.md) | No validation on load; tolerant parsing; stale citations reported on click | accepted | 2026-10-10 |
| [0013](0013-archify-json-v1-and-archify-folder-layout.md) | Archify JSON v1 and the .archify folder layout | accepted | 2026-10-10 |
| [0014](0014-desktop-vscode-vsix-single-folder.md) | Desktop VS Code, .vsix install, one chosen folder | accepted | 2026-10-10 |
| [0015](0015-typescript-esbuild-vitest-plain-svg-webview.md) | TypeScript, npm, esbuild, vitest; plain TypeScript SVG webview | accepted | 2026-10-10 |
| [0016](0016-build-test-and-docs-check-harness.md) | Build, test and docs-check harness | accepted | 2026-10-10 |
| [0017](0017-validator-output-contract-and-exit-codes.md) | Validator output contract and exit codes | accepted | 2026-10-11 |
| [0018](0018-repo-facts-creates-the-run-folder.md) | repo-facts.mjs creates the run folder | accepted | 2026-10-11 |
| [0019](0019-validator-deviations-from-the-prototype-gate.md) | Validator deviations from the prototype's submission gate | accepted | 2026-10-11 |
| [0020](0020-launch-agent-terminal-with-shellpath-and-shellargs.md) | Launch the agent terminal with shellPath and shellArgs | accepted | 2026-10-11 |
| [0021](0021-command-ui-details-not-fixed-by-the-spec.md) | Command UI details not fixed by the spec | accepted | 2026-10-11 |
| [0022](0022-authored-straight-edges-and-overlay-boundaries.md) | Straight clipped edges in authored mode; overlay rectangles for overlapping boundaries | accepted | 2026-10-11 |
| [0023](0023-auto-layout-direction-by-fit-scale.md) | Auto layout direction chosen by fit scale | accepted | 2026-10-11 |
| [0024](0024-theme-colour-mapping-and-svg-styling.md) | Theme colour mapping and SVG styling | accepted | 2026-10-11 |
| [0025](0025-viewer-details-not-fixed-by-the-spec.md) | Viewer details not fixed by the spec | accepted | 2026-10-11 |
| [0026](0026-activate-test-hook-and-happy-dom-tests.md) | activate() test hook and happy-dom DOM tests | accepted | 2026-10-11 |
| [0027](0027-navigation-and-watching-details.md) | Navigation and watching details | accepted | 2026-10-11 |
| [0028](0028-package-with-vsce-without-license-or-repository.md) | Package with vsce, without LICENSE or repository metadata | accepted | 2026-10-11 |
| [0029](0029-learning-modes-in-one-agent-session.md) | Learning modes run in one agent session in the user's repository | accepted | 2026-10-14 |
| [0030](0030-session-state-machine-as-bundled-scripts.md) | Session state machine as bundled scripts, not an MCP server | accepted | 2026-10-14 |
| [0031](0031-mutation-engine-seeds-the-bugs.md) | A mutation engine seeds the bugs; the agent only chooses where | accepted | 2026-10-14 |
| [0032](0032-hunt-phase-enforcement-via-devin-hooks.md) | Hunt-phase enforcement via Devin lifecycle hooks | accepted | 2026-10-14 |
| [0033](0033-session-lifecycle-lock-pause-abandon-complete.md) | Session lifecycle: lock, pause, resume, abandon, complete | accepted | 2026-10-14 |
| [0034](0034-sustain-folder-layout-and-session-state-files.md) | .sustain run-folder layout and session state files | accepted | 2026-10-14 |
| [0035](0035-mode-verification-hints-and-scoring.md) | Mode verification contracts, hints and scoring | accepted | 2026-10-14 |
| [0036](0036-session-install-skills-and-managed-hooks.md) | Session install: skills into .agents, managed hooks per agent config | accepted | 2026-10-14 |
| [0037](0037-session-command-contract-and-scoring.md) | session.mjs v1 command contract, phases and scoring weights | accepted | 2026-10-14 |
| [0038](0038-mutation-engine-v1-rule-tables.md) | Mutation engine v1: three kinds as ordered rewrite tables on one line | accepted | 2026-10-14 |
| [0039](0039-lifecycle-commands-and-hook-contract.md) | Lifecycle command contract and the session-hook wire format | accepted | 2026-10-14 |
| [0040](0040-hooks-merge-panel-read-side-and-devin-detection.md) | Hooks-merge mechanics, session-panel read side and Devin CLI detection | accepted | 2026-10-15 |
