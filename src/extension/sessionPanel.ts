// The learning-session WebviewPanel (ADR 0034): one per window, showing the session of the
// folder it was opened for — public `session.json` fields and the leaderboard only.
import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { SessionHostMessage, SessionView, SessionWebviewMessage } from "../model/messages";
import { isSessionStale } from "../model/session";
import { webviewHtml } from "./html";
import { readSessionSnapshot } from "./sessionFiles";

export const SESSION_VIEW_TYPE = "sustain.session";

/** The webview contract: `session.json` fields, leaderboard, and nothing secret. */
function sessionView(root: string): SessionView {
  const snapshot = readSessionSnapshot(root);
  const session = snapshot.shown?.session ?? null;
  const step = session?.steps[session.stepIndex];
  return {
    run: snapshot.shown?.run ?? null,
    live: snapshot.shown !== null && snapshot.activeRun === snapshot.shown.run,
    mode: session?.mode ?? "bugfix",
    phase: session?.phase ?? "?",
    pausedFrom: session?.pausedFrom ?? null,
    stepIndex: session?.stepIndex ?? 0,
    stepsTotal: session?.steps.length ?? 0,
    stepTitle: step?.title ?? null,
    bugs: session?.bugs ?? 0,
    found: session?.found ?? 0,
    fixed: session?.fixed ?? 0,
    score: session?.score ?? 0,
    stale: session !== null && isSessionStale(session),
    createdAt: session?.createdAt ?? "",
    updatedAt: session?.updatedAt ?? "",
    serverNow: new Date().toISOString(),
    leaderboard: snapshot.leaderboard,
    totalScore: snapshot.totalScore,
  };
}

export class SessionPanel {
  private static instance: SessionPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    /** Repo root whose `.sustain/` this panel renders. */
    public readonly root: string,
  ) {
    const dist = vscode.Uri.joinPath(extensionUri, "dist");
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    panel.webview.html = webviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "session-webview.js")).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "session-webview.css")).toString(),
      title: "Learning Session",
    });
    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: SessionWebviewMessage) => {
        if (message.type === "ready") this.send();
      }),
      panel.onDidChangeViewState(({ webviewPanel }) => {
        if (webviewPanel.visible) this.send();
      }),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  /** The open panel, if any. */
  static get current(): SessionPanel | undefined {
    return SessionPanel.instance;
  }

  /** Opens (or reveals) the panel on `root`'s `.sustain/` state. */
  static show(extensionUri: vscode.Uri, root: string): SessionPanel {
    const existing = SessionPanel.instance;
    if (existing) {
      existing.panel.reveal(existing.panel.viewColumn);
      return existing;
    }
    const column = vscode.window.visibleTextEditors.length === 0 ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
    const panel = vscode.window.createWebviewPanel(SESSION_VIEW_TYPE, "Learning Session", column, { retainContextWhenHidden: false });
    const created = new SessionPanel(panel, extensionUri, root);
    SessionPanel.instance = created;
    created.reload();
    return created;
  }

  /** Re-reads `.sustain/` and re-sends the view. */
  reload(): void {
    this.send();
  }

  private send(): void {
    const message: SessionHostMessage = { type: "session", view: sessionView(this.root) };
    void this.panel.webview.postMessage(message);
  }

  /** Handles a message from the webview (also the e2e test hook's entry point). */
  async handleMessage(message: SessionWebviewMessage): Promise<void> {
    if (message.type === "ready") this.send();
  }

  private dispose(): void {
    if (SessionPanel.instance === this) SessionPanel.instance = undefined;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
