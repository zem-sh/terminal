import type { CursorInfo, RenderPtrs, TerminalWasmExports, WasmAbi } from "./types";

export function resolveWasmAbi(exports: TerminalWasmExports): WasmAbi | null {
  if (exports.zemterm_render_info) {
    return { kind: "info" };
  }
  if (exports.zemterm_render_codepoints_ptr) {
    return { kind: "render" };
  }
  if (exports.zemterm_cell_codepoints_ptr) {
    return { kind: "cells" };
  }
  return null;
}

function ptrFromOffset(base: number, offset: number, memSize: number): number {
  if (!offset) return 0;
  const absolute = base + offset;
  if (absolute > 0 && absolute < memSize) return absolute;
  if (offset > 0 && offset < memSize) return offset;
  return 0;
}

export function unpackCursor(buffer: ArrayBufferLike, ptr: number): CursorInfo | null {
  if (!ptr) return null;
  const view = new DataView(buffer, ptr, 16);
  return {
    row: view.getUint16(0, true),
    col: view.getUint16(2, true),
    visible: view.getUint8(4),
    style: view.getUint8(5),
    blinking: view.getUint8(6),
    wideTail: view.getUint8(7),
    color: view.getUint32(8, true),
  };
}

export function readRenderInfo(exports: TerminalWasmExports, handle: number): RenderPtrs | null {
  if (!exports.zemterm_render_info) return null;
  const base = exports.zemterm_render_info(handle);
  if (!base) return null;
  const mem = exports.memory;
  const view = new DataView(mem.buffer, base, 64);
  const version = view.getUint32(0, true);
  if (version !== 1) {
    return null;
  }
  const rows = view.getUint16(4, true);
  const cols = view.getUint16(6, true);
  const memSize = mem.buffer.byteLength;
  const codepointsPtr = ptrFromOffset(base, view.getUint32(8, true), memSize);
  const fgPtr = ptrFromOffset(base, view.getUint32(12, true), memSize);
  const bgPtr = ptrFromOffset(base, view.getUint32(16, true), memSize);
  const ulPtr = ptrFromOffset(base, view.getUint32(20, true), memSize);
  const ulStylePtr = ptrFromOffset(base, view.getUint32(24, true), memSize);
  const graphemeOffsetPtr = ptrFromOffset(base, view.getUint32(28, true), memSize);
  const graphemeLenPtr = ptrFromOffset(base, view.getUint32(32, true), memSize);
  const graphemeBufferPtr = ptrFromOffset(base, view.getUint32(36, true), memSize);
  const graphemeBufferLen = view.getUint32(40, true);
  const selectionStartPtr = ptrFromOffset(base, view.getUint32(44, true), memSize);
  const selectionEndPtr = ptrFromOffset(base, view.getUint32(48, true), memSize);
  const cursorPtr = ptrFromOffset(base, view.getUint32(52, true), memSize);

  return {
    rows,
    cols,
    codepointsPtr,
    contentTagsPtr: 0,
    fgPtr,
    bgPtr,
    ulPtr,
    ulStylePtr,
    widePtr: 0,
    flagsPtr: 0,
    styleFlagsPtr: 0,
    linkIdsPtr: 0,
    graphemeOffsetPtr,
    graphemeLenPtr,
    graphemeBufferPtr,
    graphemeBufferLen,
    selectionStartPtr,
    selectionEndPtr,
    cursorPtr,
  };
}

export function readRenderPtrs(exports: TerminalWasmExports, handle: number): RenderPtrs {
  const rows = exports.zemterm_render_rows
    ? exports.zemterm_render_rows(handle)
    : exports.zemterm_rows!(handle);
  const cols = exports.zemterm_render_cols
    ? exports.zemterm_render_cols(handle)
    : exports.zemterm_cols!(handle);
  return {
    rows,
    cols,
    codepointsPtr: exports.zemterm_render_codepoints_ptr!(handle),
    contentTagsPtr: 0,
    widePtr: 0,
    flagsPtr: 0,
    styleFlagsPtr: 0,
    linkIdsPtr: 0,
    fgPtr: exports.zemterm_render_fg_rgba_ptr!(handle),
    bgPtr: exports.zemterm_render_bg_rgba_ptr!(handle),
    ulPtr: exports.zemterm_render_ul_rgba_ptr!(handle),
    ulStylePtr: exports.zemterm_render_ul_style_ptr!(handle),
    graphemeOffsetPtr: exports.zemterm_render_grapheme_offset_ptr!(handle),
    graphemeLenPtr: exports.zemterm_render_grapheme_len_ptr!(handle),
    graphemeBufferPtr: exports.zemterm_render_grapheme_buffer_ptr!(handle),
    graphemeBufferLen: exports.zemterm_render_grapheme_buffer_len
      ? exports.zemterm_render_grapheme_buffer_len(handle)
      : 0,
    selectionStartPtr: exports.zemterm_render_selection_start_ptr!(handle),
    selectionEndPtr: exports.zemterm_render_selection_end_ptr!(handle),
    cursorPtr: exports.zemterm_render_cursor_ptr!(handle),
  };
}

export function readCellPtrs(exports: TerminalWasmExports, handle: number): RenderPtrs {
  const rows = exports.zemterm_rows!(handle);
  const cols = exports.zemterm_cols!(handle);
  return {
    rows,
    cols,
    codepointsPtr: exports.zemterm_cell_codepoints_ptr!(handle),
    contentTagsPtr: exports.zemterm_cell_content_tags_ptr
      ? exports.zemterm_cell_content_tags_ptr(handle)
      : 0,
    widePtr: exports.zemterm_cell_wide_ptr ? exports.zemterm_cell_wide_ptr(handle) : 0,
    flagsPtr: exports.zemterm_cell_flags_ptr ? exports.zemterm_cell_flags_ptr(handle) : 0,
    styleFlagsPtr: exports.zemterm_cell_style_flags_ptr
      ? exports.zemterm_cell_style_flags_ptr(handle)
      : 0,
    linkIdsPtr: exports.zemterm_cell_link_ids_ptr ? exports.zemterm_cell_link_ids_ptr(handle) : 0,
    fgPtr: exports.zemterm_cell_fg_rgba_ptr!(handle),
    bgPtr: exports.zemterm_cell_bg_rgba_ptr!(handle),
    ulPtr: exports.zemterm_cell_ul_rgba_ptr!(handle),
    ulStylePtr: exports.zemterm_cell_underline_styles_ptr!(handle),
    graphemeOffsetPtr: exports.zemterm_cell_grapheme_offsets_ptr!(handle),
    graphemeLenPtr: exports.zemterm_cell_grapheme_lengths_ptr!(handle),
    graphemeBufferPtr: exports.zemterm_grapheme_buffer_ptr!(handle),
    graphemeBufferLen: exports.zemterm_grapheme_buffer_len!(handle),
    selectionStartPtr: exports.zemterm_row_selection_start_ptr!(handle),
    selectionEndPtr: exports.zemterm_row_selection_end_ptr!(handle),
    cursorPtr: exports.zemterm_cursor_info_ptr!(handle),
  };
}

export function readRenderStatePtrs(
  abi: WasmAbi,
  exports: TerminalWasmExports,
  handle: number,
): RenderPtrs | null {
  if (abi.kind === "info") {
    return readRenderInfo(exports, handle);
  }
  if (abi.kind === "render") {
    return readRenderPtrs(exports, handle);
  }
  return readCellPtrs(exports, handle);
}
