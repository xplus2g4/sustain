// Browser entry point for the self-contained diagram page (stage-1 viewer): the same
// canvas, toolbar, tooltip and click wiring as main.ts, but the diagram and the cited
// source windows come from the snapshot embedded in the page, not the extension host.
import { layoutDiagram } from "../src/layout/layout";
import type { MeasureText } from "../src/layout/scene";
import { sourceKey } from "../src/browser/protocol";
import type { SnapshotSource, ViewerSnapshot } from "../src/browser/protocol";
import type { WebviewMessage } from "../src/model/messages";
import { readDiagram } from "../src/model/tolerant";
import { NodeClicks } from "./click";
import { renderScene } from "./render";
import { SourcePane } from "./sourcePane";
import { TooltipController } from "./tooltip";
import { ViewportController } from "./viewport";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Line height of measured text, as a multiple of the font size. */
const LINE_HEIGHT = 1.32;
const TOOLBAR: [action: string, text: string, title: string][] = [
  ["fit", "Fit", "Fit to view (F)"],
  ["zoom-out", "−", "Zoom out (-)"],
  ["zoom-in", "+", "Zoom in (+)"],
  ["reset", "100 %", "Zoom to 100 % (0)"],
];

/** Where the page gets its data; stage 2 serves the same contract over HTTP. */
export interface ViewerData {
  /** The diagram document and the file it came from. */
  load(): Promise<{ doc: unknown; file: string }>;
  /** The embedded window for `component.sources[index]`, if the snapshot has one. */
  source(componentId: string, index: number): SnapshotSource | undefined;
}

/** Reads the `window.__SUSTAIN_SNAPSHOT__` the page shell inlines. */
function embeddedData(): ViewerData {
  const snapshot = (window as { __SUSTAIN_SNAPSHOT__?: ViewerSnapshot }).__SUSTAIN_SNAPSHOT__;
  if (!snapshot || snapshot.version !== 1) throw new Error("this page has no embedded diagram snapshot");
  return {
    load: () => Promise.resolve({ doc: snapshot.doc, file: snapshot.file }),
    source: (componentId, index) => snapshot.sources[sourceKey(componentId, index)],
  };
}

// body > div.app > svg.canvas > g.viewport; div.toolbar > button[data-action]×4;
// div.empty-state[hidden]; div.tooltip[hidden]; aside.source-pane[hidden]
const app = document.createElement("div");
app.className = "app app--empty";
const svg = document.createElementNS(SVG_NS, "svg");
svg.setAttribute("class", "canvas");
const content = document.createElementNS(SVG_NS, "g");
content.setAttribute("class", "viewport");
svg.append(content);
const toolbar = document.createElement("div");
toolbar.className = "toolbar";
toolbar.setAttribute("role", "toolbar");
for (const [action, text, title] of TOOLBAR) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar__button";
  button.setAttribute("data-action", action);
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = text;
  toolbar.append(button);
}
const emptyState = document.createElement("div");
emptyState.className = "empty-state";
emptyState.hidden = true;
const tooltipElement = document.createElement("div");
tooltipElement.className = "tooltip";
tooltipElement.setAttribute("role", "tooltip");
tooltipElement.hidden = true;
const paneElement = document.createElement("aside");
paneElement.className = "source-pane";
paneElement.hidden = true;
app.append(svg, toolbar, emptyState, tooltipElement, paneElement);
document.body.append(app);

const viewport = new ViewportController(svg, content, toolbar, window);
const pane = new SourcePane(paneElement);

function showEmpty(message: string): void {
  content.replaceChildren();
  tooltip.setDiagram(undefined);
  viewport.bounds = undefined;
  emptyState.textContent = message;
  emptyState.hidden = false;
  app.classList.add("app--empty");
}

/** Clicks and tooltip source picks resolve against the embedded snapshot. */
function post(message: WebviewMessage): void {
  if (message.type !== "openSource" || data === undefined) return;
  const source = data.source(message.componentId, message.index);
  pane.show(
    source ?? {
      kind: "error",
      path: message.componentId,
      message: `The snapshot has no source data for \`${message.componentId}\` [${message.index}]; regenerate the page`,
    },
  );
}

const tooltip = new TooltipController(svg, tooltipElement, post);
new NodeClicks(svg, post);
viewport.onChange = () => tooltip.hide();
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !paneElement.hidden) pane.hide();
});

const canvasContext = document.createElement("canvas").getContext("2d");

async function load(data: ViewerData): Promise<void> {
  let loaded: { doc: unknown; file: string };
  try {
    loaded = await data.load();
  } catch (error) {
    showEmpty(error instanceof Error ? error.message : String(error));
    return;
  }
  const result = readDiagram(loaded.doc);
  if (!result.ok) {
    showEmpty(`Can't show \`${loaded.file}\`: ${result.reason}`);
    return;
  }
  if (!canvasContext) throw new Error("the page has no 2D canvas context to measure text with");
  const family = getComputedStyle(document.body).getPropertyValue("--vscode-font-family").trim() || "sans-serif";
  const measure: MeasureText = (text, sizePx, bold) => {
    canvasContext.font = `${bold ? "bold " : ""}${sizePx}px ${family}`;
    return { width: canvasContext.measureText(text).width, height: sizePx * LINE_HEIGHT };
  };
  emptyState.hidden = true;
  app.classList.remove("app--empty");
  const scene = await layoutDiagram(result.diagram, { measure, viewport: viewport.size() });
  renderScene(content, result.diagram, scene, measure);
  tooltip.setDiagram(result.diagram);
  viewport.bounds = scene.bounds;
  viewport.fit();
  document.title = `Architecture: ${result.diagram.title ?? loaded.file.split("/").pop() ?? "diagram"}`;
}

let data: ViewerData | undefined;
try {
  data = embeddedData();
} catch (error) {
  showEmpty(error instanceof Error ? error.message : String(error));
}
if (data) void load(data);
