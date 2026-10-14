// Session webview entry point: renders the learning-session snapshot — phase, step k/n,
// bug progress, elapsed timer and the local leaderboard. Talks to the extension host via
// SessionHostMessage/SessionWebviewMessage. Bundled as dist/session-webview.js.
import type { SessionHostMessage, SessionView, SessionWebviewMessage } from "../src/model/messages";
import type { LeaderboardEntry } from "../src/model/leaderboard";

declare function acquireVsCodeApi(): { postMessage(message: SessionWebviewMessage): void };
const vscode = acquireVsCodeApi();

const app = document.createElement("div");
app.className = "session";
document.body.append(app);

let current: SessionView | null = null;
let messageAt = 0;
let timer: number | undefined;

const PHASE_LABEL: Record<string, string> = {
  clarify: "Clarify",
  implementing: "Implementing",
  hunting: "Hunting",
  paused: "Paused",
  done: "Done",
};

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  if (text !== "") node.textContent = text;
  return node;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function elapsedMs(view: SessionView): number {
  const start = Date.parse(view.createdAt);
  if (Number.isNaN(start)) return 0;
  // A finished session freezes at its last update; a live one ticks from the snapshot time.
  const base = view.phase === "done" ? Date.parse(view.updatedAt) : Date.parse(view.serverNow);
  return base - start + (view.phase === "done" ? 0 : Date.now() - messageAt);
}

function renderStatus(view: SessionView): void {
  const header = el("header", "session__header");
  const title = el("div", "session__title");
  title.append(el("span", "session__mode", "Bug hunt"), el("code", "session__run", view.run ?? ""));
  const badges = el("div", "session__badges");
  badges.append(el("span", `phase phase--${view.phase}`, PHASE_LABEL[view.phase] ?? view.phase));
  if (!view.live) badges.append(el("span", "badge", "finished"));
  if (view.stale) badges.append(el("span", "badge badge--warn", "stale"));
  header.append(title, badges);
  app.append(header);

  if (view.phase === "paused" && view.pausedFrom !== null) {
    app.append(el("p", "session__note", `Paused from ${PHASE_LABEL[view.pausedFrom] ?? view.pausedFrom} — resume in the agent session to continue.`));
  }

  const grid = el("div", "session__grid");
  if (view.stepsTotal > 0) {
    const step = el("div", "stat stat--wide");
    step.append(el("div", "stat__label", `Step ${view.stepIndex + 1} of ${view.stepsTotal}`), el("div", "stat__value", view.stepTitle ?? "—"));
    grid.append(step);
  }
  const progress = el("div", "stat");
  progress.append(el("div", "stat__label", "Bugs"), el("div", "stat__value", `${view.found} found · ${view.fixed} fixed · ${view.bugs} seeded`));
  const score = el("div", "stat");
  score.append(el("div", "stat__label", "Score"), el("div", "stat__value", String(view.score)));
  const clock = el("div", "stat");
  const clockValue = el("div", "stat__value", formatElapsed(elapsedMs(view)));
  clock.append(el("div", "stat__label", "Elapsed"), clockValue);
  grid.append(progress, score, clock);
  app.append(grid);

  if (view.phase !== "done") {
    clearInterval(timer);
    timer = window.setInterval(() => {
      if (current !== null) clockValue.textContent = formatElapsed(elapsedMs(current));
    }, 1000);
  }
}

function renderLeaderboard(entries: LeaderboardEntry[], totalScore: number): void {
  if (entries.length === 0) return;
  const section = el("section", "board");
  section.append(el("h2", "board__title", "Leaderboard"));
  const table = el("table", "board__table");
  const head = el("thead");
  const headRow = el("tr");
  for (const label of ["#", "Run", "Status", "Score", "Bugs", "Hints", "Ended"]) {
    headRow.append(el("th", "", label));
  }
  head.append(headRow);
  table.append(head);
  const body = el("tbody");
  entries.forEach((entry, index) => {
    const row = el("tr", entry.status === "active" ? "board__row--active" : "");
    row.append(
      el("td", "", String(index + 1)),
      el("td", "board__run", entry.run),
      el("td", "", entry.status),
      el("td", "", String(entry.score)),
      el("td", "", `${entry.found}F ${entry.fixed}X of ${entry.bugs}`),
      el("td", "", entry.hintCost > 0 ? `−${entry.hintCost}` : "—"),
      el("td", "", entry.endedAt === "" ? "—" : entry.endedAt.slice(0, 16).replace("T", " ")),
    );
    body.append(row);
  });
  table.append(body);
  section.append(table);
  const sessions = entries.length === 1 ? "1 session" : `${entries.length} sessions`;
  section.append(el("p", "board__total", `Total: ${totalScore} points across ${sessions}`));
  app.append(section);
}

function render(view: SessionView): void {
  current = view;
  messageAt = Date.now();
  app.replaceChildren();
  if (view.run === null) {
    app.append(el("p", "session__empty", "No learning session in this folder yet."));
  } else {
    renderStatus(view);
  }
  renderLeaderboard(view.leaderboard, view.totalScore);
}

window.addEventListener("message", (event: MessageEvent<SessionHostMessage>) => {
  const message = event.data;
  if (message.type === "session") render(message.view);
  else if (message.type === "empty") {
    current = null;
    clearInterval(timer);
    app.replaceChildren(el("p", "session__empty", message.message));
  }
});

vscode.postMessage({ type: "ready" });
