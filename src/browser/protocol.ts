// The data contract between a diagram page and its source of truth (browser viewer). The
// stage-1 page reads a `ViewerSnapshot` embedded in its HTML; stage 2 serves the same
// shapes over HTTP. Browser-safe: no imports.

/** One embedded source line: `n` is its 1-based number in the original file. */
export interface SnapshotLine {
  n: number;
  text: string;
}

export type SnapshotSource =
  /** A readable file: the window [`first`, `last`] of `lines`, `cited` is the range to highlight. */
  | { kind: "code"; path: string; label?: string; first: number; last: number; cited?: [number, number]; warning?: string; lines: SnapshotLine[] }
  /** Resolution failed; show `message` on click. */
  | { kind: "error"; path: string; message: string };

/** Everything the viewer page needs: the diagram plus a source per citation. */
export interface ViewerSnapshot {
  version: 1;
  /** The raw diagram JSON, rendered tolerantly in the page. */
  doc: unknown;
  /** Absolute path of the diagram file, for the title bar and messages. */
  file: string;
  /** Repo root the citations resolved against (display only). */
  root: string;
  generatedAt: string;
  /** `componentId:index` → embedded source. */
  sources: Record<string, SnapshotSource>;
}

/** The key a click message (`componentId`, `index`) resolves to in {@link ViewerSnapshot.sources}. */
export function sourceKey(componentId: string, index: number): string {
  return `${componentId}:${index}`;
}
