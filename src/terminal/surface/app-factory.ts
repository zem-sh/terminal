import type { TerminalApp, TerminalAppOptions } from "../runtime/types";
import { createTerminalApp as createTerminalAppImpl } from "../runtime/create-runtime";

/** Internal app-construction boundary used by the public Terminal surface. */
export function createTerminalApp(options: TerminalAppOptions): TerminalApp {
  return createTerminalAppImpl(options);
}
