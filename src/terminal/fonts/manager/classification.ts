import type { FontEntry, FontScaleOverride } from "../types";

const SYMBOL_FONT_HINTS = [/symbols nerd font/i, /noto sans symbols/i, /apple symbols/i, /symbola/i];
const NERD_SYMBOL_FONT_HINTS = [/symbols nerd font/i, /nerd fonts symbols/i];
const COLOR_EMOJI_FONT_HINTS = [
  /apple color emoji/i,
  /noto color emoji/i,
  /segoe ui emoji/i,
  /twemoji/i,
];

// Broader emoji font set for text selection; includes outline emoji fonts
// that the text-shaper can actually produce glyphs from (unlike sbix/CBDT
// bitmap color fonts whose glyphs require a different rendering path).
const EMOJI_FONT_HINTS = [
  ...COLOR_EMOJI_FONT_HINTS,
  /openmoji/i,
  /noto emoji/i,
  /emoji one/i,
  /joypixels/i,
];
const WIDE_FONT_HINTS = [
  /cjk/i,
  /emoji/i,
  /openmoji/i,
  /source han/i,
  /pingfang/i,
  /hiragino/i,
  /yu gothic/i,
  /meiryo/i,
  /yahei/i,
  /ms gothic/i,
  /simhei/i,
  /simsun/i,
  /nanum/i,
  /apple sd gothic/i,
];

/** Check whether a font entry is a symbol/icon font based on its label. */
export function isSymbolFont(entry: FontEntry | null | undefined): boolean {
  if (!entry?.label) return false;
  const label = String(entry.label).toLowerCase();
  return SYMBOL_FONT_HINTS.some((rule) => rule.test(label));
}

/** Check whether a font entry is a Nerd Font symbols font. */
export function isNerdSymbolFont(entry: FontEntry | null | undefined): boolean {
  if (!entry?.label) return false;
  const label = String(entry.label).toLowerCase();
  return NERD_SYMBOL_FONT_HINTS.some((rule) => rule.test(label));
}

/** Check whether a font entry is a color bitmap emoji font (sbix/CBDT). */
export function isColorEmojiFont(entry: FontEntry | null | undefined): boolean {
  if (!entry?.label) return false;
  const label = String(entry.label).toLowerCase();
  return COLOR_EMOJI_FONT_HINTS.some((rule) => rule.test(label));
}

/** Check whether a font entry is any kind of emoji font (color bitmap or
 *  outline). Used for font selection in `pickFontIndexForText` so that
 *  outline emoji fonts like OpenMoji — which the text-shaper can produce
 *  real glyphs from — are preferred over fallback symbol/monospace fonts. */
export function isEmojiFont(entry: FontEntry | null | undefined): boolean {
  if (!entry?.label) return false;
  const label = String(entry.label).toLowerCase();
  return EMOJI_FONT_HINTS.some((rule) => rule.test(label));
}

/** Return the maximum cell span for a font (2 for CJK/emoji, 1 otherwise). */
export function fontMaxCellSpan(entry: FontEntry | null | undefined): number {
  if (!entry?.label) return 1;
  const label = String(entry.label).toLowerCase();
  for (const rule of WIDE_FONT_HINTS) {
    if (rule.test(label)) return 2;
  }
  return 1;
}

/** Return the scale multiplier for a font entry by matching its label against overrides. */
export function fontScaleOverride(
  entry: FontEntry | null | undefined,
  overrides: FontScaleOverride[] = [],
): number {
  if (!entry?.label) return 1;
  const label = String(entry.label).toLowerCase();
  for (const rule of overrides) {
    if (rule.match.test(label)) return rule.scale;
  }
  return 1;
}

/** Compute the atlas raster scale for a font, applying symbol atlas scaling for fallback symbol fonts. */
export function fontRasterScale(
  entry: FontEntry | null | undefined,
  fontIndex: number,
  maxSymbolAtlasScale: number,
  overrides: FontScaleOverride[] = [],
): number {
  const scale = fontScaleOverride(entry, overrides);
  if (fontIndex > 0 && isSymbolFont(entry)) return scale * maxSymbolAtlasScale;
  return scale;
}
