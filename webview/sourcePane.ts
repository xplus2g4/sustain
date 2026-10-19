// The browser viewer's citation pane: shows the embedded window of a clicked source —
// numbered lines with the cited range highlighted — or the resolution error the snapshot
// recorded for it. Content is embedded data; everything is written with textContent.
import type { SnapshotSource } from "../src/browser/protocol";

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** `path`, `path:line`, or `path:start–end` for the pane header. */
function formatRef(path: string, cited: [number, number] | undefined): string {
  if (!cited) return path;
  return cited[0] === cited[1] ? `${path}:${cited[0]}` : `${path}:${cited[0]}\u2013${cited[1]}`;
}

/**
 * Fills `element` (an `aside.source-pane`, initially `hidden`) with a clicked source:
 * `div.source-pane__header` (close button, `span.source-pane__path`, optional
 * `span.source-pane__label`), optional `div.source-pane__warning`, then
 * `div.source-pane__lines` > `div.source-pane__line` > `span.source-pane__num` +
 * `span.source-pane__code`, or `div.source-pane__error` for failed resolutions.
 */
export class SourcePane {
  constructor(private readonly element: HTMLElement) {}

  /** Shows `source` and scrolls the first cited line to the middle of the pane. */
  show(source: SnapshotSource): void {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "source-pane__close";
    close.title = "Close (Esc)";
    close.setAttribute("aria-label", "Close source pane");
    close.textContent = "\u00d7";
    close.addEventListener("click", () => this.hide());
    const title = div("source-pane__title");
    const path = document.createElement("span");
    path.className = "source-pane__path";
    path.textContent = formatRef(source.path, source.kind === "code" ? source.cited : undefined);
    title.append(path);
    if (source.kind === "code" && source.label) {
      const label = document.createElement("span");
      label.className = "source-pane__label";
      label.textContent = source.label;
      title.append(label);
    }
    const header = div("source-pane__header");
    header.append(close, title);
    const children: HTMLElement[] = [header];
    if (source.kind === "error") {
      children.push(div("source-pane__error", source.message));
    } else {
      if (source.warning) children.push(div("source-pane__warning", source.warning));
      const lines = div("source-pane__lines");
      let citedEl: HTMLElement | undefined;
      for (const { n, text } of source.lines) {
        const cited = source.cited !== undefined && n >= source.cited[0] && n <= source.cited[1];
        const row = div(`source-pane__line${cited ? " source-pane__line--cited" : ""}`);
        const num = document.createElement("span");
        num.className = "source-pane__num";
        num.textContent = String(n);
        const code = document.createElement("span");
        code.className = "source-pane__code";
        code.textContent = text || "\u00a0";
        row.append(num, code);
        if (cited && citedEl === undefined) citedEl = row;
        lines.append(row);
      }
      children.push(lines);
      this.element.replaceChildren(...children);
      this.element.hidden = false;
      citedEl?.scrollIntoView({ block: "center" });
      return;
    }
    this.element.replaceChildren(...children);
    this.element.hidden = false;
  }

  /** Empties and hides the pane. */
  hide(): void {
    this.element.hidden = true;
    this.element.replaceChildren();
  }
}
