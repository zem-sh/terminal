// terminal public API - high-level integration first.

export {
  Terminal,
  TerminalPaneHandle,
  createTerminal,
} from "./surface/terminal";
export type {
  TerminalOptions,
  TerminalAppOptionsInput,
  TerminalAppOptionsContext,
  TerminalDomOptions,
  TerminalPaneApi,
  TerminalSurface,
  TerminalRenderStageHandle,
} from "./surface/terminal";
export type {
  TerminalFontHintTarget,
  TerminalFontSource,
  TerminalUrlFontSource,
  TerminalBufferFontSource,
  TerminalLocalFontSource,
  TerminalFontPreset,
  TerminalShaderStage,
  TerminalShaderStageMode,
  TerminalShaderStageBackend,
  TerminalShaderStageSource,
} from "./runtime/types";
