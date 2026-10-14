- Apart from the features that you kept, add `node finder` and `history browser`

## Learning modes (ADRs 0029–0036)

- `session.mjs` state machine: all commands **shipped** — `init`, `plan`, `inject`, `status`, `report`, `hint`, `verify`, `complete`, `pause`, `resume`, `restore`, `abandon` (ADRs 0037/0039 record the contract)
- `session-hook.mjs` Devin hook **shipped**; extension merges/removes Sustain's entries in `.devin/hooks.v1.json` on install (marker: `.agents/skills/sustain-` in the command)
- `.sustain/<mode>-<slug>-<ts>[-N]/` run folders: `session.json` (public), `events.jsonl` (ledger), `manifest.json` (secrets) + `.sustain/active` lock; `.sustain/` appended to `.gitignore` on install and launch
- Mutation engine + bug-kind taxonomy reference (v1: JS/TS line-local kinds; per-step cap ~1–2, trivial steps merged in `plan`)
- Difficulty tiers from the taxonomy (T1 line-local, T2 control-flow/async, T3 cross-file) — the rules for how each level is differentiated will be expanded in a later design pass
- `sustain-bugfix` skill **shipped** (`triggers: user`); next `sustain-guided` (per-step check commands declared in `plan`)
- Buddy Tour mode: deferred — do not design yet. Open question when picked up: are checkpoints extension-observed (editor events → progress file) or script-verified conditions?
- ~~Extension: merge-safe `.devin/hooks.v1.json` install/update/remove, Devin terminal launcher, `.sustain/` watcher, session webview (phase, k/n, timer — never `manifest.json`) + local leaderboard~~ **shipped** (ADR 0040) — `removeHooks` exists but no uninstall command calls it yet
- ~~`restore`/`abandon` safety net, clean-git warning at `init`, stale-session auto-release~~ **shipped** (ADR 0039)
- Remote/shared leaderboard — deferred: breaks the no-network rule (NFR-SEC-02), needs its own ADR; revisit manifest secrecy then
- Claude-target hook install (`.claude/settings.json`, tool-name normalisation) if Claude sessions are kept for hunt mode; Codex hunt mode is honor-system for edits
- Open Learning Session VSCode panel command. Give it a separate command from Start Learning Session.
