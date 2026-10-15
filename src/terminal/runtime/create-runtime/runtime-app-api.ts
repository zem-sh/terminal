import type { InputHandler, MouseMode } from "../../input";
import { initWebGPU, initWebGL, type WebGPUState, type WebGLState } from "../../renderer";
import type { PtyTransport } from "../../pty";
import type { GhosttyTheme } from "../../../theme/ghostty";
import {
  copyToClipboard as writeClipboardText,
  pasteFromClipboard as readClipboardText,
} from "../../selection";
import type { TerminalWasm, TerminalWasmExports } from "../../wasm";
import { normalizeNewlines } from "../create-app-io-utils";
import { resolveMaxScrollbackBytes } from "../max-scrollback";
import type { TerminalApp, TerminalAppCallbacks, TerminalAppSession } from "../types";
import type { PtyInputRuntime } from "./pty-input-runtime";
import type { RuntimeInteraction } from "./interaction-runtime";

export type RuntimeAppApiSharedState = {
  wasm: TerminalWasm | null;
  wasmExports: TerminalWasmExports | null;
  wasmHandle: number;
  wasmReady: boolean;
  activeState: WebGPUState | WebGLState | null;
  needsRender: boolean;
  lastRenderTime: number;
  currentContextType: "webgpu" | "webgl2" | null;
  isFocused: boolean;
  lastKeydownSeq: string;
  lastKeydownSeqAt: number;
};

type RuntimeBackend = "none" | "webgpu" | "webgl2";
type PreferredRenderer = "auto" | "webgpu" | "webgl2";

type RuntimeInternalState = {
  paused: boolean;
  backend: RuntimeBackend;
  preferredRenderer: PreferredRenderer;
  rafId: number;
  frameCount: number;
  lastFpsTime: number;
  nextBlinkTime: number;
};

type RuntimeSendInput = (text: string, source?: string, options?: { skipHooks?: boolean }) => void;

type RuntimePublicApiOptions = {
  setFontSize: TerminalApp["setFontSize"];
  setLineHeight: TerminalApp["setLineHeight"];
  setLigatures: TerminalApp["setLigatures"];
  setFontHinting: TerminalApp["setFontHinting"];
  setFontHintTarget: TerminalApp["setFontHintTarget"];
  setFontSources: TerminalApp["setFontSources"];
  resetTheme: TerminalApp["resetTheme"];
  setSearchQuery: TerminalApp["setSearchQuery"];
  clearSearch: TerminalApp["clearSearch"];
  searchNext: TerminalApp["searchNext"];
  searchPrevious: TerminalApp["searchPrevious"];
  getSearchState: TerminalApp["getSearchState"];
  dumpAtlasForCodepoint: TerminalApp["dumpAtlasForCodepoint"];
  resize: TerminalApp["resize"];
  focus: TerminalApp["focus"];
  blur: TerminalApp["blur"];
  updateSize: TerminalApp["updateSize"];
  setShaderStages: TerminalApp["setShaderStages"];
  getShaderStages: TerminalApp["getShaderStages"];
};

export type RuntimeAppApiRuntime = {
  sendInput: RuntimeSendInput;
  createPublicApi: (options: RuntimePublicApiOptions) => TerminalApp;
};

type LifecycleThemeRuntime = {
  cancelScheduledSizeUpdate: () => void;
  getActiveTheme: () => GhosttyTheme | null;
};

type CreateRuntimeAppApiOptions = {
  session: TerminalAppSession;
  ptyTransport: PtyTransport;
  inputHandler: InputHandler;
  ptyInputRuntime: PtyInputRuntime;
  interaction: RuntimeInteraction;
  lifecycleThemeSizeRuntime: LifecycleThemeRuntime;
  cleanupFns: Array<() => void>;
  cleanupCanvasFns: Array<() => void>;
  callbacks?: TerminalAppCallbacks;
  fpsEl: HTMLElement | null;
  backendEl: HTMLElement | null;
  inputDebugEl: HTMLElement | null;
  imeInput: HTMLTextAreaElement | null;
  attachWindowEvents: boolean;
  isMacPlatform: boolean;
  textEncoder: TextEncoder;
  readState: () => RuntimeAppApiSharedState;
  writeState: (patch: Partial<RuntimeAppApiSharedState>) => void;
  appendLog: (line: string) => void;
  shouldSuppressWasmLog: (text: string) => boolean;
  runBeforeInputHook: (text: string, source: string) => string | null;
  runBeforeRenderOutputHook: (text: string, source: string) => string | null;
  getSelectionText: () => string;
  initialPreferredRenderer: PreferredRenderer;
  getTransparentBackground: () => boolean;
  setTransparentBackgroundValue: (value: boolean) => void;
  maxScrollbackBytes?: number;
  maxScrollback?: number;
  CURSOR_BLINK_MS: number;
  RESIZE_ACTIVE_MS: number;
  TARGET_RENDER_FPS: number;
  BACKGROUND_RENDER_FPS: number;
  KITTY_FLAG_REPORT_EVENTS: number;
  resizeState: { lastAt: number };
  tickWebGPU: (state: WebGPUState) => void;
  tickWebGL: (state: WebGLState) => void;
  updateGrid: () => void;
  gridState: { cols: number; rows: number };
  getCanvas: () => HTMLCanvasElement;
  applyTheme: TerminalApp["applyTheme"];
  ensureFont: () => Promise<void>;
  updateSize: TerminalApp["updateSize"];
  log: (line: string) => void;
  replaceCanvas: () => void;
  rebuildWebGPUShaderStages: (state: WebGPUState) => void;
  rebuildWebGLShaderStages: (state: WebGLState) => void;
  setShaderStagesDirty: (dirty: boolean) => void;
  clearWebGPUShaderStages: () => void;
  destroyWebGPUStageTargets: () => void;
  clearWebGLShaderStages: (state?: WebGLState) => void;
  destroyWebGLStageTargets: (state?: WebGLState) => void;
  markSearchDirty: () => void;
  handleSearchWasmReset: () => void;
};

export function createRuntimeAppApi(options: CreateRuntimeAppApiOptions): RuntimeAppApiRuntime {
  const {
    session,
    ptyTransport,
    inputHandler,
    ptyInputRuntime,
    interaction,
    lifecycleThemeSizeRuntime,
    cleanupFns,
    cleanupCanvasFns,
    callbacks,
    fpsEl,
    backendEl,
    inputDebugEl,
    imeInput,
    attachWindowEvents,
    isMacPlatform,
    textEncoder,
    readState,
    writeState,
    appendLog,
    shouldSuppressWasmLog,
    runBeforeInputHook,
    runBeforeRenderOutputHook,
    CURSOR_BLINK_MS,
    RESIZE_ACTIVE_MS,
    TARGET_RENDER_FPS,
    BACKGROUND_RENDER_FPS,
    KITTY_FLAG_REPORT_EVENTS,
    resizeState,
    tickWebGPU,
    tickWebGL,
    updateGrid,
    gridState,
    getCanvas,
    applyTheme,
    ensureFont,
    updateSize,
    log,
    replaceCanvas,
    getTransparentBackground,
    setTransparentBackgroundValue,
    rebuildWebGPUShaderStages,
    rebuildWebGLShaderStages,
    setShaderStagesDirty,
    clearWebGPUShaderStages,
    destroyWebGPUStageTargets,
    clearWebGLShaderStages,
    destroyWebGLStageTargets,
    markSearchDirty,
    handleSearchWasmReset,
  } = options;

  const internalState: RuntimeInternalState = {
    paused: false,
    backend: "none",
    preferredRenderer: options.initialPreferredRenderer,
    rafId: 0,
    frameCount: 0,
    lastFpsTime: performance.now(),
    nextBlinkTime: performance.now() + CURSOR_BLINK_MS,
  };
  const maxScrollbackBytes = resolveMaxScrollbackBytes(options);

  function updateFps() {
    internalState.frameCount += 1;
    const now = performance.now();
    if (now - internalState.lastFpsTime >= 500) {
      const fps = Math.round((internalState.frameCount * 1000) / (now - internalState.lastFpsTime));
      if (fpsEl) fpsEl.textContent = `${fps}`;
      callbacks?.onFps?.(fps);
      internalState.frameCount = 0;
      internalState.lastFpsTime = now;
    }
  }

  function canRenderFrame(shared: RuntimeAppApiSharedState): boolean {
    return Boolean(shared.wasmReady && shared.wasm && shared.wasmHandle);
  }

  function loop(state: WebGPUState | WebGLState) {
    if (!internalState.paused) {
      const now = performance.now();
      if (now >= internalState.nextBlinkTime) {
        internalState.nextBlinkTime = now + CURSOR_BLINK_MS;
        writeState({ needsRender: true });
      }
      const resizeActive = now - resizeState.lastAt <= RESIZE_ACTIVE_MS;
      if (resizeActive) {
        writeState({ needsRender: true });
      }
      const hidden =
        typeof document !== "undefined" &&
        typeof document.visibilityState === "string" &&
        document.visibilityState !== "visible";
      const targetRenderFps = hidden ? BACKGROUND_RENDER_FPS : TARGET_RENDER_FPS;
      const nextShared = readState();
      const renderBudget = resizeActive
        ? true
        : now - nextShared.lastRenderTime >= 1000 / targetRenderFps;
      if (nextShared.needsRender && renderBudget) {
        // Avoid presenting a cleared frame before the terminal core has a live handle.
        // Leaving needsRender=true retries immediately once startup finishes.
        if (canRenderFrame(nextShared)) {
          if (internalState.backend === "webgpu" && "device" in state) tickWebGPU(state);
          if (internalState.backend === "webgl2" && "gl" in state) tickWebGL(state);
          writeState({ lastRenderTime: now, needsRender: false });
          updateFps();
        }
      }
    }
    internalState.rafId = requestAnimationFrame(() => loop(state));
  }

  const onWasmLog = (text: string) => {
    if (shouldSuppressWasmLog(text)) return;
    console.log(`[wasm] ${text}`);
    appendLog(`[wasm] ${text}`);
  };
  if (session.addWasmLogListener) {
    session.addWasmLogListener(onWasmLog);
    cleanupFns.push(() => session.removeWasmLogListener?.(onWasmLog));
  }

  async function initWasm() {
    const shared = readState();
    if (shared.wasmReady && shared.wasm) return shared.wasm;
    const instance = await session.getWasm();
    writeState({
      wasm: instance,
      wasmExports: instance.exports,
      wasmReady: true,
    });
    return instance;
  }

  function writeToWasm(handle: number, text: string) {
    const shared = readState();
    if (!shared.wasm) return;
    shared.wasm.write(handle, text);
  }

  function flushWasmOutputToPty() {
    const shared = readState();
    if (!shared.wasm || !shared.wasmHandle) return;
    if (!ptyTransport.isConnected()) return;

    let iterations = 0;
    while (iterations < 32) {
      const out = shared.wasm.drainOutput(shared.wasmHandle);
      if (!out) break;
      ptyTransport.sendInput(out);
      iterations += 1;
    }
  }

  function sendInput(text: string, source = "program", config: { skipHooks?: boolean } = {}) {
    const shared = readState();
    if (!shared.wasmReady || !shared.wasm || !shared.wasmHandle) return;
    if (!text) return;
    let intercepted = text;
    if (!config.skipHooks) {
      intercepted =
        source === "pty"
          ? runBeforeRenderOutputHook(text, source)
          : runBeforeInputHook(text, source);
    }
    if (!intercepted) return;
    const normalized = source === "pty" ? intercepted : normalizeNewlines(intercepted);
    if (source === "key") {
      const bytes = textEncoder.encode(normalized);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
      const debugText = `${hex} (${bytes.length})`;
      if (inputDebugEl) inputDebugEl.textContent = debugText;
      callbacks?.onInputDebug?.(debugText);
    }
    if (source === "key") {
      let before = "";
      if (
        shared.wasmExports?.terminal_active_cursor_x &&
        shared.wasmExports?.terminal_active_cursor_y
      ) {
        const bx = shared.wasmExports.terminal_active_cursor_x(shared.wasmHandle);
        const by = shared.wasmExports.terminal_active_cursor_y(shared.wasmHandle);
        before = ` cursor=${bx},${by}`;
      }
      appendLog(`[key] ${JSON.stringify(normalized)}${before}`);
    }
    if (
      source === "key" &&
      (interaction.selectionState.active || interaction.selectionState.dragging)
    ) {
      interaction.clearSelection();
    }
    if (source === "pty" && interaction.linkState.hoverId) interaction.updateLinkHover(null);
    const canvas = getCanvas();
    shared.wasm.setPixelSize(shared.wasmHandle, canvas.width, canvas.height);
    writeToWasm(shared.wasmHandle, normalized);
    flushWasmOutputToPty();
    markSearchDirty();
    // Synchronized output: WASM terminal batches internally.
    // Always call renderUpdate — the WASM terminal decides whether to
    // render or wait for the sync-end. The auto-reset is a safety net
    // in case an app enables sync then crashes without disabling it.
    if (source === "pty" && inputHandler.isSynchronizedOutput?.()) {
      ptyInputRuntime.scheduleSyncOutputReset();
    } else {
      ptyInputRuntime.cancelSyncOutputReset();
    }
    shared.wasm.renderUpdate(shared.wasmHandle);
    if (
      source === "key" &&
      shared.wasmExports?.terminal_active_cursor_x &&
      shared.wasmExports?.terminal_active_cursor_y
    ) {
      const ax = shared.wasmExports.terminal_active_cursor_x(shared.wasmHandle);
      const ay = shared.wasmExports.terminal_active_cursor_y(shared.wasmHandle);
      appendLog(`[key] after cursor=${ax},${ay}`);
    }
    writeState({ needsRender: true });
  }

  async function copySelectionToClipboard() {
    const text = options.getSelectionText();
    if (!text) return false;
    const copied = await writeClipboardText(text);
    if (copied) {
      appendLog("[ui] selection copied");
      return true;
    }
    appendLog("[ui] copy failed");
    return false;
  }

  async function pasteFromClipboard() {
    const text = await readClipboardText();
    if (text === null) {
      appendLog("[ui] paste failed");
      return false;
    }
    if (text) {
      ptyInputRuntime.sendPasteText(text);
      return true;
    }
    return false;
  }

  function clearScreen() {
    sendInput("\x1b[2J\x1b[H");
  }

  if (attachWindowEvents) {
    const hasInputFocus = () => {
      if (typeof document === "undefined") return true;
      const active = document.activeElement;
      const canvas = getCanvas();
      return active === canvas || (imeInput ? active === imeInput : false);
    };
    const ensureImeInputFocus = () => {
      if (!imeInput || typeof document === "undefined") return;
      if (document.activeElement === imeInput) return;
      imeInput.readOnly = false;
      imeInput.focus({ preventScroll: true });
    };

    const isMacInputSourceShortcut = (event: KeyboardEvent) =>
      isMacPlatform &&
      event.ctrlKey &&
      !event.metaKey &&
      (event.code === "Space" || event.key === " " || event.key === "Spacebar");

    const shouldSkipKeyEvent = (event: KeyboardEvent) => {
      const imeActive =
        typeof document !== "undefined" && imeInput ? document.activeElement === imeInput : false;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        target !== imeInput &&
        ["BUTTON", "SELECT", "INPUT", "TEXTAREA"].includes(target.tagName)
      ) {
        return true;
      }
      if (target === imeInput) {
        if (interaction.imeState.composing || event.isComposing) return true;
        if (!event.ctrlKey && !event.metaKey && event.key.length === 1 && !event.repeat)
          return true;
      }
      if (
        imeInput &&
        imeActive &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1 &&
        !event.repeat &&
        !event.isComposing &&
        !interaction.imeState.composing
      ) {
        return true;
      }
      return false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Let the keybinding engine consume leader / sequence keys first.
      if (event.defaultPrevented) return
      if (isMacInputSourceShortcut(event)) {
        if (hasInputFocus()) ensureImeInputFocus();
        return;
      }
      if (shouldSkipKeyEvent(event)) return;
      if (!hasInputFocus()) return;
      ensureImeInputFocus();
      writeState({ isFocused: true });
      const shared = readState();
      if (!shared.wasmReady || !shared.wasmHandle) return;

      const key = event.key?.toLowerCase?.() ?? "";
      const hasPrimaryShortcutModifier = isMacPlatform ? event.metaKey : event.ctrlKey;
      const wantsCopy =
        hasPrimaryShortcutModifier &&
        !event.altKey &&
        (key === "c" || (event.shiftKey && key === "c"));
      const wantsPaste =
        hasPrimaryShortcutModifier &&
        !event.altKey &&
        (key === "v" || (event.shiftKey && key === "v"));

      if (wantsCopy && interaction.selectionState.active) {
        event.preventDefault();
        void copySelectionToClipboard();
        return;
      }
      if (wantsPaste) {
        if (imeInput) {
          ensureImeInputFocus();
          return;
        }
        event.preventDefault();
        const seq = inputHandler.encodeKeyEvent(event);
        if (seq) {
          ptyInputRuntime.sendKeyInput(seq);
        }
        return;
      }

      const seq = inputHandler.encodeKeyEvent(event);
      if (seq) {
        if (
          event.type === "keydown" &&
          ["Backspace", "Delete", "Del", "Enter"].includes(event.key)
        ) {
          writeState({
            lastKeydownSeq: seq,
            lastKeydownSeqAt: performance.now(),
          });
        }
        event.preventDefault();
        ptyInputRuntime.sendKeyInput(seq);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      // Let the keybinding engine consume leader / sequence keys first.
      if (event.defaultPrevented) return
      if (isMacInputSourceShortcut(event)) return;
      const shared = readState();
      if (!shared.wasm || !shared.wasmHandle) return;
      if ((shared.wasm.getKittyKeyboardFlags(shared.wasmHandle) & KITTY_FLAG_REPORT_EVENTS) === 0) {
        return;
      }
      if (shouldSkipKeyEvent(event)) return;
      if (!hasInputFocus()) return;
      writeState({ isFocused: true });
      const nextShared = readState();
      if (!nextShared.wasmReady || !nextShared.wasmHandle) return;

      const seq = inputHandler.encodeKeyEvent(event);
      if (seq) {
        event.preventDefault();
        ptyInputRuntime.sendKeyInput(seq);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    cleanupFns.push(() => window.removeEventListener("keydown", onKeyDown));
    cleanupFns.push(() => window.removeEventListener("keyup", onKeyUp));
  }

  async function initWasmHarness() {
    try {
      const instance = await initWasm();
      const shared = readState();
      if (shared.wasmHandle) {
        instance.destroy(shared.wasmHandle);
        writeState({ wasmHandle: 0 });
      }
      updateGrid();
      const cols = gridState.cols || 80;
      const rows = gridState.rows || 24;
      const wasmHandle = instance.create(cols, rows, maxScrollbackBytes);
      if (!wasmHandle) {
        throw new Error("terminal create failed (terminal_create returned 0)");
      }
      const canvas = getCanvas();
      instance.setPixelSize(wasmHandle, canvas.width, canvas.height);
      const activeTheme = lifecycleThemeSizeRuntime.getActiveTheme();
      if (activeTheme) {
        applyTheme(activeTheme, activeTheme.name ?? "cached theme");
      }
      instance.renderUpdate(wasmHandle);
      writeState({ wasmHandle, needsRender: true });
      handleSearchWasmReset();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`terminal error: ${message}`);
    }
  }

  /**
   * (Re-)create the renderer backend context. Unlike init(), this never
   * touches the wasm terminal handle or the PTY, so re-invoking it (e.g. for
   * a transparent-background toggle on WebGL2, where alpha is baked at
   * getContext time) preserves the screen and the running shell. The render
   * loop guards on wasm readiness, so it can start before the wasm promise
   * settles.
   */
  async function initBackend(): Promise<boolean> {
    const shared = readState();
    if (internalState.preferredRenderer !== "webgl2") {
      if (shared.currentContextType === "webgl2") {
        replaceCanvas();
      }
      const canvas = getCanvas();
      const gpuCore = await session.getWebGPUCore(canvas, getTransparentBackground());
      const gpuState = gpuCore
        ? await initWebGPU(canvas, {
            core: gpuCore,
            alphaMode: getTransparentBackground() ? "premultiplied" : "opaque",
          })
        : null;
      if (gpuState) {
        internalState.backend = "webgpu";
        writeState({
          activeState: gpuState,
          currentContextType: "webgpu",
          needsRender: true,
        });
        if (backendEl) backendEl.textContent = "webgpu";
        callbacks?.onBackend?.("webgpu");
        log("webgpu ready");
        clearWebGLShaderStages();
        destroyWebGLStageTargets();
        gpuState.context.configure({
          device: gpuState.device,
          format: gpuState.format,
          alphaMode: getTransparentBackground() ? "premultiplied" : "opaque",
        });
        rebuildWebGPUShaderStages(gpuState);
        setShaderStagesDirty(false);
        updateGrid();
        internalState.rafId = requestAnimationFrame(() => loop(gpuState));
        return true;
      }
    }

    if (internalState.preferredRenderer !== "webgpu") {
      const nextShared = readState();
      if (nextShared.currentContextType === "webgpu") {
        replaceCanvas();
      }
      const canvas = getCanvas();
      const glState = initWebGL(canvas, getTransparentBackground());
      if (glState) {
        internalState.backend = "webgl2";
        writeState({
          activeState: glState,
          currentContextType: "webgl2",
          needsRender: true,
        });
        if (backendEl) backendEl.textContent = "webgl2";
        callbacks?.onBackend?.("webgl2");
        log("webgl2 ready");
        clearWebGPUShaderStages();
        destroyWebGPUStageTargets();
        rebuildWebGLShaderStages(glState);
        setShaderStagesDirty(false);
        updateGrid();
        internalState.rafId = requestAnimationFrame(() => loop(glState));
        return true;
      }
    }

    return false;
  }

  async function init() {
    cancelAnimationFrame(internalState.rafId);
    updateSize();

    log("initializing...");
    await ensureFont();
    updateGrid();
    const wasmPromise = initWasmHarness();

    const started = await initBackend();
    if (!started) {
      internalState.backend = "none";
      if (backendEl) backendEl.textContent = "none";
      callbacks?.onBackend?.("none");
      log("no GPU backend available");
      writeState({ activeState: null });
    }
    await wasmPromise;
  }

  function destroy() {
    cancelAnimationFrame(internalState.rafId);
    lifecycleThemeSizeRuntime.cancelScheduledSizeUpdate();
    ptyInputRuntime.cancelSyncOutputReset();
    ptyInputRuntime.disconnectPty();
    ptyTransport.destroy?.();
    const shared = readState();
    if (shared.wasm && shared.wasmHandle) {
      try {
        shared.wasm.destroy(shared.wasmHandle);
      } catch {
        // ignore wasm destroy errors
      }
      writeState({ wasmHandle: 0 });
    }
    clearWebGPUShaderStages();
    destroyWebGPUStageTargets();
    const activeState = readState().activeState;
    if (activeState && "gl" in activeState) {
      clearWebGLShaderStages(activeState);
      destroyWebGLStageTargets(activeState);
    } else {
      clearWebGLShaderStages();
      destroyWebGLStageTargets();
    }
    for (const cleanup of cleanupCanvasFns) cleanup();
    cleanupCanvasFns.length = 0;
    for (const cleanup of cleanupFns) cleanup();
    cleanupFns.length = 0;
  }

  function setRenderer(value: "auto" | "webgpu" | "webgl2") {
    if (value !== "auto" && value !== "webgpu" && value !== "webgl2") return;
    internalState.preferredRenderer = value;
    void init();
  }

  function setTransparentBackground(value: boolean) {
    const next = Boolean(value);
    const shared = readState();
    if (!shared.activeState) {
      // Terminal is still initializing. The in-flight init() reads the current
      // value via the getter when it creates the context, so just record it;
      // re-initing here would race init() and spawn a second render loop.
      setTransparentBackgroundValue(next);
      return;
    }
    if (next === getTransparentBackground()) return;
    setTransparentBackgroundValue(next);
    // WebGPU canvas alpha mode is re-configurable live; WebGL2 needs a fresh
    // canvas/context (alpha is baked at getContext time), so swap the canvas
    // and re-create only the renderer backend. Either way the PTY/shell and
    // the screen stay intact.
    if ("device" in shared.activeState) {
      shared.activeState.context.configure({
        device: shared.activeState.device,
        format: shared.activeState.format,
        alphaMode: next ? "premultiplied" : "opaque",
      });
      writeState({ needsRender: true });
      return;
    }
    replaceCanvas();
    void (async () => {
      // If even the fresh context can't be created, fall back to the full init
      // path (which ends with the "no backend" state) instead of leaving the
      // stale state pointing at the detached canvas.
      if (!(await initBackend())) void init();
    })();
  }

  function setPaused(value: boolean) {
    internalState.paused = Boolean(value);
  }

  function togglePause() {
    internalState.paused = !internalState.paused;
  }

  function setMouseMode(value: MouseMode) {
    inputHandler.setMouseMode(value);
    ptyInputRuntime.updateMouseStatus();
  }

  function getMouseStatus() {
    return inputHandler.getMouseStatus();
  }

  function getScrollbackText(): string {
    const shared = readState();
    if (!shared.wasm || !shared.wasmHandle) return "";

    const wasm = shared.wasm;
    const handle = shared.wasmHandle;
    const ex = wasm.exports;
    const totalLines = ex.zemterm_scrollbar_total?.(handle) ?? 0;
    const visibleLines = ex.zemterm_scrollbar_len?.(handle) ?? 0;
    const savedOffset = ex.zemterm_scrollbar_offset?.(handle) ?? 0;
    const cols = ex.zemterm_render_cols?.(handle) ?? ex.zemterm_cols?.(handle) ?? 80;

    if (!totalLines && !visibleLines) return "";

    // Scroll to the top (Ghostty deltas are negative toward scrollback).
    wasm.scrollViewport(handle, -savedOffset);
    wasm.renderUpdate(handle);

    const lines: string[] = [];
    let remaining = totalLines + visibleLines;
    let safety = 0;

    while (remaining > 0 && safety < 10000) {
      safety++;
      const rs = wasm.getRenderState(handle);
      if (!rs || !rs.codepoints || !rs.rows) break;

      const viewRows = Math.min(rs.rows, remaining);
      for (let r = 0; r < viewRows; r++) {
        let line = "";
        for (let c = 0; c < cols; c++) {
          const cp = rs.codepoints[r * cols + c];
          if (cp === 0) break;
          if (cp >= 0x20 && cp !== 0x7f) {
            line += String.fromCodePoint(cp);
          }
        }
        lines.push(line.replace(/\s+$/, ""));
      }

      remaining -= viewRows;
      if (remaining <= 0) break;

      wasm.scrollViewport(handle, viewRows);
      wasm.renderUpdate(handle);
    }

    // Restore the viewport's original offset from the top.
    wasm.scrollViewport(handle, savedOffset);
    wasm.renderUpdate(handle);

    return lines.join("\n");
  }

  function scrollViewport(lines: number) {
    if (!Number.isFinite(lines)) return;
    // Reuse the interaction path so programmatic scrolling updates selection,
    // search, link hover, scrollbar activity, and rendering consistently with
    // wheel/native-scrollbar input.
    interaction.scrollViewportByLines(Math.trunc(lines));
  }

  function getCursorPosition(): { row: number; col: number } | null {
    const shared = readState();
    if (!shared.wasm || !shared.wasmHandle || !shared.wasmExports) return null;
    // Read the live active-screen cursor. The renderer intentionally caches a
    // position while blinking, so its cached value can lag behind the actual
    // terminal cursor used when Vim mode is entered.
    const getCol = shared.wasmExports.terminal_active_cursor_x ?? shared.wasmExports.zemterm_active_cursor_x;
    const getRow = shared.wasmExports.terminal_active_cursor_y ?? shared.wasmExports.zemterm_active_cursor_y;
    if (!getCol || !getRow) return null;
    const col = getCol(shared.wasmHandle);
    const row = getRow(shared.wasmHandle);
    if (Number.isFinite(col) && Number.isFinite(row)) return { row, col };

    // Some older WASM builds expose both names but only implement the zemterm
    // exports. Retry those explicitly if the preferred alias returned junk.
    const fallbackCol = shared.wasmExports.zemterm_active_cursor_x?.(shared.wasmHandle);
    const fallbackRow = shared.wasmExports.zemterm_active_cursor_y?.(shared.wasmHandle);
    if (fallbackCol === undefined || fallbackRow === undefined) return null;
    if (!Number.isFinite(fallbackCol) || !Number.isFinite(fallbackRow)) return null;
    return { row: fallbackRow, col: fallbackCol };
  }

  function getScrollbackInfo() {
    const shared = readState();
    if (!shared.wasm || !shared.wasmHandle || !shared.wasmExports) {
      return { totalLines: 0, viewportOffset: 0, viewportLen: 0 };
    }
    const ex = shared.wasmExports;
    return {
      totalLines: ex.zemterm_scrollbar_total?.(shared.wasmHandle) ?? 0,
      viewportOffset: ex.zemterm_scrollbar_offset?.(shared.wasmHandle) ?? 0,
      viewportLen: ex.zemterm_scrollbar_len?.(shared.wasmHandle) ?? 0,
    };
  }

  function setSelection(anchor: { row: number; col: number }, focus: { row: number; col: number }) {
    interaction.selectionState.active = true;
    interaction.selectionState.dragging = false;
    interaction.selectionState.anchor = anchor;
    interaction.selectionState.focus = focus;
    interaction.updateCanvasCursor();
    writeState({ needsRender: true });
  }

  function clearTermSelection() {
    interaction.clearSelection();
  }

  function getViewportText(): string[] {
    const shared = readState();
    if (!shared.wasm || !shared.wasmHandle) return [];
    const rs = shared.wasm.getRenderState(shared.wasmHandle);
    if (!rs || !rs.codepoints || !rs.rows || !rs.cols) return [];
    const lines: string[] = [];
    for (let r = 0; r < rs.rows; r++) {
      let line = '';
      for (let c = 0; c < rs.cols; c++) {
        const cp = rs.codepoints[r * rs.cols + c];
        // Preserve the terminal grid width. Vim horizontal motion must be
        // able to traverse empty cells after the last printed character.
        if (cp === 0 || cp < 0x20 || cp === 0x7f) line += ' ';
        else line += String.fromCodePoint(cp);
      }
      lines.push(line);
    }
    return lines;
  }

  function createPublicApi(publicApiOptions: RuntimePublicApiOptions): TerminalApp {
    ptyInputRuntime.setPtyStatus("disconnected");
    ptyInputRuntime.updateMouseStatus();

    return {
      init,
      destroy,
      setRenderer,
      setTransparentBackground,
      setPaused,
      togglePause,
      setFontSize: publicApiOptions.setFontSize,
      setLineHeight: publicApiOptions.setLineHeight,
      setLigatures: publicApiOptions.setLigatures,
      setFontHinting: publicApiOptions.setFontHinting,
      setFontHintTarget: publicApiOptions.setFontHintTarget,
      setFontSources: publicApiOptions.setFontSources,
      applyTheme,
      resetTheme: publicApiOptions.resetTheme,
      sendInput,
      sendKeyInput: ptyInputRuntime.sendKeyInput,
      clearScreen,
      connectPty: ptyInputRuntime.connectPty,
      disconnectPty: ptyInputRuntime.disconnectPty,
      isPtyConnected: () => ptyTransport.isConnected(),
      setMouseMode,
      getMouseStatus,
      getCursorPosition,
      copySelectionToClipboard,
      pasteFromClipboard,
      selectWordAtClientPoint: interaction.selectWordAtClientPoint,
      setSearchQuery: publicApiOptions.setSearchQuery,
      clearSearch: publicApiOptions.clearSearch,
      searchNext: publicApiOptions.searchNext,
      searchPrevious: publicApiOptions.searchPrevious,
      getSearchState: publicApiOptions.getSearchState,
      dumpAtlasForCodepoint: publicApiOptions.dumpAtlasForCodepoint,
      resize: publicApiOptions.resize,
      focus: publicApiOptions.focus,
      blur: publicApiOptions.blur,
      updateSize: publicApiOptions.updateSize,
      getBackend: () => internalState.backend,
      setShaderStages: publicApiOptions.setShaderStages,
      getShaderStages: publicApiOptions.getShaderStages,
      getScrollbackText,
      scrollViewport,
      getScrollbackInfo,
      setSelection,
      clearSelection: clearTermSelection,
      getSelectedText: options.getSelectionText,
      getViewportText,
    };
  }

  return {
    sendInput,
    createPublicApi,
  };
}
