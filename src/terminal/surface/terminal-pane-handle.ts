import type { InputHandler, MouseMode } from "../input";
import type { GhosttyTheme } from "../../theme/ghostty";
import type {
  TerminalApp,
  TerminalFontHintTarget,
  TerminalFontSource,
  TerminalSearchState,
  TerminalShaderStage,
} from "../runtime/types";

export type TerminalSurface = {
  id: number;
  container: HTMLElement;
  focusTarget?: HTMLElement | null;
  app: TerminalApp;
  canvas: HTMLCanvasElement;
  imeInput: HTMLTextAreaElement;
  termDebugEl: HTMLPreElement;
};

export type TerminalPaneApi = {
  id: number;
  init: () => Promise<void>;
  setRenderer: (value: "auto" | "webgpu" | "webgl2") => void;
  setPaused: (value: boolean) => void;
  togglePause: () => void;
  setFontSize: (value: number) => void;
  setLineHeight: (value: number) => void;
  setLigatures: (value: boolean) => void;
  setFontHinting: (value: boolean) => void;
  setFontHintTarget: (value: TerminalFontHintTarget) => void;
  setFontSources: (sources: TerminalFontSource[]) => Promise<void>;
  applyTheme: (theme: GhosttyTheme, sourceLabel?: string) => void;
  resetTheme: () => void;
  sendInput: (text: string, source?: string) => void;
  sendKeyInput: (text: string, source?: string) => void;
  clearScreen: () => void;
  connectPty: (url?: string, cwd?: string) => void;
  disconnectPty: () => void;
  isPtyConnected: () => boolean;
  setMouseMode: (value: MouseMode) => void;
  getMouseStatus: () => ReturnType<InputHandler["getMouseStatus"]>;
  getCursorPosition: () => { row: number; col: number } | null;
  copySelectionToClipboard: () => Promise<boolean>;
  pasteFromClipboard: () => Promise<boolean>;
  selectWordAtClientPoint: (clientX: number, clientY: number) => boolean;
  setSearchQuery: (query: string) => void;
  clearSearch: () => void;
  searchNext: () => void;
  searchPrevious: () => void;
  getSearchState: () => TerminalSearchState;
  dumpAtlasForCodepoint: (cp: number) => void;
  resize: (cols: number, rows: number) => void;
  focus: () => void;
  blur: () => void;
  updateSize: (force?: boolean) => void;
  getBackend: () => string;
  setShaderStages: (stages: TerminalShaderStage[]) => void;
  getShaderStages: () => TerminalShaderStage[];
  getRawPane: () => TerminalSurface;
  getScrollbackText: () => string;
  scrollViewport: (lines: number) => void;
  getScrollbackInfo: () => { totalLines: number; viewportOffset: number; viewportLen: number };
  setSelection: (anchor: { row: number; col: number }, focus: { row: number; col: number }) => void;
  clearSelection: () => void;
  getSelectedText: () => string;
  getViewportText: () => string[];
};

/**
 * Compatibility handle for APIs/plugins that still address the single
 * mounted terminal as pane id 1.
 */
export class TerminalPaneHandle implements TerminalPaneApi {
  private readonly resolveSurface: () => TerminalSurface;

  constructor(resolveSurface: () => TerminalSurface) {
    this.resolveSurface = resolveSurface;
  }

  get id(): number {
    return this.resolveSurface().id;
  }

  init(): Promise<void> {
    return this.resolveSurface().app.init();
  }

  setRenderer(value: "auto" | "webgpu" | "webgl2"): void {
    this.resolveSurface().app.setRenderer(value);
  }

  setPaused(value: boolean): void {
    this.resolveSurface().app.setPaused(value);
  }

  togglePause(): void {
    this.resolveSurface().app.togglePause();
  }

  setFontSize(value: number): void {
    this.resolveSurface().app.setFontSize(value);
  }

  setLineHeight(value: number): void {
    this.resolveSurface().app.setLineHeight(value);
  }

  setLigatures(value: boolean): void {
    this.resolveSurface().app.setLigatures(value);
  }

  setFontHinting(value: boolean): void {
    this.resolveSurface().app.setFontHinting(value);
  }

  setFontHintTarget(value: TerminalFontHintTarget): void {
    this.resolveSurface().app.setFontHintTarget(value);
  }

  setFontSources(sources: TerminalFontSource[]): Promise<void> {
    return this.resolveSurface().app.setFontSources(sources);
  }

  applyTheme(theme: GhosttyTheme, sourceLabel?: string): void {
    this.resolveSurface().app.applyTheme(theme, sourceLabel);
  }

  resetTheme(): void {
    this.resolveSurface().app.resetTheme();
  }

  sendInput(text: string, source?: string): void {
    this.resolveSurface().app.sendInput(text, source);
  }

  sendKeyInput(text: string, source?: string): void {
    this.resolveSurface().app.sendKeyInput(text, source);
  }

  clearScreen(): void {
    this.resolveSurface().app.clearScreen();
  }

  connectPty(url = "", cwd?: string): void {
    this.resolveSurface().app.connectPty(url, cwd);
  }

  disconnectPty(): void {
    this.resolveSurface().app.disconnectPty();
  }

  isPtyConnected(): boolean {
    return this.resolveSurface().app.isPtyConnected();
  }

  setMouseMode(value: MouseMode): void {
    this.resolveSurface().app.setMouseMode(value);
  }

  getMouseStatus(): ReturnType<InputHandler["getMouseStatus"]> {
    return this.resolveSurface().app.getMouseStatus();
  }

  getCursorPosition(): { row: number; col: number } | null {
    return this.resolveSurface().app.getCursorPosition();
  }

  copySelectionToClipboard(): Promise<boolean> {
    return this.resolveSurface().app.copySelectionToClipboard();
  }

  pasteFromClipboard(): Promise<boolean> {
    return this.resolveSurface().app.pasteFromClipboard();
  }

  selectWordAtClientPoint(clientX: number, clientY: number): boolean {
    return this.resolveSurface().app.selectWordAtClientPoint(clientX, clientY);
  }

  setSearchQuery(query: string): void {
    this.resolveSurface().app.setSearchQuery(query);
  }

  clearSearch(): void {
    this.resolveSurface().app.clearSearch();
  }

  searchNext(): void {
    this.resolveSurface().app.searchNext();
  }

  searchPrevious(): void {
    this.resolveSurface().app.searchPrevious();
  }

  getSearchState(): TerminalSearchState {
    return this.resolveSurface().app.getSearchState();
  }

  dumpAtlasForCodepoint(cp: number): void {
    this.resolveSurface().app.dumpAtlasForCodepoint(cp);
  }

  resize(cols: number, rows: number): void {
    this.resolveSurface().app.resize(cols, rows);
  }

  focus(): void {
    this.resolveSurface().app.focus();
  }

  blur(): void {
    this.resolveSurface().app.blur();
  }

  updateSize(force?: boolean): void {
    this.resolveSurface().app.updateSize(force);
  }

  getBackend(): string {
    return this.resolveSurface().app.getBackend();
  }

  setShaderStages(stages: TerminalShaderStage[]): void {
    this.resolveSurface().app.setShaderStages(stages);
  }

  getShaderStages(): TerminalShaderStage[] {
    return this.resolveSurface().app.getShaderStages();
  }

  getRawPane(): TerminalSurface {
    return this.resolveSurface();
  }

  getScrollbackText(): string {
    return this.resolveSurface().app.getScrollbackText();
  }

  scrollViewport(lines: number): void {
    this.resolveSurface().app.scrollViewport(lines);
  }

  getScrollbackInfo(): { totalLines: number; viewportOffset: number; viewportLen: number } {
    return this.resolveSurface().app.getScrollbackInfo();
  }

  setSelection(anchor: { row: number; col: number }, focus: { row: number; col: number }): void {
    this.resolveSurface().app.setSelection(anchor, focus);
  }

  clearSelection(): void {
    this.resolveSurface().app.clearSelection();
  }

  getSelectedText(): string {
    return this.resolveSurface().app.getSelectedText();
  }

  getViewportText(): string[] {
    return this.resolveSurface().app.getViewportText();
  }
}
