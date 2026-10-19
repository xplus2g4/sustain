// The embedded data of a self-contained architecture page (browser viewer, stage 1): the
// diagram JSON plus, for every citation, just the cited lines and a little context. Source
// windows are resolved with the same checks the extension applies on click, so a snapshot
// records stale or invalid citations as errors instead of leaking whole files.
import { readFileSync } from "node:fs";
import { parseDiagram } from "../model/tolerant";
import type { SourceRef } from "../model/types";
import { resolveSource } from "../extension/sourceTarget";
import { sourceKey } from "./protocol";
import type { SnapshotLine, SnapshotSource, ViewerSnapshot } from "./protocol";

export type { SnapshotLine, SnapshotSource, ViewerSnapshot } from "./protocol";
export { sourceKey } from "./protocol";

/** Lines of context embedded above and below a cited range. */
export const CONTEXT_LINES = 8;
/** Lines embedded from the top when a citation names no lines (or its range went stale). */
export const HEAD_LINES = 40;

function embedSource(root: string, source: SourceRef): SnapshotSource {
  const target = resolveSource(root, source);
  if (target.kind === "error") return { kind: "error", path: source.path, message: target.message };
  let text: string;
  try {
    text = readFileSync(target.file, "utf8");
  } catch (error) {
    return { kind: "error", path: source.path, message: `Stale reference: \`${source.path}\` cannot be read (${(error as Error).message})` };
  }
  const all = text.split("\n");
  let first: number;
  let last: number;
  let cited: [number, number] | undefined;
  if (target.lines) {
    cited = [target.lines.start, target.lines.end];
    first = Math.max(1, target.lines.start - CONTEXT_LINES);
    last = Math.min(all.length, target.lines.end + CONTEXT_LINES);
  } else {
    first = 1;
    last = Math.min(all.length, HEAD_LINES);
  }
  const lines: SnapshotLine[] = [];
  for (let n = first; n <= last; n += 1) lines.push({ n, text: all[n - 1] ?? "" });
  const embedded: SnapshotSource = { kind: "code", path: source.path, first, last, lines };
  if (source.label) embedded.label = source.label;
  if (cited) embedded.cited = cited;
  if (target.warning) embedded.warning = target.warning;
  return embedded;
}

/**
 * Builds the snapshot for the diagram file `text` (read from `file`), resolving citations
 * against `root`. Throws when the file is not a renderable diagram — the same bar the VS
 * Code panel applies.
 */
export function buildSnapshot(root: string, file: string, text: string): ViewerSnapshot {
  const parsed = parseDiagram(text);
  if (!parsed.ok) throw new Error(`Can't show \`${file}\`: ${parsed.reason}`);
  const sources: Record<string, SnapshotSource> = {};
  for (const component of parsed.diagram.components) {
    component.sources.forEach((source, index) => {
      sources[sourceKey(component.id, index)] = embedSource(root, source);
    });
  }
  return { version: 1, doc: parsed.value, file, root, generatedAt: new Date().toISOString(), sources };
}

