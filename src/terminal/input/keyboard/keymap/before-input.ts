import { sequences } from "./constants";

export function encodeBeforeInputEvent(event: InputEvent): string {
  if (!event) return "";
  const type = event.inputType;
  if (type === "insertText") return event.data || "";
  if (type === "insertLineBreak" || type === "insertParagraph") return sequences.enter;
  if (
    type === "deleteContentBackward" ||
    type === "deleteWordBackward" ||
    type === "deleteSoftLineBackward" ||
    type === "deleteHardLineBackward" ||
    type === "deleteEntireSoftLine"
  ) {
    return sequences.backspace;
  }
  if (
    type === "deleteContentForward" ||
    type === "deleteWordForward" ||
    type === "deleteSoftLineForward" ||
    type === "deleteHardLineForward"
  ) {
    return sequences.delete;
  }
  if (type === "insertFromPaste") {
    return event.dataTransfer?.getData("text/plain") || "";
  }
  return "";
}
