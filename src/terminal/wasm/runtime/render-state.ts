import { readRenderStatePtrs, unpackCursor } from "./abi";
import type { RenderState, RenderViewCache, TerminalWasmExports, WasmAbi } from "./types";
import { getCachedView } from "./view-cache";

const textDecoder = new TextDecoder();
const URL_REGEX =
  /https?:\/\/[^\s\x00-\x1f\x7f\u2000-\u200f\u2028-\u202f\u205f\u3000<>"{}|\\^`[\]]+/g;

// Absolute (/...), home (~/...), or relative (./... or ../...) paths
// with optional :line[:col] suffix.
const PATH_REGEX =
  /(?:\/|~\/|\.\.?\/)[\w.\/-]+(?:\.[\w]+)?(?::\d+(?::\d+)?)?/g;

/**
 * Scan (possibly multi-row) text for a regex pattern and register link IDs for
 * matching cells. `cellToTextIdx[i]` is the char offset of cell i within
 * `text`; `cellIndices[i]` is its global buffer index (row * cols + col).
 */
function registerMatches(
  pattern: RegExp,
  text: string,
  cellToTextIdx: number[],
  cellIndices: number[],
  linkIds: Uint32Array,
  uris: string[],
  nextId: number,
): number {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const uri = match[0];
    const startChar = match.index;
    const endChar = startChar + uri.length;

    const linkId = nextId++;
    uris.push(uri);

    const cellCount = cellToTextIdx.length;
    for (let i = 0; i < cellCount; i++) {
      const cellCharStart = cellToTextIdx[i];
      const cellCharEnd =
        i + 1 < cellCount ? cellToTextIdx[i + 1] : text.length;
      if (cellCharStart < endChar && cellCharEnd > startChar) {
        const idx = cellIndices[i];
        if (!linkIds[idx]) {
          linkIds[idx] = linkId;
        }
      }
    }
  }
  return nextId;
}

export function detectClientUrls(
  rows: number,
  cols: number,
  codepoints: Uint32Array,
  wide: Uint8Array | null,
  existingLinkIds: Uint32Array | null,
  existingOffsets: Uint32Array | null,
  existingLengths: Uint32Array | null,
  existingBuffer: Uint8Array | null,
): {
  linkIds: Uint32Array;
  linkOffsets: Uint32Array;
  linkLengths: Uint32Array;
  linkBuffer: Uint8Array;
} {
  const cellCount = rows * cols;
  const linkIds = new Uint32Array(cellCount);
  // Copy existing OSC 8 link IDs if present
  if (existingLinkIds) {
    linkIds.set(existingLinkIds.subarray(0, Math.min(existingLinkIds.length, cellCount)));
  }

  // Collect all URIs (each occurrence gets its own ID — no deduplication)
  const uris: string[] = [];
  let nextId = 1;

  // Load existing OSC 8 URIs first
  if (existingOffsets && existingLengths && existingBuffer) {
    const existingCount = existingOffsets.length;
    for (let i = 0; i < existingCount; i++) {
      const offset = existingOffsets[i];
      const len = existingLengths[i];
      if (!len) continue;
      const uri = textDecoder.decode(existingBuffer.subarray(offset, offset + len));
      uris.push(uri);
      nextId = Math.max(nextId, i + 2);
    }
  }

  // Build logical lines and scan for URLs. Physical rows that soft-wrap into
  // the next row (their last cell is occupied, or holds a wide-char spacer
  // head/tail) are joined with no separator, so a URL that wraps onto the next
  // line in a narrow pane is detected as a single link instead of being cut at
  // the wrap boundary.
  for (let row = 0; row < rows; ) {
    let endRow = row;
    while (endRow + 1 < rows) {
      const lastIdx = endRow * cols + cols - 1;
      const lastWide = wide?.[lastIdx] ?? 0;
      // Wide.spacer_tail (2): a wide char fills the last two cells.
      // Wide.spacer_head (3): a wide char wraps into the next row.
      const lastOccupied =
        codepoints[lastIdx] !== 0 || lastWide === 2 || lastWide === 3;
      if (!lastOccupied) break;
      endRow += 1;
    }

    let rowText = "";
    const cellToTextIdx: number[] = [];
    const cellIndices: number[] = [];
    for (let r = row; r <= endRow; r++) {
      const rowStart = r * cols;
      for (let col = 0; col < cols; col++) {
        const idx = rowStart + col;
        cellToTextIdx.push(rowText.length);
        cellIndices.push(idx);
        const cp = codepoints[idx];
        rowText += cp === 0 ? " " : String.fromCodePoint(cp);
      }
    }

    // Find URLs (higher priority — run first)
    nextId = registerMatches(
      URL_REGEX, rowText, cellToTextIdx, cellIndices, linkIds, uris, nextId,
    );
    // Find file paths (don't overwrite URL-matched cells)
    nextId = registerMatches(
      PATH_REGEX, rowText, cellToTextIdx, cellIndices, linkIds, uris, nextId,
    );

    row = endRow + 1;
  }

  // Build link buffer from collected URIs
  const encoder = new TextEncoder();
  let totalBytes = 0;
  const encodedUris: Uint8Array[] = [];
  for (const uri of uris) {
    const encoded = encoder.encode(uri);
    encodedUris.push(encoded);
    totalBytes += encoded.length;
  }

  const linkOffsets = new Uint32Array(uris.length);
  const linkLengths = new Uint32Array(uris.length);
  const linkBuffer = new Uint8Array(totalBytes);

  let byteOffset = 0;
  for (let i = 0; i < uris.length; i++) {
    const encoded = encodedUris[i];
    linkOffsets[i] = byteOffset;
    linkLengths[i] = encoded.length;
    linkBuffer.set(encoded, byteOffset);
    byteOffset += encoded.length;
  }

  return { linkIds, linkOffsets, linkLengths, linkBuffer };
}

export function readRenderState(
  abi: WasmAbi,
  exports: TerminalWasmExports,
  memory: WebAssembly.Memory,
  handle: number,
  cache: RenderViewCache,
): RenderState | null {
  const info = readRenderStatePtrs(abi, exports, handle);
  if (!info) return null;

  const { rows, cols } = info;
  if (!rows || !cols) return null;

  const cellCount = rows * cols;
  const buffer = memory.buffer;
  const codepoints = getCachedView(
    cache.codepoints,
    buffer,
    info.codepointsPtr,
    cellCount,
    Uint32Array,
  );
  const contentTags = getCachedView(
    cache.contentTags,
    buffer,
    info.contentTagsPtr,
    cellCount,
    Uint8Array,
  );
  const wide = getCachedView(cache.wide, buffer, info.widePtr, cellCount, Uint8Array);
  const cellFlags = getCachedView(cache.cellFlags, buffer, info.flagsPtr, cellCount, Uint16Array);
  const styleFlags = getCachedView(
    cache.styleFlags,
    buffer,
    info.styleFlagsPtr,
    cellCount,
    Uint16Array,
  );
  const linkIds = getCachedView(cache.linkIds, buffer, info.linkIdsPtr, cellCount, Uint32Array);
  const fgBytes = getCachedView(cache.fgBytes, buffer, info.fgPtr, cellCount * 4, Uint8Array);
  const bgBytes = getCachedView(cache.bgBytes, buffer, info.bgPtr, cellCount * 4, Uint8Array);
  const ulBytes = getCachedView(cache.ulBytes, buffer, info.ulPtr, cellCount * 4, Uint8Array);
  const ulStyle = getCachedView(cache.ulStyle, buffer, info.ulStylePtr, cellCount, Uint8Array);
  const linkCount = exports.zemterm_link_count ? exports.zemterm_link_count(handle) : 0;
  const linkOffsetsPtr =
    linkCount && exports.zemterm_link_offsets_ptr ? exports.zemterm_link_offsets_ptr(handle) : 0;
  const linkLengthsPtr =
    linkCount && exports.zemterm_link_lengths_ptr ? exports.zemterm_link_lengths_ptr(handle) : 0;
  const linkOffsets = getCachedView(
    cache.linkOffsets,
    buffer,
    linkOffsetsPtr,
    linkCount,
    Uint32Array,
  );
  const linkLengths = getCachedView(
    cache.linkLengths,
    buffer,
    linkLengthsPtr,
    linkCount,
    Uint32Array,
  );
  const linkBufferLen = exports.zemterm_link_buffer_len ? exports.zemterm_link_buffer_len(handle) : 0;
  const linkBufferPtr =
    linkBufferLen && exports.zemterm_link_buffer_ptr ? exports.zemterm_link_buffer_ptr(handle) : 0;
  const linkBuffer = getCachedView(
    cache.linkBuffer,
    buffer,
    linkBufferPtr,
    linkBufferLen,
    Uint8Array,
  );
  const graphemeOffset = getCachedView(
    cache.graphemeOffset,
    buffer,
    info.graphemeOffsetPtr,
    cellCount,
    Uint32Array,
  );
  const graphemeLen = getCachedView(
    cache.graphemeLen,
    buffer,
    info.graphemeLenPtr,
    cellCount,
    Uint32Array,
  );
  const graphemeBuffer = getCachedView(
    cache.graphemeBuffer,
    buffer,
    info.graphemeBufferPtr,
    info.graphemeBufferLen,
    Uint32Array,
  );
  const selectionStart = getCachedView(
    cache.selectionStart,
    buffer,
    info.selectionStartPtr,
    rows,
    Int16Array,
  );
  const selectionEnd = getCachedView(
    cache.selectionEnd,
    buffer,
    info.selectionEndPtr,
    rows,
    Int16Array,
  );
  const cursor = info.cursorPtr ? unpackCursor(buffer, info.cursorPtr) : null;

  // Detect URLs in cell text and merge with OSC 8 links from WASM
  const clientLinks = detectClientUrls(rows, cols, codepoints, wide, linkIds, linkOffsets, linkLengths, linkBuffer);

  return {
    rows,
    cols,
    cellCount,
    codepoints,
    contentTags,
    wide,
    cellFlags,
    styleFlags,
    linkIds: clientLinks.linkIds,
    fgBytes,
    bgBytes,
    ulBytes,
    ulStyle,
    linkOffsets: clientLinks.linkOffsets,
    linkLengths: clientLinks.linkLengths,
    linkBuffer: clientLinks.linkBuffer,
    graphemeOffset,
    graphemeLen,
    graphemeBuffer,
    selectionStart,
    selectionEnd,
    cursor,
  };
}
