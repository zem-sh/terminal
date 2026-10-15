import type { TerminalFontPreset, TerminalFontSource } from "./types";
import {
  FONT_URL_JETBRAINS_MONO,
  FONT_URL_JETBRAINS_MONO_BOLD,
  FONT_URL_JETBRAINS_MONO_ITALIC,
  FONT_URL_JETBRAINS_MONO_BOLD_ITALIC,
  FONT_URL_NERD_SYMBOLS,
  FONT_URL_NOTO_SYMBOLS,
  FONT_URL_SYMBOLA,
  FONT_URL_NOTO_CANADIAN_ABORIGINAL,
  FONT_URL_OPENMOJI,
} from "../../fonts/font-urls";

/** Local-first default font fallback chain with bundled fallback for JetBrains Mono, Nerd symbols, emoji, and CJK support. */
export const DEFAULT_FONT_SOURCES: TerminalFontSource[] = [
  {
    type: "local",
    matchers: [
      "jetbrainsmono nerd font",
      "jetbrains mono nerd font",
      "jetbrains mono nl nerd font mono",
      "jetbrains mono",
      "jetbrainsmono",
    ],
    label: "JetBrains Mono Nerd Font Regular (Local)",
  },
  {
    type: "local",
    matchers: [
      "jetbrainsmono nerd font bold",
      "jetbrains mono nerd font bold",
      "jetbrains mono nl nerd font mono bold",
      "jetbrains mono bold",
      "jetbrainsmono bold",
    ],
    label: "JetBrains Mono Nerd Font Bold (Local)",
  },
  {
    type: "local",
    matchers: [
      "jetbrainsmono nerd font italic",
      "jetbrains mono nerd font italic",
      "jetbrains mono nl nerd font mono italic",
      "jetbrains mono italic",
      "jetbrainsmono italic",
    ],
    label: "JetBrains Mono Nerd Font Italic (Local)",
  },
  {
    type: "local",
    matchers: [
      "jetbrainsmono nerd font bold italic",
      "jetbrains mono nerd font bold italic",
      "jetbrains mono nl nerd font mono bold italic",
      "jetbrains mono bold italic",
      "jetbrainsmono bold italic",
    ],
    label: "JetBrains Mono Nerd Font Bold Italic (Local)",
  },
  {
    type: "url",
    url: FONT_URL_JETBRAINS_MONO,
    label: "JetBrains Mono Nerd Font Regular",
  },
  {
    type: "url",
    url: FONT_URL_JETBRAINS_MONO_BOLD,
    label: "JetBrains Mono Nerd Font Bold",
  },
  {
    type: "url",
    url: FONT_URL_JETBRAINS_MONO_ITALIC,
    label: "JetBrains Mono Nerd Font Italic",
  },
  {
    type: "url",
    url: FONT_URL_JETBRAINS_MONO_BOLD_ITALIC,
    label: "JetBrains Mono Nerd Font Bold Italic",
  },
  {
    type: "local",
    matchers: [
      "symbols nerd font mono",
      "symbols nerd font",
      "nerd fonts symbols",
      "nerdfontssymbolsonly",
    ],
    label: "Symbols Nerd Font (Local)",
  },
  {
    type: "url",
    url: FONT_URL_NERD_SYMBOLS,
  },
  // Ghostty parity on macOS: prefer system symbols/emoji when available.
  {
    type: "local",
    matchers: ["apple symbols", "applesymbols", "apple symbols regular"],
    label: "Apple Symbols",
  },
  {
    type: "url",
    url: FONT_URL_NOTO_SYMBOLS,
  },
  {
    type: "url",
    url: FONT_URL_SYMBOLA,
  },
  {
    type: "local",
    matchers: [
      "noto sans canadian aboriginal",
      "notosanscanadianaboriginal",
      "euphemia ucas",
      "euphemiaucas",
    ],
    label: "Noto Sans Canadian Aboriginal / Euphemia UCAS",
  },
  {
    type: "url",
    url: FONT_URL_NOTO_CANADIAN_ABORIGINAL,
    label: "Noto Sans Canadian Aboriginal",
  },
  // Emoji and CJK come from the OS — the 16MB CJK + 10MB emoji fonts were
  // dropped from the bundle (they were pure fallbacks; see font-urls.ts).
  // Local Font Access (Chromium opt-in) resolves these to system fonts; the
  // bundled OpenMoji remains as the monochrome emoji fallback.
  {
    type: "local",
    matchers: ["apple color emoji", "applecoloremoji", "segoe ui emoji", "noto color emoji"],
    label: "Color Emoji",
  },
  {
    type: "url",
    url: FONT_URL_OPENMOJI,
  },
  {
    type: "local",
    matchers: [
      "pingfang sc",
      "pingfang",
      "hiragino sans gb",
      "microsoft yahei",
      "noto sans cjk sc",
      "wenquanyi",
      "source han sans",
    ],
    label: "CJK",
  },
];

function validateFontSource(source: TerminalFontSource, index: number): TerminalFontSource {
  if (!source || typeof source !== "object" || !("type" in source)) {
    throw new Error(`fontSources[${index}] must be a typed source object`);
  }
  if (source.type === "url") {
    if (typeof source.url !== "string" || !source.url.trim()) {
      throw new Error(`fontSources[${index}] url source requires a non-empty url`);
    }
    return source;
  }
  if (source.type === "buffer") {
    const data = source.data;
    if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      throw new Error(
        `fontSources[${index}] buffer source requires ArrayBuffer or ArrayBufferView`,
      );
    }
    return source;
  }
  if (source.type === "local") {
    if (!Array.isArray(source.matchers)) {
      throw new Error(`fontSources[${index}] local source requires at least one matcher`);
    }
    let hasMatcher = false;
    for (let i = 0; i < source.matchers.length; i += 1) {
      if (source.matchers[i]) {
        hasMatcher = true;
        break;
      }
    }
    if (!hasMatcher) {
      throw new Error(`fontSources[${index}] local source requires at least one matcher`);
    }
    return source;
  }
  throw new Error(`fontSources[${index}] has unsupported source type`);
}

/** Validates user-provided font sources or returns defaults based on preset (none returns empty array, otherwise default CDN fonts). */
export function normalizeFontSources(
  sources: TerminalFontSource[] | undefined,
  preset: TerminalFontPreset | undefined,
): TerminalFontSource[] {
  if (sources && sources.length) {
    const normalized: TerminalFontSource[] = new Array(sources.length);
    for (let i = 0; i < sources.length; i += 1) {
      normalized[i] = validateFontSource(sources[i], i);
    }
    return normalized;
  }

  if (preset === "none") return [];
  return [...DEFAULT_FONT_SOURCES];
}
