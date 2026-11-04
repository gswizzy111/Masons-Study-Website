// Claude vision transcription for photos of notes and scanned PDFs.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import type Anthropic from "@anthropic-ai/sdk";
import { assertNotRefused, FALLBACK_BETA, getAnthropic, MODEL, textOf } from "../ai/client";
import { NO_TEXT_SENTINEL, TRANSCRIBE_SYSTEM_PROMPT, transcribeInstruction } from "../ai/prompts";
import { cleanText, ExtractionError } from "./text";

/** Claude's limit for one image. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/**
 * Largest scanned PDF sent to Claude. Base64 grows the file by a third and a
 * request may be at most 32 MB, so 23 MB is the most that reliably fits.
 */
export const PDF_VISION_MAX_BYTES = 23 * 1024 * 1024;
/** Most pages of a scanned PDF transcribed in one go. */
export const PDF_VISION_MAX_PAGES = 100;

const IMAGE_MAX_TOKENS = 16_000;
const PDF_MAX_TOKENS = 32_000;
const CUT_NOTE =
  "\n\n[The transcription stopped here because the file is long. Split it into smaller files to include the rest.]";

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** The real image type from the file's first bytes (browsers and names can lie). */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | "heic" | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(bytes, 8, 12))) {
    return "heic";
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

async function transcribe(
  source: Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock,
  instruction: string,
  maxTokens: number,
): Promise<string> {
  const client = getAnthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    // Reading text off a page needs perception more than deep reasoning.
    output_config: { effort: "low" },
    system: TRANSCRIBE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: [source, { type: "text", text: instruction }] }],
  });
  const message = await stream.finalMessage();
  assertNotRefused(message);

  const text = cleanText(textOf(message));
  if (!text || text === NO_TEXT_SENTINEL || text.startsWith(`${NO_TEXT_SENTINEL}\n`)) {
    throw new ExtractionError("No readable notes or diagrams were found in this file.");
  }
  return message.stop_reason === "max_tokens" ? text + CUT_NOTE : text;
}

/** Transcribes a photo or screenshot of study material. */
export async function transcribeImage(bytes: Uint8Array, fileName: string): Promise<string> {
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ExtractionError(
      "This image is over 5 MB, which is too large for Claude to read. Take a smaller photo or shrink it, then add it again.",
    );
  }
  const type = sniffImageType(bytes);
  if (type === "heic") {
    throw new ExtractionError("HEIC photos can't be read yet. Save it as JPG or PNG, then add it again.");
  }
  if (!type) {
    throw new ExtractionError("This image couldn't be read. Use a JPG, PNG, WebP or GIF file.");
  }
  return transcribe(
    { type: "image", source: { type: "base64", media_type: type, data: toBase64(bytes) } },
    transcribeInstruction("image", fileName),
    IMAGE_MAX_TOKENS,
  );
}

/** Transcribes a scanned PDF (pages that are pictures, not text). */
export async function transcribePdf(bytes: Uint8Array, fileName: string, pageCount: number): Promise<string> {
  if (bytes.byteLength > PDF_VISION_MAX_BYTES) {
    throw new ExtractionError(
      "This PDF looks scanned (its pages are pictures), and it's too large for Claude to read in one go. Split it into files under 23 MB, then add them again.",
    );
  }
  if (pageCount > PDF_VISION_MAX_PAGES) {
    throw new ExtractionError(
      `This PDF looks scanned (its pages are pictures) and has ${pageCount} pages. Split it into files of ${PDF_VISION_MAX_PAGES} pages or fewer, then add them again.`,
    );
  }
  return transcribe(
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) } },
    transcribeInstruction("pdf", fileName),
    PDF_MAX_TOKENS,
  );
}
