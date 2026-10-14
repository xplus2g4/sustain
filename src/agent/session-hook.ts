// `node .agents/skills/sustain-bugfix/scripts/session-hook.mjs`, wired from
// `.devin/hooks.v1.json` (ADR 0032): the mechanical part of the bug-hunt contract.
// Devin pipes one hook event as JSON on stdin (`hook_event_name`, `tool_name`,
// `tool_input`, `session_id`, `prompt_id`) and sets DEVIN_PROJECT_DIR to the repo root.
//
// - PreToolUse: while `session.json` says `hunting`, exits 2 (with a `decision: block`
//   object on stdout) for the file-editing and subagent tools, so "the user fixed it
//   themselves" is enforced, not hoped for. Every other tool and phase passes silently.
// - UserPromptSubmit / PostCompaction / SessionStart: prints `additionalContext` with the
//   live session state, re-grounding the agent each turn and after compaction.
// - No `.sustain/active`, no parseable event, or unreadable session state: inert (exit
//   0). A hook must never break a repo that has no learning session running.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeRun, loadSession, SUSTAIN_DIR, type SessionState } from "../model/session";

/** Tools that mutate code or delegate work — blocked only while `phase === "hunting"`. */
const BLOCKED_TOOLS: ReadonlySet<string> = new Set(["edit", "write", "apply_patch", "notebook_edit", "run_subagent"]);

const SESSION_MJS = ".agents/skills/sustain-bugfix/scripts/session.mjs";

/** The context line re-injected on every prompt and after compaction. */
function contextLine(run: string, session: SessionState): string {
  const step = session.steps[session.stepIndex];
  const here =
    session.steps.length === 0
      ? "no steps planned yet"
      : `step ${Math.min(session.stepIndex + 1, session.steps.length)}/${session.steps.length}${step ? ` "${step.title}"` : ""}`;
  const base = `[sustain-bugfix] active session ${run}: phase=${session.phase}, ${here}, bugs ${session.found} found / ${session.fixed} fixed of ${session.bugs}, score ${session.score}.`;
  switch (session.phase) {
    case "hunting":
      return `${base} The user is hunting the seeded bug themselves: do not edit files, do not spawn subagents, never reveal locations/lines/kinds or per-file counts. Judge their description, then run \`node ${SESSION_MJS} report --file <f>\`; when they say a fix is in, run \`node ${SESSION_MJS} verify\`.`;
    case "implementing":
      return `${base} Implement the current step, seed one bug with \`node ${SESSION_MJS} inject\`, announce only the step's touched files, then wait for the user.`;
    case "clarify":
      return `${base} Clarify the task with the user, then run \`node ${SESSION_MJS} plan\`.`;
    case "paused":
      return `${base} The session is paused — enforcement is inert. \`node ${SESSION_MJS} resume\` re-arms it, \`abandon\` restores the seeded code and ends it.`;
    default:
      return `${base} All steps are verified — run \`node ${SESSION_MJS} complete\` to score the session and release the lock.`;
  }
}

/** The block verdict for a hunting-phase edit attempt — stdout JSON plus exit 2. */
function block(run: string, tool: string): number {
  const reason =
    `Sustain bug-hunt is live (run ${run}): the user is finding and fixing the seeded bug themselves, ` +
    `so \`${tool}\` is denied while session.json phase is "hunting". Coach with session.mjs status/report/hint/verify instead.`;
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
  process.stderr.write(`${reason}\n`);
  return 2;
}

function main(): number {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(readFileSync(0, "utf8")) as Record<string, unknown>;
  } catch {
    return 0;
  }

  const root = typeof process.env["DEVIN_PROJECT_DIR"] === "string" ? process.env["DEVIN_PROJECT_DIR"] : process.cwd();
  const run = activeRun(root);
  if (run === null) return 0;
  let session: SessionState;
  try {
    session = loadSession(join(root, SUSTAIN_DIR, run));
  } catch {
    return 0; // corrupt or half-written state must not jam the user's agent
  }

  const event = payload["hook_event_name"];
  if (event === "PreToolUse") {
    const tool = payload["tool_name"];
    if (session.phase === "hunting" && typeof tool === "string" && BLOCKED_TOOLS.has(tool)) return block(run, tool);
    return 0;
  }
  if (event === "UserPromptSubmit" || event === "PostCompaction" || event === "SessionStart") {
    const output = { hookSpecificOutput: { hookEventName: event, additionalContext: contextLine(run, session) } };
    process.stdout.write(`${JSON.stringify(output)}\n`);
    return 0;
  }
  return 0;
}

process.exitCode = main();
