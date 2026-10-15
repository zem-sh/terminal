type CellCluster = {
  cp: number;
  text: string;
  span: number;
};

type CursorCell = {
  row: number;
  col: number;
  wide: boolean;
};

type ResolveLigatureRunOptions = {
  idx: number;
  row: number;
  col: number;
  cols: number;
  contentTags: Uint8Array | null;
  styleFlags: Uint16Array | null;
  linkIds: Uint32Array | null;
  fgBytes: Uint8Array;
  bgBytes: Uint8Array | null;
  ulBytes: Uint8Array | null;
  ulStyle: Uint8Array | null;
  cursorBlock: boolean;
  cursorCell: CursorCell | null;
  readCellCluster: (cellIndex: number) => CellCluster | null;
};

type LigatureRun = {
  text: string;
  span: number;
  indices: number[];
};

type ShapedGlyphLike = {
  glyphId: number;
  xAdvance: number;
  xOffset: number;
};

type ShapedClusterLike = {
  glyphs: ShapedGlyphLike[];
  advance: number;
};

type ResolveRenderableLigatureRunOptions<FontEntry> = {
  ligatureRun: LigatureRun;
  stylePreference: string;
  fonts: FontEntry[];
  pickFontIndexForText: (text: string, expectedSpan?: number, stylePreference?: string) => number;
  shapeClusterWithFont: (entry: FontEntry, text: string) => ShapedClusterLike;
  readCellCluster: (cellIndex: number) => CellCluster | null;
};

const PROGRAMMING_LIGATURE_CHARS = new Set(Array.from("!#%&*+-.:/<=>?@\\^|~"));
const MAX_LIGATURE_RUN_CHARS = 8;

function bytesEqual(
  left: Uint8Array | null,
  leftIndex: number,
  right: Uint8Array | null,
  rightIndex: number,
): boolean {
  if (!left || !right) return left === right;
  const leftOffset = leftIndex * 4;
  const rightOffset = rightIndex * 4;
  for (let i = 0; i < 4; i += 1) {
    if ((left[leftOffset + i] ?? 0) !== (right[rightOffset + i] ?? 0)) return false;
  }
  return true;
}

function valuesEqual(
  left: Uint8Array | Uint16Array | Uint32Array | null,
  leftIndex: number,
  right: Uint8Array | Uint16Array | Uint32Array | null,
  rightIndex: number,
): boolean {
  if (!left || !right) return left === right;
  return (left[leftIndex] ?? 0) === (right[rightIndex] ?? 0);
}

function isLigatureRunText(text: string): boolean {
  if (text.length !== 1) return false;
  return PROGRAMMING_LIGATURE_CHARS.has(text);
}

export function resolveLigatureRun(options: ResolveLigatureRunOptions): LigatureRun | null {
  const {
    idx,
    row,
    col,
    cols,
    contentTags,
    styleFlags,
    linkIds,
    fgBytes,
    bgBytes,
    ulBytes,
    ulStyle,
    cursorBlock,
    cursorCell,
    readCellCluster,
  } = options;

  const cluster = readCellCluster(idx);
  if (!cluster || cluster.span !== 1 || !isLigatureRunText(cluster.text)) return null;

  if (
    cursorBlock &&
    cursorCell &&
    row === cursorCell.row &&
    col >= cursorCell.col &&
    col < cursorCell.col + (cursorCell.wide ? 2 : 1)
  ) {
    return null;
  }

  const rowEnd = row * cols + cols;
  const indices = [idx];
  let text = cluster.text;
  let span = cluster.span;

  for (
    let nextIdx = idx + cluster.span;
    nextIdx < rowEnd && indices.length < MAX_LIGATURE_RUN_CHARS;
    nextIdx += 1
  ) {
    const nextCol = col + indices.length;
    const nextCluster = readCellCluster(nextIdx);
    if (!nextCluster || nextCluster.span !== 1 || !isLigatureRunText(nextCluster.text)) break;

    if (
      cursorBlock &&
      cursorCell &&
      row === cursorCell.row &&
      nextCol >= cursorCell.col &&
      nextCol < cursorCell.col + (cursorCell.wide ? 2 : 1)
    ) {
      break;
    }

    if (!valuesEqual(contentTags, idx, contentTags, nextIdx)) break;
    if (!valuesEqual(styleFlags, idx, styleFlags, nextIdx)) break;
    if (!valuesEqual(linkIds, idx, linkIds, nextIdx)) break;
    if (!valuesEqual(ulStyle, idx, ulStyle, nextIdx)) break;
    if (!bytesEqual(fgBytes, idx, fgBytes, nextIdx)) break;
    if (!bytesEqual(bgBytes, idx, bgBytes, nextIdx)) break;
    if (!bytesEqual(ulBytes, idx, ulBytes, nextIdx)) break;

    text += nextCluster.text;
    span += nextCluster.span;
    indices.push(nextIdx);
  }

  return indices.length >= 2 ? { text, span, indices } : null;
}

export function shouldUseLigatureShape(
  combined: ShapedClusterLike,
  singles: ShapedClusterLike[],
): boolean {
  if (!combined.glyphs.length || singles.length < 2) return false;

  const flatSingles: ShapedGlyphLike[] = [];
  for (const shaped of singles) {
    for (const glyph of shaped.glyphs) flatSingles.push(glyph);
  }

  // Only treat as a ligature when there is an actual glyph substitution —
  // a different number of glyphs or different glyph IDs. Contextual kerning
  // (changed xAdvance / xOffset) is not a ligature and must be ignored so
  // that each character stays in its own cell with correct per-cell layout.
  if (combined.glyphs.length !== flatSingles.length) return true;

  for (let i = 0; i < combined.glyphs.length; i += 1) {
    const left = combined.glyphs[i];
    const right = flatSingles[i];
    if (!left || !right) return true;
    if (left.glyphId !== right.glyphId) return true;
  }

  return false;
}

export function resolveRenderableLigatureRun<FontEntry>(
  options: ResolveRenderableLigatureRunOptions<FontEntry>,
): LigatureRun | null {
  const {
    ligatureRun,
    stylePreference,
    fonts,
    pickFontIndexForText,
    shapeClusterWithFont,
    readCellCluster,
  } = options;

  const ligatureFontIndex = pickFontIndexForText(
    ligatureRun.text,
    ligatureRun.span,
    stylePreference,
  );
  const ligatureFontEntry = fonts[ligatureFontIndex] ?? fonts[0];
  if (!ligatureFontEntry) return null;

  const ligatureShaped = shapeClusterWithFont(ligatureFontEntry, ligatureRun.text);
  const singleCellShapes = ligatureRun.indices.map((cellIdx) => {
    const cluster = readCellCluster(cellIdx);
    return shapeClusterWithFont(ligatureFontEntry, cluster?.text ?? "");
  });

  return shouldUseLigatureShape(ligatureShaped, singleCellShapes) ? ligatureRun : null;
}
