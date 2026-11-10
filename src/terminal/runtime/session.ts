import { initWebGPUCore, type WebGPUCoreState } from "../renderer";
import { loadTerminalWasm, type TerminalWasm } from "../wasm";
import { createTerminalFontResourceStore } from "./font-resource-store";
import type { TerminalAppSession, TerminalWasmLogListener } from "./types";

export type CreateTerminalAppSessionOptions = {
  /** URL of the `terminal.wasm` asset; defaults to the bundled package asset. */
  wasmUrl?: string;
};

/**
 * Create a new app session that lazily loads the WASM module and
 * initializes the WebGPU core on first use. Multiple panes can
 * share a single session to avoid duplicate resource loading.
 */
export function createTerminalAppSession(
  options: CreateTerminalAppSessionOptions = {},
): TerminalAppSession {
  let wasmPromise: Promise<TerminalWasm> | null = null;
  let webgpuCorePromise: Promise<WebGPUCoreState | null> | null = null;
  const wasmLogListeners = new Set<TerminalWasmLogListener>();
  const fontResourceStore = createTerminalFontResourceStore();

  const forwardWasmLog = (message: string) => {
    for (const listener of wasmLogListeners) {
      listener(message);
    }
  };

  return {
    getWasm: () => {
      if (!wasmPromise) {
        wasmPromise = loadTerminalWasm({ log: forwardWasmLog, wasmUrl: options.wasmUrl });
      }
      return wasmPromise;
    },
    getWebGPUCore: (canvas: HTMLCanvasElement, transparentBackground?: boolean) => {
      if (!webgpuCorePromise) {
        webgpuCorePromise = initWebGPUCore(
          canvas,
          transparentBackground ? "premultiplied" : "opaque",
        );
      }
      return webgpuCorePromise;
    },
    getFontResourceStore: () => fontResourceStore,
    addWasmLogListener: (listener: TerminalWasmLogListener) => {
      wasmLogListeners.add(listener);
    },
    removeWasmLogListener: (listener: TerminalWasmLogListener) => {
      wasmLogListeners.delete(listener);
    },
  };
}

let defaultTerminalAppSession: TerminalAppSession | null = null;

/** Return the global default session, creating it on first call. */
export function getDefaultTerminalAppSession(): TerminalAppSession {
  if (!defaultTerminalAppSession) {
    defaultTerminalAppSession = createTerminalAppSession();
  }
  return defaultTerminalAppSession;
}

/**
 * Start loading (and compiling) the terminal WASM core for a session ahead of
 * the first pane. Idempotent — the session caches its in-flight load.
 */
export function prewarmTerminalCore(session?: TerminalAppSession): Promise<TerminalWasm> {
  return (session ?? getDefaultTerminalAppSession()).getWasm();
}
