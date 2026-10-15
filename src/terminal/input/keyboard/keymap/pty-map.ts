import { sequences } from "./constants";

type KittyKeySequence = {
  code: number;
  final: "u" | "~";
  modifiers: number;
  eventType: number;
  hasAlternates: boolean;
  hasAssociatedText: boolean;
};

function parseKittyKeySequence(seq: string): KittyKeySequence | null {
  const csi = "\x1b[";
  if (!seq.startsWith(csi)) return null;
  const final = seq.endsWith("u") ? "u" : seq.endsWith("~") ? "~" : null;
  if (!final) return null;

  const body = seq.slice(csi.length, -1);
  if (!body) return null;
  const parts = body.split(";");
  const keyPart = parts[0] ?? "";
  if (!keyPart) return null;

  const keyParts = keyPart.split(":");
  if (!keyParts.every((part) => /^[0-9]+$/.test(part))) return null;
  const code = Number(keyParts[0]);
  if (!Number.isFinite(code)) return null;

  let modifiers = 1;
  let eventType = 0;
  const modifierPart = parts[1] ?? "";
  if (modifierPart) {
    const [modifierText, eventTypeText = ""] = modifierPart.split(":");
    if (!modifierText || !/^[0-9]+$/.test(modifierText)) return null;
    modifiers = Number(modifierText);
    if (!Number.isFinite(modifiers)) return null;
    if (eventTypeText) {
      if (!/^[0-9]+$/.test(eventTypeText)) return null;
      eventType = Number(eventTypeText);
      if (!Number.isFinite(eventType)) return null;
    }
  }

  return {
    code,
    final,
    modifiers,
    eventType,
    hasAlternates: keyParts.length > 1,
    hasAssociatedText: parts.length > 2 && parts.slice(2).some((part) => part.length > 0),
  };
}

export function isKittyKeyboardSequence(seq: string): boolean {
  return parseKittyKeySequence(seq) !== null;
}

export function mapKeySequenceForPty(seq: string): string {
  const kitty = parseKittyKeySequence(seq);
  if (kitty) {
    if (kitty.eventType === 3) return seq;
    const legacyCompatible =
      kitty.modifiers === 1 && !kitty.hasAlternates && !kitty.hasAssociatedText;
    if (legacyCompatible) {
      if (kitty.final === "u") {
        if (kitty.code === 127) return "\x7f";
        if (kitty.code === 13) return "\r";
        if (kitty.code === 9) return "\t";
      }
      if (kitty.final === "~" && kitty.code === 3) return "\x1b[3~";
    }
    return seq;
  }
  if (seq === sequences.backspace || seq === "\x08" || seq === "\x08\x1b[P") return "\x7f";
  if (seq === sequences.delete || seq === "\x1b[P") return "\x1b[3~";
  if (seq === sequences.enter || seq === "\r\n") return "\r";
  return seq;
}
