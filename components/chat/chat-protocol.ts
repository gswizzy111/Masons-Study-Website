// The /api/chat stream format, shared by the route (server) and the chat
// store (browser). No dependencies, so both sides can import it.
//
// The response body is plain UTF-8 text: Claude's answer as it is written.
// When something has to be said about the answer as a whole (Claude declined,
// or the call failed), the stream ends with a control record:
//
//   <answer text so far>\u001e<kind>\n<friendly message>
//
// \u001e (ASCII record separator) never appears in answer text; the route
// strips it from Claude's output.

/** Starts the control record at the end of a chat stream. */
export const CHAT_CONTROL = "\u001e";

/** Header set to "1" when the set's material was cut to fit the prompt. */
export const CONTEXT_TRUNCATED_HEADER = "X-Context-Truncated";

/** Longest question, in characters (the route enforces it too). */
export const CHAT_MESSAGE_MAX = 8000;

export type ChatControlKind = "refusal" | "error";

export type ChatControl = { kind: ChatControlKind; message: string };

/** Appended to an answer that was stopped early (saved and shown the same way). */
export const STOPPED_NOTE = "\n\n*Answer stopped here.*";

/** Appended to an answer that was cut short, by reason. */
export const CUT_NOTES = {
  max_tokens: "\n\n*This answer hit the length limit. Ask me to continue.*",
  timeout: "\n\n*This answer hit the time limit. Ask me to continue.*",
  error: "\n\n*This answer was cut off by an error. Ask me to continue.*",
} as const;

/** The control record for `kind`, ready to append to the stream. */
export function formatChatControl(kind: ChatControlKind, message: string): string {
  return `${CHAT_CONTROL}${kind}\n${message.replaceAll(CHAT_CONTROL, "")}`;
}

/** Splits a (possibly partial) chat stream into answer text and control record. */
export function splitChatStream(raw: string): { text: string; control: ChatControl | null } {
  const at = raw.indexOf(CHAT_CONTROL);
  if (at === -1) return { text: raw, control: null };
  const text = raw.slice(0, at);
  const rest = raw.slice(at + 1);
  const newline = rest.indexOf("\n");
  // The record can arrive in pieces; until its kind is complete, ignore it.
  if (newline === -1) return { text, control: null };
  const kind = rest.slice(0, newline);
  const message = rest.slice(newline + 1).trim();
  if (kind !== "refusal" && kind !== "error") return { text, control: null };
  return { text, control: { kind, message } };
}
