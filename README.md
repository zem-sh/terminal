# @zem-sh/terminal

Terminal emulator core for the browser: the [Ghostty](https://github.com/ghostty-org/ghostty) VT engine compiled to WebAssembly, a WebGPU/WebGL2 cell renderer, ligature-aware text shaping, a Ghostty theme catalog and a font-fallback store.

It is the core used by [zem](https://github.com/zem-sh)'s terminal pane, published on its own so any web app can embed it.

## Install

```sh
npm install @zem-sh/terminal
# or
pnpm add @zem-sh/terminal
```

The package ships TypeScript source (`src/`), not a pre-bundled artifact, so it needs a toolchain that compiles `.ts` from `node_modules` — [Vite](https://vite.dev), esbuild, webpack + ts-loader, and so on.

Runtime requirements are a browser with WebGPU (WebGL2 is used as a fallback) and WASM support. The WASM core is embedded in `src/terminal/wasm/embedded.ts` as base64, so there is no separate asset to host or fetch.

## Quick start

```ts
import {
  Terminal,
  createWebSocketPtyTransport,
  FONT_URL_JETBRAINS_MONO,
  FONT_URL_NERD_SYMBOLS,
  getBuiltinTheme,
} from '@zem-sh/terminal'

// Any element with a size — the terminal fills it and resizes with it.
const root = document.querySelector<HTMLElement>('#terminal')!

const terminal = new Terminal({
  root,
  fontSources: [
    { type: 'url', label: 'JetBrains Mono', url: FONT_URL_JETBRAINS_MONO },
    { type: 'url', label: 'Nerd Symbols', url: FONT_URL_NERD_SYMBOLS },
  ],
  appOptions: {
    // Bring your own PTY endpoint; the transport speaks the zem PTY
    // WebSocket protocol (see src/terminal/pty).
    ptyTransport: createWebSocketPtyTransport(),
    callbacks: {
      onPtyError: (message) => console.error('[terminal]', message),
    },
  },
})

const theme = getBuiltinTheme('Catppuccin Mocha')
if (theme) terminal.applyTheme(theme, 'Catppuccin Mocha')

terminal.connectPty('ws://localhost:8080/pty', process.cwd?.())
```

`Terminal` initialises itself right after construction (`autoInit` defaults to `true`); pass `autoInit: false` and call `await terminal.init()` yourself if you need to control timing.

## API surface

`Terminal` exposes one object per terminal instance:

- **Session** — `init()`, `connectPty()`, `disconnectPty()`, `isPtyConnected()`, `sendInput()`, `sendKeyInput()`, `clearScreen()`
- **Rendering** — `setRenderer()` (`auto` / `webgpu` / `webgl2`), `setPaused()`, `togglePause()`, `setTransparentBackground()`
- **Typography** — `setFontSize()`, `setLineHeight()`, `setLigatures()`, `setFontHinting()`, `setFontHintTarget()`, `setFontSources()`
- **Theming** — `applyTheme()`, `resetTheme()`
- **Selection & clipboard** — `copySelectionToClipboard()`, `pasteFromClipboard()`, `selectWordAtClientPoint()`
- **Search** — `setSearchQuery()`, `searchNext()`, `searchPrev()`, `clearSearch()`
- **Panes** — `getSurface()`, `getActivePane()`, `getFocusedPane()`, `panes()`, `pane(id)`, `forEachPane()`

Supporting exports: `createWebSocketPtyTransport`, the `FONT_URL_*` bundled font URLs, the `parseGhosttyTheme` / `listBuiltinThemeNames` / `getBuiltinTheme` theme helpers, `shaderStagesForPreset` / `shaderStagesForPresets` and the `createDemoController` demo driver.

## Fonts

Nine fonts are bundled under `fonts/` (JetBrains Mono faces, Symbols Nerd Font, Noto Sans Symbols 2, Symbola, Noto Sans Canadian Aboriginal, OpenMoji) and exposed through the `FONT_URL_*` constants. They are lazy-loaded and cached in IndexedDB by the font store; pass additional `type: 'local'` or `type: 'buffer'` sources to fill glyph gaps from system fonts or in-memory data.

## Playing with the renderer

`src/demos.ts` provides `createDemoController` and the `DemoKind` union, which drive the same canned terminal sessions (scrollback, images, ligatures, Kitty graphics, …) the pane uses in its settings preview. `shaderStagesForPreset` supplies the optional post-processing stages.

## Building the WASM core

The compiled core is committed (`src/terminal/wasm/embedded.ts`), so normal `npm install` consumers never need a Zig toolchain. Rebuilding it is only necessary when changing the Zig side (`wasm/`).

```sh
git clone --recursive https://github.com/zem-sh/terminal.git
cd terminal
zvm i 0.15.2        # the pinned zig, see wasm/.zig-version
pnpm install
pnpm build:wasm     # applies wasm/patches/ghostty-zem.patch, builds, embeds
```

The build is reproducible from three pinned inputs — the Zig version, the `reference/ghostty` submodule commit, and the patch — and embeds their provenance (upstream commit, patch SHA-256, WASM size and SHA-256) into `embedded.ts` alongside the binary.

`pnpm build:themes` regenerates the builtin theme catalog from `assets/themes/`.

## Development

```sh
pnpm install
pnpm typecheck
```

## License

[MIT](./LICENSE) © zem-sh
