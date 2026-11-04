// Plain-text helpers shared by the extractors.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.

/** A readable problem with one material. The message is shown to the student. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
// Control characters except tab (09), newline (0A) and carriage return (0D).
// Postgres text can't hold NUL at all, and the rest are noise in a prompt.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Normalizes extracted text so it is safe to store and pleasant to prompt
 * with: Unix newlines, no control characters or broken surrogates, no
 * trailing spaces, at most one blank line in a row.
 */
export function cleanText(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(LONE_SURROGATE, "�")
    .replace(/[ \t ]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Characters that carry content (ignores whitespace). */
export function visibleLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/** Decodes a UTF-8 text file (TXT, MD), dropping a byte-order mark. */
export function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decodes the XML/HTML entities that appear in Office XML and mammoth HTML. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Lowercased file extension without the dot, or "". */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toLowerCase() : "";
}
