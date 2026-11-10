/**
 * URL of the standalone terminal WASM asset, emitted next to the bundle by the
 * consuming bundler (`new URL(..., import.meta.url)` is understood by Vite and
 * most other modern bundlers). Kept in its own module so applications can pass
 * an explicit `wasmUrl` when they copy the asset themselves.
 */
export const TERMINAL_WASM_URL = new URL(
  "../../../assets/terminal.wasm",
  import.meta.url,
).href;
