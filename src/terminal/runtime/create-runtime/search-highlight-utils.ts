import type { TerminalSearchViewportMatch } from "../types";

type SearchCellHighlightKind = 0 | 1 | 2;

export function searchHighlightForColumn(
  matches: readonly TerminalSearchViewportMatch[],
  startIndex: number,
  endIndex: number,
  col: number,
  cols: number,
): { nextIndex: number; kind: SearchCellHighlightKind } {
  let nextIndex = startIndex;

  while (nextIndex < endIndex) {
    const match = matches[nextIndex]!;
    const start = Math.max(0, Math.min(cols, match.startCol));
    const end = Math.max(start, Math.min(cols, match.endCol));
    if (end <= col) {
      nextIndex += 1;
      continue;
    }
    if (start > col) break;
    return {
      nextIndex,
      kind: match.selected ? 2 : 1,
    };
  }

  return {
    nextIndex,
    kind: 0,
  };
}
