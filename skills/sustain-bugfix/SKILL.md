---
name: sustain-bugfix
description: Run a Sustain bug-hunt learning session. You implement the user's task step by step, secretly seed one bug per step, and the user finds and fixes it for points. Invoke manually with a task description.
triggers: [user]
disable-model-invocation: true
allowed-tools: Read Grep Glob Edit Write Bash(node .agents/skills/sustain-bugfix/scripts/*) AskUserQuestion
---

# Sustain bug-hunt session

Coach the user through a learning session inside their own repository: you implement a small coding task in steps, plant one hidden bug per step, and the user finds and fixes it. `node .agents/skills/sustain-bugfix/scripts/session.mjs` — run from the repository root — is the referee: phases, the bug record, fix verification and scoring live there, never in your memory. Each command prints one JSON object; read `status` to know what is legal next.

## Iron rules — never break these

- Run `node .agents/skills/sustain-bugfix/scripts/session.mjs status` at the start of EVERY turn, before anything else. The phase it prints decides what you may do.
- NEVER reveal where a bug is: no file, no line, no kind, no per-file counts, not even by hinting ("look near the loop"). You may say only which files the current step touched — the user watched you write them.
- NEVER edit project files or spawn subagents while `status` says `hunting` — a lifecycle hook denies it mechanically, and a blocked call still wastes the turn. Only the user's hands fix the bug.
- NEVER read `.sustain/` files yourself — `manifest.json` is the sealed answer key and `session.json` is already summarized by `status`. Let the scripts read them.
- Fix nothing for the user, ever — not "just this once". Hints exist for stuck users (step 7).

## The task

The task is: $ARGUMENTS

- In Claude Code the line above holds the text typed after `/sustain-bugfix`.
- In Codex the task is the text after the `$sustain-bugfix` mention; ignore the line above if it still reads as a placeholder.
- If the task is empty, ask the user what they want to build or explore.

## Flow

### 1. Ground yourself — every turn

```sh
node .agents/skills/sustain-bugfix/scripts/session.mjs status
```

- `{"status":"none"}` → no session: proceed to clarify (step 2).
- `status: "ok"` → a session is live. Do NOT init again; continue at the step matching the printed `phase`.
- `stale: true` → the session sat idle over a day. Ask the user whether to `resume`-equivalent continue (just keep going — resume is automatic when it isn't paused) or `abandon` it.
- `phase: "paused"` → the user parked it. Ask whether to `resume` or `abandon`; do not proceed on your own.

### 2. Clarify (phase `clarify`, or before `init`)

Ask the user questions (the ask_user_question tool in Devin, AskUserQuestion in Claude) until the task is concrete: what to build or modify, which files are in scope, and how large the session should be (1–4 steps). Skip questions the task already answers; two or three questions total, not an interrogation.

Then start the session:

```sh
node .agents/skills/sustain-bugfix/scripts/session.mjs init --mode bugfix --name "<short-slug>"
```

Relay any `warnings` (dirty tree, released stale lock) to the user plainly.

### 3. Plan (phase `clarify` → `implementing`)

Split the task into 1–4 small steps, each naming the files it will touch:

```sh
node .agents/skills/sustain-bugfix/scripts/session.mjs plan --steps '[{"title":"…","files":["path/to/a.ts"]},…]'
```

Show the user the step list — the steps and their file lists are never secret.

### 4. Implement one step (phase `implementing`)

Write the step's code yourself, in the step's named files. Keep it small and real — this is the user's actual codebase.

### 5. Seed the bug (→ `hunting`)

Choose a kind and a line inside the code you just wrote, guided by `references/bug-taxonomy.md` (read it once at session start; vary kinds across steps, prefer subtle spots):

```sh
node .agents/skills/sustain-bugfix/scripts/session.mjs inject --file <f> --line <n> --kind <off-by-one|flipped-comparison|missing-await>
```

If inject reports "no `<kind>` target", pick a different line or kind — never force it by hand-editing a bug in; only engine-seeded bugs are scored.

Then tell the user ONLY: the step is implemented, one bug is hidden, and the file list the step touched. Stop and wait. Do not summarize the code you wrote in a way that points at the change.

### 6. The hunt (phase `hunting`)

The user describes what they found and fixes it themselves.

- **They name a suspect.** Judge the description first — the right file with a nonsense explanation does not count. When the description is plausible, run `report --file <f>`. `found` confirms it; `miss` means no live bug there — say so without revealing where it is.
- **They say it is fixed.** Run `verify` (optionally `--check-cmd "<the project's quick test or lint command>"` if the user wants that gate). `still-buggy` → tell them it is not fixed, without explaining what is wrong. `ok` → the next step begins (back to step 4) or the session is done (step 8).
- **They are stuck.** Offer a hint and run `hint --level 1` (region nudge). Escalate to `--level 2` (reveal the bug's kind) then `--level 3` (near-explicit) only on request — every level costs points, so make the cost explicit before taking it.

### 7. Pauses and exits

- User says pause/break → `pause`. Enforcement releases and they can work normally.
- User returns → `resume` and `status`.
- User gives up on the current bug(s) → `restore` writes the seeded lines back and keeps the session running (the bug leaves scoring).
- User wants out entirely → `abandon` — confirm first: it restores all still-seeded hunks, ends the session and frees the lock. The code you wrote for the steps stays; only the bugs are removed.

### 8. Complete (phase `done`)

```sh
node .agents/skills/sustain-bugfix/scripts/session.mjs complete
```

Report the score and what it was made of (found+fixed points minus hint costs — `status` and the ledger hold the details). A bug the user fixed but never described earns nothing; gently note that describing finds before fixing is part of the game.
