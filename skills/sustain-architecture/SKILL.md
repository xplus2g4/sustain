---
name: sustain-architecture
description: Generate an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.
disable-model-invocation: true
allowed-tools: Read Grep Glob Bash(node .agents/skills/sustain-architecture/scripts/*)
---

# Sustain architecture diagram

Produce one validated Archify architecture diagram of this repository. The Sustain VS Code viewer draws it and opens the cited code when a node is clicked, so every node must point at real code. Follow these steps in order, from the repository root, without asking the user for more input.

## 1. Read the focus

The focus is: $ARGUMENTS

- In Claude Code the line above holds the text typed after `/sustain-architecture`.
- In Codex the focus is the text after the `$sustain-architecture` mention; ignore the line above if it still reads as a placeholder.
- If the focus is empty, draw a whole-system overview led by the main user journey.

## 2. Create the run folder

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/repo-facts.mjs --focus "<focus>"
```

Omit `--focus "<focus>"` entirely when the focus is empty. The script prints one JSON object. Keep its `runFolder`, `draft` and `git` values; `git` lists uncommitted paths whose line numbers may still change. If it exits non-zero, stop and report its stderr.

## 3. Read the format reference

Read `.agents/skills/sustain-architecture/references/archify-format.md` completely. Use `.agents/skills/sustain-architecture/references/example.json` only as an example of the JSON shape, never as content.

## 4. Explore the code

Use your own read and search tools, in the order given under "How you work" in `archify-format.md`. Never open, search or cite these paths (any folder depth, any letter case):

- `.git/` and `.archify/`
- `.env` and `.env.*` (except `.env.example` and `.env.sample`)
- `.npmrc`, `.pypirc`, `.netrc`
- files whose names start with `id_rsa` or `id_ed25519`
- files ending in `.pem`, `.key`, `.p12` or `.pfx`

## 5. Write the draft

Write the complete diagram as JSON to the `draft` path from step 2. Write nothing else, anywhere: no other files, no edits to existing files.

## 6. Validate and repair

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/validate.mjs <draft>
```

with `<draft>` replaced by the `draft` path from step 2. It prints one JSON object with `status`.

- `rejected`: fix exactly the entries listed in `errors` (each names a JSON pointer such as `/components/3/sources/0/end_line`; re-read a cited file if you are unsure of its length), rewrite the whole draft at the same path, and run the validator again. `warnings` list fields the validator removed for you; they need no action.
- You may repair at most 3 times (4 validator runs in total). After the 4th rejection, stop and report the remaining errors and the draft path.
- Exit code 2 means the command itself was wrong (message on stderr): fix the command, not the draft.

## 7. Open the diagram

Run, from the repository root:

```sh
node .agents/skills/sustain-architecture/scripts/export-viewer.mjs <candidate>
```

with `<candidate>` replaced by the `candidate` path the validator reported. The script prints one JSON object with `page`: a self-contained HTML page that embeds the diagram and the cited code, written under the system temp dir.

- On the user's machine (a desktop agent), run `open "<page>"` on macOS or `xdg-open "<page>"` on Linux so the diagram opens next to this conversation.
- In a remote or headless environment, skip the open and report the `page` path instead.
- If `scripts/export-viewer.mjs` does not exist, the skill is an older install — skip this step.

## 8. Report

On `accepted`, report the `candidate` path, the number of components, and the `page` path from step 7 with whether you opened it. In VS Code the Sustain viewer will also offer to open the new diagram.
