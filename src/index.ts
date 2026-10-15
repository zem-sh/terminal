// @zem-sh/terminal - Terminal emulator core

export { Terminal } from "./terminal/surface/terminal"
export type {
  TerminalOptions,
  TerminalAppOptionsInput,
  TerminalAppOptionsContext,
  TerminalDomOptions,
  TerminalPaneApi,
  TerminalSurface,
  TerminalRenderStageHandle,
} from "./terminal/surface/terminal"

export { TerminalPaneHandle } from "./terminal/surface/terminal-pane-handle"
export type { TerminalPaneApi as TerminalPaneApiHandle, TerminalSurface as TerminalSurfaceHandle } from "./terminal/surface/terminal-pane-handle"

export {
  createWebSocketPtyTransport,
} from "./terminal/pty"
export type {
  PtyTransport,
} from "./terminal/pty"

export type {
  TerminalFontHintTarget,
  TerminalFontSource,
  TerminalUrlFontSource,
  TerminalBufferFontSource,
  TerminalLocalFontSource,
  TerminalShaderStage,
  TerminalShaderStageMode,
  TerminalShaderStageBackend,
  TerminalShaderStageSource,
} from "./terminal/runtime/types"

export {
  shaderStagesForPreset,
  shaderStagesForPresets,
} from "./shaders"
export type { ShaderPreset } from "./shaders"

export {
  createDemoController,
} from "./demos"
export type { DemoKind } from "./demos"

export {
  DEFAULT_FONT_SOURCES,
} from "./terminal/runtime/font-sources"

export {
  GHOSTTY_VERSION,
  GHOSTTY_COMMIT,
  GHOSTTY_PATCH_SHA256,
  ZIG_VERSION,
  TERMINAL_WASM_OPTIMIZE,
  TERMINAL_WASM_SIZE,
  TERMINAL_WASM_SHA256,
} from "./terminal/wasm/embedded"

// Theme APIs
export type { ThemeColor, ThemeTerminalColor, GhosttyTheme } from "./theme/ghostty"
export {
  parseGhosttyTheme,
  parseGhosttyColor,
  parseGhosttyTerminalColor,
  colorToFloats,
  colorToRgbU32,
} from "./theme/ghostty"
export {
  listBuiltinThemeNames,
  isBuiltinThemeName,
  getBuiltinThemeSource,
  getBuiltinTheme,
} from "./theme/catalog"
export type { TerminalBuiltinThemeName } from "./theme/catalog"
export { BUILTIN_THEME_NAMES, BUILTIN_THEME_SOURCES } from "./theme/builtin-themes"
export type { BuiltinThemeName } from "./theme/builtin-themes"
