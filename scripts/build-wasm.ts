// Builds the terminal wasm core and regenerates src/terminal/wasm/embedded.ts.
//
// REPRODUCIBILITY
// --------------
// The wasm binary is built from three inputs, all of which are pinned so the
// exact same file can be reproduced on any machine:
//
//   1. Zig compiler  — version is pinned in wasm/.zig-version. The script
//      prefers a zvm-managed zig of that version and fails if the `zig` on
//      PATH does not match.
//   2. Ghostty core  — the submodule at reference/ghostty is pinned to a
//      commit by this repo's gitlink. The script additionally enforces
//      that the submodule working tree is exactly HEAD plus
//      wasm/patches/ghostty-zem.patch (it auto-applies the patch to a
//      pristine checkout, or verifies a dirty tree matches it byte-for-byte).
//   3. Optimize mode — default "ReleaseSafe", overridable via
//      TERMINAL_WASM_OPTIMIZE; the used value is embedded for provenance.
//
// Provenance metadata (ghostty commit, patch sha256, zig version, optimize
// mode, wasm size and sha256) is embedded into embedded.ts so a shipped
// binary can always be traced back to the exact inputs that produced it.
//
// To reproduce the same wasm on a fresh machine:
//   git clone <repo> --recursive
//   zvm i 0.15.2            # if the pinned zig is not installed yet
//   pnpm build:wasm         # applies the patch, builds, embeds, prints sha256
//
// A successful build leaves the ghostty submodule patched (dirty); that is
// expected. `git -C reference/ghostty checkout -- .` restores it to pristine
// (the next build re-applies the patch automatically).

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const wasmDir = resolve(root, "wasm");
const ghosttyDir = resolve(root, "reference/ghostty");
const builtWasmPath = resolve(wasmDir, "zig-out/bin/terminal.wasm");
const embeddedWasmPath = resolve(root, "src/terminal/wasm/embedded.ts");
const patchPath = resolve(wasmDir, "patches/ghostty-zem.patch");
const zigVersionPath = resolve(wasmDir, ".zig-version");
const wasmOptimizeMode = process.env.TERMINAL_WASM_OPTIMIZE?.trim() || "ReleaseSafe";

const REQUIRED_ZIG_VERSION = (await readFile(zigVersionPath, "utf-8")).trim();

/** Run a shell command, returning trimmed stdout. */
function sh(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

/** Run a zig command, preferring the zvm-managed zig of the pinned version. */
function runZig(args: string[]): string {
  return sh(`zvm use ${REQUIRED_ZIG_VERSION} >/dev/null 2>&1; zig ${args.join(" ")}`, wasmDir);
}

// ── 1. Zig compiler pin ────────────────────────────────────────────────────
let zigActual = "";
try {
  zigActual = runZig(["version"]);
} catch {
  // zig (or zvm) not on PATH — fall through to the friendly error below.
}
if (zigActual !== REQUIRED_ZIG_VERSION) {
  console.error(
    `Reproducible build requires zig ${REQUIRED_ZIG_VERSION} but found ${zigActual || "(none)"}. ` +
    `Install it with: zvm i ${REQUIRED_ZIG_VERSION}`,
  );
  process.exit(1);
}
console.log(`Using zig ${zigActual} (pinned in wasm/.zig-version)`);

// ── 2. Ghostty commit + patch reconciliation ───────────────────────────────
// This repo pins the submodule commit via its gitlink; drift would make the
// build non-reproducible (and the patch would not apply).
const repoRoot = sh("git rev-parse --show-toplevel", root);
const pinnedGhosttyCommit = sh("git ls-tree HEAD reference/ghostty", repoRoot).split(/\s+/)[2] ?? "";
const ghosttyCommit = sh("git rev-parse HEAD", ghosttyDir);
if (ghosttyCommit !== pinnedGhosttyCommit) {
  console.error(
    `ghostty submodule is at ${ghosttyCommit} but the repo pins ${pinnedGhosttyCommit}. ` +
    `Check out the pinned commit: git -C reference/ghostty checkout ${pinnedGhosttyCommit}`,
  );
  process.exit(1);
}

const workingDiff = sh("git diff HEAD", ghosttyDir);
const patchContent = (await readFile(patchPath, "utf-8")).trim();

if (workingDiff === patchContent) {
  console.log(`ghostty @ ${ghosttyCommit} — working tree matches wasm/patches/ghostty-zem.patch`);
} else if (workingDiff === "") {
  console.log(`ghostty @ ${ghosttyCommit} — pristine, applying wasm/patches/ghostty-zem.patch`);
  try {
    sh(`git apply "${patchPath}"`, ghosttyDir);
  } catch {
    console.error(`Failed to apply ${patchPath}. The patch targets commit ${ghosttyCommit}; ` +
      "the submodule may have drifted.");
    process.exit(1);
  }
} else {
  console.error("ghostty working tree is neither pristine nor matching wasm/patches/ghostty-zem.patch.");
  console.error("Reset it (git -C reference/ghostty checkout -- .), or refresh the patch");
  console.error("(git -C reference/ghostty diff HEAD > wasm/patches/ghostty-zem.patch) and rebuild.");
  process.exit(1);
}

// ── 3. Build ───────────────────────────────────────────────────────────────
console.log("Building wasm module...");
sh(
  `zvm use ${REQUIRED_ZIG_VERSION} >/dev/null 2>&1; ` +
    `zig build -Dtarget=wasm32-freestanding -Doptimize=${wasmOptimizeMode}`,
  wasmDir,
);

// ── 4. Embed provenance + binary ───────────────────────────────────────────
console.log("Regenerating src/terminal/wasm/embedded.ts...");

const ghosttyZon = await readFile(resolve(ghosttyDir, "build.zig.zon"), "utf-8");
const ghosttyVersion = ghosttyZon.match(/\.version\s*=\s*"([^"]+)"/)?.[1] ?? "unknown";
const patchSha256 = createHash("sha256").update(patchContent).digest("hex");

const bytes = await readFile(builtWasmPath);
const wasmSha256 = createHash("sha256").update(bytes).digest("hex");
const b64 = Buffer.from(bytes).toString("base64");
const wrapped = b64.match(/.{1,120}/g)?.join("\n") ?? b64;

const content =
  "// Auto-generated by build:wasm script. Do not edit by hand.\n" +
  "// Source: wasm/zig-out/bin/terminal.wasm\n" +
  `// Zig: ${zigActual} (pinned in wasm/.zig-version)\n` +
  `// Ghostty: ${ghosttyVersion} @ ${ghosttyCommit} + wasm/patches/ghostty-zem.patch\n` +
  `// Optimize mode: ${wasmOptimizeMode}\n` +
  `// WASM sha256: ${wasmSha256}\n` +
  `export const WASM_BASE64: string = \`\n${wrapped}\n\`;\n` +
  `export const GHOSTTY_VERSION: string = "${ghosttyVersion}";\n` +
  `export const GHOSTTY_COMMIT: string = "${ghosttyCommit}";\n` +
  `export const GHOSTTY_PATCH_SHA256: string = "${patchSha256}";\n` +
  `export const ZIG_VERSION: string = "${zigActual}";\n` +
  `export const TERMINAL_WASM_OPTIMIZE: string = "${wasmOptimizeMode}";\n` +
  `export const TERMINAL_WASM_SIZE: number = ${bytes.length};\n` +
  `export const TERMINAL_WASM_SHA256: string = "${wasmSha256}";\n`;
await writeFile(embeddedWasmPath, content, "utf-8");

console.log("\nWASM build and embed refresh complete.");
console.log("── reproducible build summary ───────────────────────────────");
console.log(`  zig:            ${zigActual} (wasm/.zig-version)`);
console.log(`  ghostty:        ${ghosttyVersion} @ ${ghosttyCommit}`);
console.log(`  ghostty patch:  ${patchPath} (sha256 ${patchSha256.slice(0, 12)}…)`);
console.log(`  optimize:       ${wasmOptimizeMode}`);
console.log(`  wasm:           ${bytes.length} bytes, sha256 ${wasmSha256}`);
console.log("──────────────────────────────────────────────────────────────");
