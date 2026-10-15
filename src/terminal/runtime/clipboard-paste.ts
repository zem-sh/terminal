export type TerminalPastePayload = {
  kind: "text";
  text: string;
};

export function readPastePayloadFromDataTransfer(
  dataTransfer: DataTransfer | null | undefined,
): TerminalPastePayload | null {
  if (!dataTransfer) return null;
  const text = dataTransfer.getData("text/plain") || "";
  return text
    ? {
        kind: "text",
        text,
      }
    : null;
}
