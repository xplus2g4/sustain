// The architecture webview's HTML shell and Content Security Policy (NFR-SEC-01). No `vscode`
// import, so the policy is unit-tested in Node.

export interface WebviewAssets {
  /** `webview.cspSource` of the panel. */
  cspSource: string;
  /** Fresh random nonce for the one script tag. */
  nonce: string;
  /** `asWebviewUri` of the bundled webview script. */
  scriptUri: string;
  /** `asWebviewUri` of `dist/webview.css`. */
  styleUri: string;
  /** The `<title>`; defaults to "Architecture". */
  title?: string;
}

/** `default-src 'none'`; the nonce'd script and the extension's own stylesheet only. */
export function webviewCsp(cspSource: string, nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${cspSource}`;
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The page: everything visible is built by `dist/webview.js`. */
export function webviewHtml(assets: WebviewAssets): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attr(webviewCsp(assets.cspSource, assets.nonce))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<link rel="stylesheet" href="${attr(assets.styleUri)}">`,
    `<title>${attr(assets.title ?? "Architecture")}</title>`,
    "</head>",
    "<body>",
    `<script nonce="${attr(assets.nonce)}" src="${attr(assets.scriptUri)}"></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
