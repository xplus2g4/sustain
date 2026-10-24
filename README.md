# Sustain

Sustain draws your repository's architecture as a map that opens the code behind every box and tells you when the code has moved on.

A coding agent you already use writes the map. Sustain runs Claude Code, Codex and Devin, and gives them a skill to follow. For GitHub Copilot, Cursor, Gemini CLI, OpenCode and Devin Desktop, **Copy prompt for…** under Generate copies a prompt to paste. Each box cites the lines it describes, and a click opens them. Sustain compares every box with the code it cites. It shows which boxes have changed without spending a token.

Maps use the [Archify](https://github.com/tt-a1i/archify) JSON format (`schema_version: 1`). Sustain is not affiliated with Archify.

## Quick start

Generating a map needs Node.js 18 or newer and Claude Code or Codex, installed and signed in. Viewing a map needs neither.

### VS Code, Cursor or Devin Desktop

1. Download `sustain-<version>.vsix` from the [latest release](https://github.com/xplus2g4/sustain/releases) and choose **Install from VSIX…** in the Extensions view.
2. Click the Sustain icon in the Activity Bar.
3. Type an optional focus, such as "payment flow", and click **Generate**.

The sidebar's setup checklist names anything missing and offers a fix for each.

### Skill only

1. Add the skills with `npx skills add xplus2g4/sustain`.
2. Run `/sustain-architecture payment flow` in Claude Code or `$sustain-architecture payment flow` in Codex. The focus is optional.
3. Open the map in the Sustain extension.

### Claude Code plugin

1. Download `sustain-skills.zip` from the [latest release](https://github.com/xplus2g4/sustain/releases) and unzip it with `unzip sustain-skills.zip -d sustain-skills`.
2. In Claude Code, run `/plugin marketplace add ./sustain-skills`.
3. Run `/plugin install sustain@sustain`.

## Where to find it

Every command is also in the Command Palette under "Sustain".

| Place | What's there |
|---|---|
| Activity Bar | The Sustain icon, which opens the sidebar |
| Sidebar | The folder and its map status, the composer (focus, agent, run mode and Generate), the live run, your maps, the setup checklist, Practice, learning sessions and Ask |
| Sidebar title bar | Refresh and Check Setup |
| Status bar | Sustain's state, the time of a running generation or the number of changed boxes. A click opens the sidebar. |
| Explorer right-click | Map This Folder with Sustain |
| Maps list | Open, Refresh, Export page, Create tour and Delete on each map |
| Pull request | The Sustain check and its comment |
| **Sustain: Install Agent Skills** | Installs `sustain-architecture` and `sustain-bugfix` where `sustain.skillScope` says: your home folder by default (`~/.agents/skills/`, nothing added to the repository), or the repository's `.agents/skills/` when the scope is `project`. Each `.claude/skills/<name>` entry links to the `.agents` copy (a copy where links are not possible). Asks before overwriting an existing install. |
| **Sustain: Generate Architecture** | Asks for an optional focus, then (when the folder already has a diagram) whether to update the latest diagram or regenerate from scratch, then an agent, and starts Claude Code or Codex in a terminal with the skill invocation. Offers to install the skill first if it is missing. If the agent is not on `PATH`, it offers to copy the prompt instead. |
| **Sustain: Open Architecture** | Opens the newest diagram of the folder in a Sustain Architecture tab, or reveals and reloads its tab if it is already open. |

Diagrams are `.sir` files (Sustain Intermediate Representation, Archify JSON inside). Opening any `.sir` file from the Explorer, Quick Open or **File › Open** shows it in the viewer, one tab per file, titled with the file name. To see the JSON, use **Reopen Editor With… › Text Editor**.

## Using the map

- Click a box to open the code it cites, with the cited lines selected.
- Hover a box to see its description and every source it cites.
- Tab moves through the boxes, and Enter or Space opens a box's code. Each box's accessible name says what it is and which code it opens, and screen readers also get a list of every box and arrow.
- Drag or scroll to pan. Zoom with Ctrl or ⌘ and scroll, a pinch, the toolbar or the keys `+`, `-`, `0` and `f`.
- **Health** at the top of the sidebar says whether boxes changed since the map, how many changed lines no box covers, whether any import breaks a rule, and which box changes most.
- **Write Architecture Notes for Agents** puts the map's boxes, arrows and rules into `AGENTS.md`, between Sustain's markers, so coding agents follow the architecture. It writes `CLAUDE.md` too when that file does not import `AGENTS.md`. Your own text stays as it is, and each file shows as a diff first.
- The sidebar lists the five boxes whose code changed most over the last `sustain.hotspots.days` (90 by default), with their commits, lines changed and number of authors.
- **Rules** in `sustain.config.json` say which boxes may import which. An import that breaks one shows in the Problems panel at its line and in the pull request check; use Suggest rules in the sidebar. Every change to the file shows as a diff first.

1. Run **Sustain: Install Agent Skills** once — per repository only when `sustain.skillScope` is `project`.
2. Run **Sustain: Generate Architecture**, or start the skill yourself in your agent:
   - **Claude Code:** `/sustain-architecture` followed by an optional focus, e.g. `/sustain-architecture payment flow`. Reading, searching and the skill's scripts are pre-approved; Claude Code still asks before writing the diagram file.
   - **Codex:** `$sustain-architecture` followed by an optional focus, e.g. `$sustain-architecture payment flow`.
3. The agent creates a run folder and decides, with the skill's `change-map.mjs`, whether to update the previous diagram or draw a new one (see below). It writes `draft.json` and runs the validator, fixing what the validator reports (at most three repairs). When the diagram is accepted, the validator saves it as `candidate.sir`.
4. Sustain notices the new diagram: if a diagram of the same folder is open, the new one opens in a tab next to it in the same editor group; otherwise a notification offers to open it.

Sustain reads only `candidate.sir`. Earlier versions saved `candidate.json`; those runs are no longer shown, and the next update in such a repository regenerates from scratch. If the repository has a skill installed by an earlier version, run **Sustain: Install Agent Skills** again so the agent writes `candidate.sir`.

## Using the viewer

- Click a box to open the code it cites in the other editor column, with the cited lines selected and briefly highlighted.
- Hover a box to see its description and all of its source references; click a reference to open it.
- Drag empty space or scroll to pan. Zoom with Ctrl/⌘ + scroll, a pinch, the toolbar (Fit, −, +, 100 %) or the keys `+`, `-`, `0` (100 %) and `f` (fit).
- References are checked when you click them. A file that no longer exists, or lines beyond the end of a file, are reported as stale references. Line moves within a file are not detected.
- The viewer follows changes: editing or regenerating the shown diagram reloads it; if its file is deleted, the tab stays open and says so.

### Seeing what changed

When a diagram was made by updating an earlier one, the viewer compares the two. The header above the diagram says what it is compared with: the earlier diagram's commit (short hash, message, how long ago) and how many files were uncommitted at that time, then the commit of the diagram you are looking at, and the number of added, removed and changed elements.

- On the diagram, new boxes, connections and boundaries are marked `NEW` and drawn in your theme's "added" colour; changed ones are marked `CHANGED` (`RENAMED` for a relabelled boundary) in the "modified" colour. Removed elements are not drawn.
- The **Changes** panel on the right lists every addition, removal and change, with what changed (for example a new label). Click an entry to zoom to it. **Open baseline** opens the earlier diagram in its own tab in the same editor group; **Swap** does the same and compares it with the diagram you came from.
- After an update, the panel also lists **Code changed, kept**: boxes whose cited code changed but which the agent left as they were (marked `KEPT` on the diagram), and **Not in any component**: changed files that no box cites. Click a file to open it.
- The **Changes** button hides or shows the marks and the panel; the choice is remembered per tab. Each tab has its own comparison, even for the same diagram open twice.
- **Compare with…** lets you compare with any other diagram in `.archify/`, or with none. Sustain warns, without refusing, when a comparison is doubtful: a different focus, few shared components, a different repository, a diagram that is not in this one's update history, or a baseline that is newer than the open diagram (with a **Swap** button). When a regeneration lies between the two diagrams, the comparison is labelled "approximate", because regenerated elements may have new IDs and show up as removed plus added.
- `candidate.json` is the map.
- `fingerprints.json` holds hashes of the cited code. Sustain uses them to find the boxes that changed.
- `run.json` records how the map was made, and `evidence.json` what the validator checked.
- `audit.json` holds the audit's verdict on each box, and `feedback.json` your notes on boxes that are wrong.
- `tour.json` holds the map's tour.
- `draft.json` and the `.html` page stay out of commits. Sustain lists them in `.git/info/exclude`.

Name the map that checks compare with in `sustain.config.json` at the repository root.

```json
{ "map": "architecture-payment-flow-20261018-101500" }
```

Without it, checks use the newest map with an empty focus.

- `draft.json` while the agent is working, or after a run that ended without passing validation;
- `candidate.sir` once the validator accepted the diagram. This is the file Sustain opens;
- `lineage.json`: whether the run updated or regenerated, why, which run it continued, and the commits involved (hash, message and date), and how many updates have happened since the last regeneration;
- `change.md` and `mapping.md` in update runs: the code change grouped by component, and the list of changed, unchanged and uncited parts the agent worked from;
- `changes.json` in update runs: the same change as data, which the viewer uses for "Code changed, kept" and "Not in any component".

Validation checks the Archify JSON Schema, that every connection has an ID, that IDs and references are consistent, and that every cited file exists inside the repository with the cited lines. It removes layout and presentation fields (Sustain computes the layout) and fills in `meta.repository` from git when the repository has an `origin` remote. Secrets are never cited: `.env` files, keys, credential files, `.git/` and `.archify/` are rejected.

Archify files from other tools open too when saved with a `.sir` extension; files with positions for every component are drawn as authored.

## What it costs

Sustain makes no AI calls of its own. Your agent does the work, on your account.

- Generating a map uses your agent's tokens. On an API account they are billed at the model's price. On a subscription they count towards your plan's limits.
- Before every run, Sustain states an estimate under Generate, in the confirmation and on the run card, such as "About 180k–260k tokens (about $0.50–$0.80 at API prices; on a subscription it uses part of your plan's limit)". The skill states it too. Runs above `sustain.confirmAboveTokens`, 300,000 tokens by default, need a second click.
- A run in the sidebar shows its elapsed time and tokens as it goes, and the final tokens and cost when the agent reports them. `run.json` keeps the figures.
- Updating a map reads only the code that changed since the map was made.
- Ask spends tokens on each question, Practice on its questions and on each grade, and Create tour once per tour.
- Viewing a map, the freshness badges, the diagram page and the pull request check spend no tokens.

## What it touches on your machine

- Skills go to `~/.agents/skills/`, which Codex and Devin read, with links in `~/.claude/skills/` for Claude Code. With `sustain.skillScope` set to `project`, they go to `.agents/skills/` and `.claude/skills/` in the repository.
- Maps go to `.archify/` in the repository.
- `.git/info/exclude` gains `.sustain/`, `.archify/**/draft.json` and `.archify/**/*.html`. Git reads this file and never commits it.
- Learning sessions keep their state in `.sustain/`. Their hook entry exists only while a session runs, in `.claude/settings.local.json` for Claude Code, `.codex/hooks.json` for Codex or `.devin/hooks.v1.json` for Devin. Codex runs it once you trust it with `/hooks`.
- Agents run with an exact list of tools. Claude Code may read, search, run the skill's scripts and edit inside `.archify/`. Codex runs in its workspace sandbox. No permission prompt is skipped.
- With `sustain.usageLog` on (it is off by default), Sustain keeps how many times you used each of its actions per day, for 90 days, in VS Code's storage. It holds no paths, labels, repository names or anything you typed. **Export Usage Log** and **Clear Usage Log** are in the sidebar's title-bar menu.
- The extension makes no network requests. Only `sustain publish` and the Action's `upload: true` send anything, and they send maps and check results.

## How to remove it

**Remove Sustain from This Folder**, in the sidebar's title-bar menu and the Command Palette, removes what Sustain added to a folder: the skills installed in the repository, its hook entries, its lines in `.git/info/exclude`, and its block in `AGENTS.md` and `CLAUDE.md`. It then asks before deleting `.archify/`, `.sustain/` and `sustain.config.json`, and offers to remove the skills from your home folder. To do it by hand:

1. Uninstall Sustain from the Extensions view.
2. Delete `sustain-architecture`, `sustain-audit`, `sustain-tour` and `sustain-bugfix` from `~/.agents/skills/` and `~/.claude/skills/`.
3. In each repository you mapped, delete `.archify/` and `.sustain/` if you no longer want them, and the three Sustain lines from `.git/info/exclude`.

## License notices

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), shipped with the extension, lists the Archify material (MIT) included in Sustain.
