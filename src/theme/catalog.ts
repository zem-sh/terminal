import { parseGhosttyTheme, type GhosttyTheme } from "./ghostty";
import {
  BUILTIN_THEME_NAMES,
  BUILTIN_THEME_SOURCES,
  type BuiltinThemeName,
} from "./builtin-themes";

const parsedThemeCache = new Map<BuiltinThemeName, GhosttyTheme>();

/** String literal union of all builtin theme names. */
export type TerminalBuiltinThemeName = BuiltinThemeName;

/** Return an array of all builtin theme names. */
export function listBuiltinThemeNames(): TerminalBuiltinThemeName[] {
  return [...BUILTIN_THEME_NAMES];
}

/** Check if a string is a valid builtin theme name. */
export function isBuiltinThemeName(name: string): name is TerminalBuiltinThemeName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_THEME_SOURCES, name);
}

/** Get the raw source text for a builtin theme by name. */
export function getBuiltinThemeSource(name: string): string | null {
  if (!isBuiltinThemeName(name)) return null;
  return BUILTIN_THEME_SOURCES[name];
}

/** Get the parsed theme object for a builtin theme by name (cached). */
export function getBuiltinTheme(name: string): GhosttyTheme | null {
  if (!isBuiltinThemeName(name)) return null;
  const cached = parsedThemeCache.get(name);
  if (cached) return cached;

  const parsed = parseGhosttyTheme(BUILTIN_THEME_SOURCES[name]);
  if (!parsed.name) parsed.name = name;
  parsedThemeCache.set(name, parsed);
  return parsed;
}
