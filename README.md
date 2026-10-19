# Sustain

Sustain shows a repository's architecture as a diagram inside VS Code and opens the code behind each box. The diagram is written by a coding agent you already use, Claude Code or Codex, following a skill that ships with the extension. Sustain itself never calls an AI service and makes no network requests.

Diagrams use the [Archify](https://github.com/tt-a1i/archify) JSON format (architecture diagrams, `schema_version: 1`). Sustain is not affiliated with Archify.

## Requirements

- Desktop VS Code 1.126 or newer, or a fork based on it such as Cursor or Devin Desktop (not VS Code for the Web or remote-only workspaces).
- Node.js 18 or newer on your `PATH`: the agent runs the skill's two scripts with `node`.
- To generate diagrams: [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`) or [Codex](https://github.com/openai/codex) (`codex`) installed and signed in. Viewing existing diagrams needs neither.

## Install

Sustain is distributed as a `.vsix` file, not through the Marketplace.

1. In VS Code, open the Extensions view, click `…` (Views and More Actions) and choose **Install from VSIX…**.
2. Pick `sustain-<version>.vsix`.

Or from a terminal: `code --install-extension sustain-<version>.vsix`.

To build the `.vsix` from source: `npm ci && npm run package`.

## Without VS Code

The skill is a plain folder; Codex Chat, Codex CLI and any agent that reads `.agents/skills/` can use it without the extension. Install it into a repository with one command — no clone needed:

```sh
mkdir -p .agents/skills
curl -sL https://github.com/xplus2g4/sustain/releases/latest/download/sustain-architecture-skill.tar.gz | tar -xz -C .agents/skills
```

Then, in a Codex chat in that repository: `$sustain-architecture` with an optional focus, e.g. `$sustain-architecture payment flow`. The agent generates the diagram, validates it, and opens a self-contained HTML page with the diagram and the cited code beside it.

To let the agent install the skill on demand, add this to the repository's `AGENTS.md` (Codex reads it automatically):

```md
## Architecture diagrams
If the user asks for an architecture diagram and `.agents/skills/sustain-architecture` is
missing, run `mkdir -p .agents/skills && curl -sL https://github.com/xplus2g4/sustain/releases/latest/download/sustain-architecture-skill.tar.gz | tar -xz -C .agents/skills`,
then invoke the sustain-architecture skill with the request as the focus.
```

To reopen a finished diagram, run the exporter the skill carries and open the `page` it prints:

```sh
node .agents/skills/sustain-architecture/scripts/export-viewer.mjs .archify/<run>/candidate.json
```

The page embeds the diagram and the cited code beside it; click a box to see its source. The same exporter ships standalone as `sustain-viewer.tar.gz` on the releases page and is produced by `npm run build` (`dist/export-viewer.mjs`). The skill folder can also be fetched from source: `npx degit xplus2g4/sustain/skills/sustain-architecture .agents/skills/sustain-architecture`.

## Commands

Run them from the Command Palette (⇧⌘P / Ctrl+Shift+P). In a multi-root workspace each command first asks which folder to use.

| Command | What it does |
|---|---|
| **Sustain: Install Agent Skills** | Copies the `sustain-architecture` skill into `.agents/skills/sustain-architecture/` and links `.claude/skills/sustain-architecture` to it (a copy if links are not possible). Asks before overwriting an existing install. |
| **Sustain: Generate Architecture** | Asks for an optional focus and an agent, then starts Claude Code or Codex in a terminal with the skill invocation. Offers to install the skill first if it is missing. If the agent is not on `PATH`, it offers to copy the prompt instead. |
| **Sustain: Open Architecture** | Opens the newest diagram of the folder in the architecture panel. |
| **Sustain: Open Architecture File…** | Lists every diagram of the folder, newest first, plus **Browse…** to open any Archify JSON file. |

## Generating a diagram

The skill is invoked manually; agents never start it on their own.

1. Run **Sustain: Install Agent Skills** once per repository. Commit the skill folders or add them to your `.gitignore`, as you prefer; Sustain does not edit `.gitignore`.
2. Run **Sustain: Generate Architecture**, or start the skill yourself in your agent:
   - **Claude Code:** `/sustain-architecture` followed by an optional focus, e.g. `/sustain-architecture payment flow`. Reading, searching and the skill's scripts are pre-approved; Claude Code still asks before writing the diagram file.
   - **Codex:** `$sustain-architecture` followed by an optional focus, e.g. `$sustain-architecture payment flow`.
3. The agent creates a run folder, explores the code, writes `draft.json`, and runs the validator. It fixes what the validator reports (at most three repairs). When the diagram is accepted, the validator saves it as `candidate.json`.
4. Sustain notices the new diagram: the open panel switches to it, or a notification offers to open it.

An empty focus produces a whole-system overview; a focus such as "auth" or "deployment" narrows the diagram.

## Using the viewer

- Click a box to open the code it cites in the other editor column, with the cited lines selected and briefly highlighted.
- Hover a box to see its description and all of its source references; click a reference to open it.
- Drag empty space or scroll to pan. Zoom with Ctrl/⌘ + scroll, a pinch, the toolbar (Fit, −, +, 100 %) or the keys `+`, `-`, `0` (100 %) and `f` (fit).
- References are checked when you click them. A file that no longer exists, or lines beyond the end of a file, are reported as stale references. Line moves within a file are not detected.
- The panel follows changes: editing or regenerating the shown diagram reloads it.

## What is in `.archify/`

Each generation is a run folder: `.archify/architecture-<slug>-<YYYYMMDD-HHMMSS>/` (with `-2`, `-3`, … if two runs start in the same second). It contains:

- `draft.json` while the agent is working, or after a run that ended without passing validation;
- `candidate.json` once the validator accepted the diagram. This is the file Sustain opens.

Validation checks the Archify JSON Schema, that IDs and references are consistent, and that every cited file exists inside the repository with the cited lines. It removes layout and presentation fields (Sustain computes the layout) and fills in `meta.repository` from git when the repository has an `origin` remote. Secrets are never cited: `.env` files, keys, credential files, `.git/` and `.archify/` are rejected.

Archify files from other tools open too; files with positions for every component are drawn as authored.

## License notices

`THIRD_PARTY_NOTICES.md`, shipped with the extension, lists the Archify material (MIT) included in Sustain.
