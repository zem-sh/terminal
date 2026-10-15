import type { DesktopNotification, InputHandler, MouseMode } from "../input";
import { createTerminalApp } from "./app-factory";
import { getDefaultTerminalAppSession } from "../runtime/session";
import type {
  TerminalApp,
  TerminalAppCallbacks,
  TerminalAppOptions,
  TerminalAppSession,
  TerminalFontHintTarget,
  TerminalFontSource,
  TerminalSearchState,
  TerminalShaderStage,
} from "../runtime/types";
import {
  TerminalPaneHandle,
  type TerminalPaneApi,
  type TerminalSurface,
} from "./terminal-pane-handle";
import { TerminalShaderOps, type TerminalRenderStageHandle } from "./terminal-ops/shader-ops";

export { TerminalPaneHandle } from "./terminal-pane-handle";
export type { TerminalPaneApi, TerminalSurface } from "./terminal-pane-handle";
export type { TerminalRenderStageHandle } from "./terminal-ops/shader-ops";

const TERMINAL_ID = 1;

export type TerminalDomOptions = {
  canvasClassName?: string;
  imeInputClassName?: string;
  termDebugClassName?: string;
};

export type TerminalAppOptionsInput = Omit<TerminalAppOptions, "canvas" | "imeInput" | "session">;
export type TerminalAppOptionsContext = {
  id: number;
  root: HTMLElement;
  canvas: HTMLCanvasElement;
  imeInput: HTMLTextAreaElement;
  termDebugEl: HTMLPreElement;
  sourcePane: null;
};

export type TerminalOptions = {
  /** Root element that will contain one terminal runtime. */
  root: HTMLElement;
  /** Shared session for WASM/WebGPU resources. */
  session?: TerminalAppSession;
  /** App runtime options, static or derived from the generated DOM elements. */
  appOptions?: TerminalAppOptionsInput | ((context: TerminalAppOptionsContext) => TerminalAppOptionsInput);
  /** Font sources applied to this terminal. */
  fontSources?: TerminalFontSource[];
  /** Shader stages applied to this terminal. */
  shaderStages?: TerminalShaderStage[];
  /** Global handler for desktop notifications emitted by the terminal. */
  onDesktopNotification?: (notification: DesktopNotification & { paneId: number }) => void;
  /** Automatically call app.init() after construction (default true). */
  autoInit?: boolean;
  /** Override generated DOM class names. */
  dom?: TerminalDomOptions;
};

function assertRoot(root: HTMLElement): void {
  const isElementLike =
    typeof HTMLElement !== "undefined"
      ? root instanceof HTMLElement
      : !!root && typeof (root as { ownerDocument?: unknown }).ownerDocument !== "undefined";
  if (!isElementLike) {
    throw new Error("Terminal requires a root HTMLElement");
  }
}

function createCanvas(doc: Document, className: string): HTMLCanvasElement {
  const canvas = doc.createElement("canvas");
  canvas.className = className;
  canvas.tabIndex = 0;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.outline = "none";
  return canvas;
}

function createImeInput(doc: Document, className: string): HTMLTextAreaElement {
  const imeInput = doc.createElement("textarea");
  imeInput.className = className;
  imeInput.tabIndex = -1;
  imeInput.autocapitalize = "off";
  imeInput.autocomplete = "off";
  imeInput.autocorrect = "off";
  imeInput.spellcheck = false;
  imeInput.readOnly = true;
  imeInput.style.position = "fixed";
  imeInput.style.left = "0";
  imeInput.style.top = "0";
  imeInput.style.width = "1em";
  imeInput.style.height = "1em";
  imeInput.style.padding = "0";
  imeInput.style.margin = "0";
  imeInput.style.border = "0";
  imeInput.style.outline = "none";
  imeInput.style.background = "transparent";
  imeInput.style.color = "transparent";
  imeInput.style.caretColor = "transparent";
  imeInput.style.overflow = "hidden";
  imeInput.style.resize = "none";
  imeInput.style.opacity = "0";
  imeInput.style.pointerEvents = "none";
  return imeInput;
}

function createTermDebugElement(doc: Document, className: string): HTMLPreElement {
  const termDebugEl = doc.createElement("pre");
  termDebugEl.className = className;
  termDebugEl.setAttribute("aria-live", "polite");
  termDebugEl.style.position = "absolute";
  termDebugEl.style.left = "-10000px";
  termDebugEl.style.top = "0";
  termDebugEl.style.width = "1px";
  termDebugEl.style.height = "1px";
  termDebugEl.style.overflow = "hidden";
  return termDebugEl;
}

function prepareRoot(root: HTMLElement): void {
  root.classList.add("terminal-root");
  if (!root.style.position) root.style.position = "relative";
  if (!root.style.overflow) root.style.overflow = "hidden";
}

export class Terminal implements TerminalPaneApi {
  private readonly root: HTMLElement;
  private readonly shaderOps: TerminalShaderOps;
  private readonly paneHandle: TerminalPaneHandle;
  private readonly session: TerminalAppSession;
  private fontSources: TerminalFontSource[] | undefined;
  private surface: TerminalSurface | null = null;
  private destroyed = false;

  constructor(options: TerminalOptions) {
    assertRoot(options.root);
    this.root = options.root;
    this.session = options.session ?? getDefaultTerminalAppSession();
    this.fontSources = options.fontSources ? [...options.fontSources] : undefined;

    this.shaderOps = new TerminalShaderOps(
      {
        getPanes: () => (this.surface ? [this.surface] : []),
        getPaneById: (id) => (id === TERMINAL_ID ? this.surface : null),
      },
      options.shaderStages,
    );

    this.paneHandle = new TerminalPaneHandle(() => this.requireSurface());

    this.mount(options);

    if (options.autoInit !== false) {
      void this.init();
    }
  }

  get id(): number {
    return TERMINAL_ID;
  }

  get app(): TerminalApp {
    return this.requireSurface().app;
  }

  get canvas(): HTMLCanvasElement {
    return this.requireSurface().canvas;
  }

  get imeInput(): HTMLTextAreaElement {
    return this.requireSurface().imeInput;
  }

  get termDebugEl(): HTMLPreElement {
    return this.requireSurface().termDebugEl;
  }

  getSurface(): TerminalSurface {
    return this.requireSurface();
  }

  getPanes(): TerminalSurface[] {
    return [this.requireSurface()];
  }

  getPaneById(id: number): TerminalSurface | null {
    return id === TERMINAL_ID ? this.requireSurface() : null;
  }

  getActivePane(): TerminalSurface {
    return this.requireSurface();
  }

  getFocusedPane(): TerminalSurface {
    return this.requireSurface();
  }

  panes(): TerminalPaneHandle[] {
    return [this.paneHandle];
  }

  pane(id: number): TerminalPaneHandle | null {
    return id === TERMINAL_ID ? this.paneHandle : null;
  }

  activePane(): TerminalPaneHandle {
    return this.paneHandle;
  }

  focusedPane(): TerminalPaneHandle {
    return this.paneHandle;
  }

  forEachPane(visitor: (pane: TerminalPaneHandle) => void): void {
    visitor(this.paneHandle);
  }

  init(): Promise<void> {
    return this.app.init();
  }

  setRenderer(value: "auto" | "webgpu" | "webgl2"): void {
    this.app.setRenderer(value);
  }

  setTransparentBackground(value: boolean): void {
    this.app.setTransparentBackground(value);
  }

  setPaused(value: boolean): void {
    this.app.setPaused(value);
  }

  togglePause(): void {
    this.app.togglePause();
  }

  setFontSize(value: number): void {
    this.app.setFontSize(value);
  }

  setLineHeight(value: number): void {
    this.app.setLineHeight(value);
  }

  setLigatures(value: boolean): void {
    this.app.setLigatures(value);
  }

  setFontHinting(value: boolean): void {
    this.app.setFontHinting(value);
  }

  setFontHintTarget(value: TerminalFontHintTarget): void {
    this.app.setFontHintTarget(value);
  }

  async setFontSources(sources: TerminalFontSource[]): Promise<void> {
    this.fontSources = sources.length ? [...sources] : undefined;
    await this.app.setFontSources(this.fontSources ?? []);
  }

  applyTheme(theme: Parameters<TerminalApp["applyTheme"]>[0], sourceLabel?: string): void {
    this.app.applyTheme(theme, sourceLabel);
  }

  resetTheme(): void {
    this.app.resetTheme();
  }

  sendInput(text: string, source?: string): void {
    this.app.sendInput(text, source);
  }

  sendKeyInput(text: string, source?: string): void {
    this.app.sendKeyInput(text, source);
  }

  clearScreen(): void {
    this.app.clearScreen();
  }

  connectPty(url = "", cwd?: string): void {
    this.app.connectPty(url, cwd);
  }

  disconnectPty(): void {
    this.app.disconnectPty();
  }

  isPtyConnected(): boolean {
    return this.app.isPtyConnected();
  }

  setMouseMode(value: MouseMode): void {
    this.app.setMouseMode(value);
  }

  getMouseStatus(): ReturnType<InputHandler["getMouseStatus"]> {
    return this.app.getMouseStatus();
  }

  getCursorPosition(): { row: number; col: number } | null {
    return this.app.getCursorPosition();
  }

  copySelectionToClipboard(): Promise<boolean> {
    return this.app.copySelectionToClipboard();
  }

  pasteFromClipboard(): Promise<boolean> {
    return this.app.pasteFromClipboard();
  }

  selectWordAtClientPoint(clientX: number, clientY: number): boolean {
    return this.app.selectWordAtClientPoint(clientX, clientY);
  }

  setSearchQuery(query: string): void {
    this.app.setSearchQuery(query);
  }

  clearSearch(): void {
    this.app.clearSearch();
  }

  searchNext(): void {
    this.app.searchNext();
  }

  searchPrevious(): void {
    this.app.searchPrevious();
  }

  getSearchState(): TerminalSearchState {
    return this.app.getSearchState();
  }

  dumpAtlasForCodepoint(cp: number): void {
    this.app.dumpAtlasForCodepoint(cp);
  }

  resize(cols: number, rows: number): void {
    this.app.resize(cols, rows);
  }

  focus(): void {
    this.app.focus();
  }

  blur(): void {
    this.app.blur();
  }

  updateSize(force?: boolean): void {
    this.app.updateSize(force);
  }

  getBackend(): string {
    return this.app.getBackend();
  }

  getScrollbackText(): string {
    return this.app.getScrollbackText();
  }

  scrollViewport(lines: number): void {
    this.app.scrollViewport(lines);
  }

  getScrollbackInfo(): { totalLines: number; viewportOffset: number; viewportLen: number } {
    return this.app.getScrollbackInfo();
  }

  setSelection(anchor: { row: number; col: number }, focus: { row: number; col: number }): void {
    this.app.setSelection(anchor, focus);
  }

  clearSelection(): void {
    this.app.clearSelection();
  }

  getSelectedText(): string {
    return this.app.getSelectedText();
  }

  getViewportText(): string[] {
    return this.app.getViewportText();
  }

  setShaderStages(stages: TerminalShaderStage[]): void {
    this.shaderOps.setShaderStages(stages);
  }

  getShaderStages(): TerminalShaderStage[] {
    return this.shaderOps.getShaderStages();
  }

  addShaderStage(stage: TerminalShaderStage): TerminalRenderStageHandle {
    return this.shaderOps.addShaderStage(stage);
  }

  removeShaderStage(id: string): boolean {
    return this.shaderOps.removeShaderStage(id);
  }

  getRawPane(): TerminalSurface {
    return this.requireSurface();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.shaderOps.clear();
    this.surface?.app.destroy();
    this.surface = null;
    this.root.replaceChildren();
  }

  private mount(options: TerminalOptions): void {
    prepareRoot(this.root);
    const doc = this.root.ownerDocument ?? document;
    const canvas = createCanvas(doc, options.dom?.canvasClassName ?? "terminal-canvas");
    const imeInput = createImeInput(
      doc,
      options.dom?.imeInputClassName ?? "terminal-ime-input terminal-pane-ime-input",
    );
    const termDebugEl = createTermDebugElement(
      doc,
      options.dom?.termDebugClassName ?? "terminal-term-debug",
    );

    this.root.replaceChildren(canvas, imeInput, termDebugEl);

    const context: TerminalAppOptionsContext = {
      id: TERMINAL_ID,
      root: this.root,
      canvas,
      imeInput,
      termDebugEl,
      sourcePane: null,
    };
    const resolved =
      typeof options.appOptions === "function"
        ? options.appOptions(context)
        : (options.appOptions ?? {});
    const baseStages = this.shaderOps.normalizePaneShaderStages(resolved.shaderStages, TERMINAL_ID);
    this.shaderOps.setPaneBaseShaderStages(TERMINAL_ID, baseStages);

    const app = createTerminalApp({
      ...resolved,
      ...(this.fontSources ? { fontSources: this.fontSources } : {}),
      canvas,
      imeInput,
      session: this.session,
      elements: {
        ...resolved.elements,
        termDebugEl: resolved.elements?.termDebugEl ?? termDebugEl,
      },
      callbacks: this.createCallbacks(resolved.callbacks, options.onDesktopNotification),
      beforeInput: resolved.beforeInput,
      beforeRenderOutput: resolved.beforeRenderOutput,
      shaderStages: this.shaderOps.buildMergedShaderStages(baseStages),
    });

    this.surface = {
      id: TERMINAL_ID,
      container: this.root,
      focusTarget: canvas,
      app,
      canvas,
      imeInput,
      termDebugEl,
    };
  }

  private createCallbacks(
    callbacks: TerminalAppCallbacks | undefined,
    onDesktopNotification: TerminalOptions["onDesktopNotification"],
  ): TerminalAppCallbacks {
    return {
      ...callbacks,
      onDesktopNotification: (notification) => {
        callbacks?.onDesktopNotification?.(notification);
        onDesktopNotification?.({ ...notification, paneId: TERMINAL_ID });
      },
    };
  }

  private requireSurface(): TerminalSurface {
    if (!this.surface) {
      throw new Error("Terminal has been destroyed");
    }
    return this.surface;
  }
}

/** Create a new Terminal instance with the given options. */
export function createTerminal(options: TerminalOptions): Terminal {
  return new Terminal(options);
}
