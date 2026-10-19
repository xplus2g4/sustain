// The self-contained page shell for the browser viewer: one HTML file carrying the
// bundled viewer, the stylesheet with standalone theme fallbacks, and the snapshot.
// Everything is inlined so the file works over file:// with no server.

/** The `--vscode-*` theme variables webview/styles.css reads, for a page outside VS Code. */
const FALLBACK_THEME = `:root {
  --vscode-editor-background: #1e1e1e;
  --vscode-foreground: #d4d4d4;
  --vscode-font-family: system-ui, sans-serif;
  --vscode-font-size: 13px;
  --vscode-editor-font-family: ui-monospace, Menlo, monospace;
  --vscode-panel-border: #3c3c3c;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-errorForeground: #f48771;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-editor-rangeHighlightBackground: rgba(255, 215, 0, 0.14);
  --vscode-editorLineNumber-foreground: #858585;
  --vscode-toolbar-hoverBackground: rgba(255, 255, 255, 0.1);
  --vscode-focusBorder: #007fd4;
  --vscode-widget-shadow: rgba(0, 0, 0, 0.36);
  --vscode-editorWidget-background: #252526;
  --vscode-editorWidget-border: #454545;
  --vscode-editorHoverWidget-background: #252526;
  --vscode-editorHoverWidget-foreground: #d4d4d4;
  --vscode-editorHoverWidget-border: #454545;
  --vscode-textLink-foreground: #3794ff;
  --vscode-textLink-activeForeground: #3794ff;
  --vscode-charts-foreground: #cccccc;
  --vscode-charts-red: #f14c4c;
  --vscode-charts-blue: #3794ff;
  --vscode-charts-yellow: #e2c08d;
  --vscode-charts-orange: #d18616;
  --vscode-charts-green: #89d185;
  --vscode-charts-purple: #b180d7;
}`;

/** Inline-only resources: no network fetches even if embedded data were hostile. */
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'";

/** JSON for a `<script>` tag: `<` becomes `<` so source text can't close the tag. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** A JS program for a `<script>` tag; `<\/` inside strings is still the same text. */
function inlineScript(program: string): string {
  return program.replace(/<\/script/gi, "<\\/script");
}

export interface SnapshotPage {
  /** Bundled IIFE viewer (`dist/browser-viewer.js`). */
  script: string;
  /** `webview/styles.css` contents. */
  style: string;
  /** The `ViewerSnapshot` the page exposes as `window.__SUSTAIN_SNAPSHOT__`. */
  snapshot: unknown;
}

/** The page: fallback theme + stylesheet in `<style>`, then snapshot and viewer scripts. */
export function snapshotHtml(page: SnapshotPage): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Architecture</title>",
    `<style>${FALLBACK_THEME}</style>`,
    `<style>${page.style}</style>`,
    "</head>",
    "<body>",
    `<script>window.__SUSTAIN_SNAPSHOT__ = ${inlineJson(page.snapshot)};</script>`,
    `<script>${inlineScript(page.script)}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
