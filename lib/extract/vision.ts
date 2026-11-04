// Claude vision transcription for photos of notes and scanned PDFs.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import Anthropic from "@anthropic-ai/sdk";
import { assertNotRefused, FALLBACK_BETA, getAnthropic, MODEL, textOf } from "../ai/client";
import { NO_TEXT_SENTINEL, TRANSCRIBE_SYSTEM_PROMPT, transcribeInstruction } from "../ai/prompts";
import { runPool } from "../ai/schemas";
import { cleanText, ExtractionError } from "./text";

/** Claude's limit for one image. */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/**
 * Largest image file sent as is. The 5 MB limit applies to the base64 data,
 * which is a third bigger than the file, so bigger files are shrunk first.
 */
export const IMAGE_SEND_MAX_BYTES = Math.floor((IMAGE_MAX_BYTES * 3) / 4);
/** Claude rejects images with a side longer than this. */
export const IMAGE_MAX_SIDE = 8000;
/** Long edge of a shrunk image: plenty for handwriting, far under the limits. */
const IMAGE_SHRINK_SIDE = 2400;
/**
 * Largest scanned PDF sent to Claude. Base64 grows the file by a third and a
 * request may be at most 32 MB, so 23 MB is the most that reliably fits.
 */
export const PDF_VISION_MAX_BYTES = 23 * 1024 * 1024;
/** Most pages of a scanned PDF transcribed for one file. */
export const PDF_VISION_MAX_PAGES = 100;
/** Pages transcribed per call, so a long scan isn't cut off at the output limit. */
export const PDF_PAGES_PER_CALL = 25;
/** Parts of one long scan transcribed at the same time. */
const PDF_PART_CONCURRENCY = 2;

const IMAGE_MAX_TOKENS = 16_000;
const PDF_MAX_TOKENS = 32_000;
export const CUT_NOTE =
  "\n\n[The transcription stopped here because the file is long. Split it into smaller files to include the rest.]";

type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export type TranscribeOptions = {
  /** Aborts the Claude call (the job's hard deadline). */
  signal?: AbortSignal;
};

export type Transcription = {
  text: string;
  /** True when Claude ran out of room and the end of the file is missing. */
  cutOff: boolean;
};

/** Claude found nothing to read (a blank page, a photo with no notes). */
export class NoTextError extends ExtractionError {
  constructor(message = "No readable notes or diagrams were found in this file.") {
    super(message);
    this.name = "NoTextError";
  }
}

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

// ---------------------------------------------------------------------------
// Shrinking big photos (sharp, when the runtime has it)
// ---------------------------------------------------------------------------

type SharpModule = (typeof import("sharp"))["default"];
let sharpModule: Promise<SharpModule | null> | null = null;

/**
 * sharp ships with Next.js (image optimization) but is optional: where it
 * can't load, big photos get the "too large" message instead.
 */
function loadSharp(): Promise<SharpModule | null> {
  sharpModule ??= import("sharp")
    .then((m) => (typeof m.default === "function" ? m.default : null))
    .catch(() => null);
  return sharpModule;
}

/**
 * A photo Claude can take: under the size and side limits, turned upright
 * (phone photos store their rotation separately). Returns the original when
 * it already fits, or null when it is too big and can't be shrunk here.
 */
async function fitImage(
  bytes: Uint8Array,
  type: ImageMediaType,
): Promise<{ bytes: Uint8Array; type: ImageMediaType } | null> {
  const sharp = await loadSharp();
  if (!sharp) return bytes.byteLength <= IMAGE_SEND_MAX_BYTES ? { bytes, type } : null;
  try {
    const meta = await sharp(bytes, { failOn: "none" }).metadata();
    const side = Math.max(meta.width ?? 0, meta.height ?? 0);
    const rotated = typeof meta.orientation === "number" && meta.orientation > 1;
    if (bytes.byteLength <= IMAGE_SEND_MAX_BYTES && side <= IMAGE_MAX_SIDE && !rotated) return { bytes, type };
    for (const [edge, quality] of [
      [IMAGE_SHRINK_SIDE, 85],
      [IMAGE_SHRINK_SIDE, 70],
      [1800, 70],
    ] as const) {
      const out = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      if (out.byteLength <= IMAGE_SEND_MAX_BYTES) return { bytes: new Uint8Array(out), type: "image/jpeg" };
    }
    return null;
  } catch {
    return bytes.byteLength <= IMAGE_SEND_MAX_BYTES ? { bytes, type } : null;
  }
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

type Source = Anthropic.Beta.BetaImageBlockParam | Anthropic.Beta.BetaRequestDocumentBlock;

async function transcribe(
  source: Source,
  instruction: string,
  maxTokens: number,
  opts: TranscribeOptions & { onStarted?: () => void; badRequest: string },
): Promise<Transcription> {
  const client = getAnthropic();
  let message: Anthropic.Beta.BetaMessage;
  try {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        // Reading text off a page needs perception more than deep reasoning.
        output_config: { effort: "low" },
        system: TRANSCRIBE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: [source, { type: "text", text: instruction }] }],
      },
      { signal: opts.signal },
    );
    if (opts.onStarted) {
      let started = false;
      stream.on("streamEvent", (event) => {
        if (!started && event.type === "content_block_start") {
          started = true;
          opts.onStarted?.();
        }
      });
    }
    message = await stream.finalMessage();
  } catch (error) {
    // A file Claude can't take (too big, too many pixels, unreadable) is a
    // problem with the file, not a reason to retry the whole build.
    if (error instanceof Anthropic.BadRequestError) throw new ExtractionError(opts.badRequest);
    throw error;
  }
  assertNotRefused(message);

  const text = cleanText(textOf(message));
  if (!text || text === NO_TEXT_SENTINEL || text.startsWith(`${NO_TEXT_SENTINEL}\n`)) throw new NoTextError();
  const cutOff = message.stop_reason === "max_tokens";
  return { text: cutOff ? text + CUT_NOTE : text, cutOff };
}

/** Transcribes a photo or screenshot of study material. */
export async function transcribeImage(
  bytes: Uint8Array,
  fileName: string,
  opts: TranscribeOptions = {},
): Promise<Transcription> {
  const type = sniffImageType(bytes);
  if (type === "heic") {
    throw new ExtractionError("HEIC photos can't be read yet. Save it as JPG or PNG, then add it again.");
  }
  if (!type) {
    throw new ExtractionError("This image couldn't be read. Use a JPG, PNG, WebP or GIF file.");
  }
  const image = await fitImage(bytes, type);
  if (!image) {
    throw new ExtractionError(
      "This image is too large for Claude to read. Take a smaller photo or shrink it, then add it again.",
    );
  }
  return transcribe(
    { type: "image", source: { type: "base64", media_type: image.type, data: toBase64(image.bytes) } },
    transcribeInstruction("image", fileName),
    IMAGE_MAX_TOKENS,
    { ...opts, badRequest: "Claude couldn't read this image. Try a smaller or clearer photo." },
  );
}

export type TranscribePdfOptions = TranscribeOptions & {
  /** Only these 1-based pages (the picture pages of a typed PDF). */
  pages?: readonly number[];
};

/**
 * Transcribes a scanned PDF (pages that are pictures, not text), or just the
 * given pages of one. Long files are read in parts of PDF_PAGES_PER_CALL
 * pages, so the output limit doesn't cut them short; the file is cached so
 * the later parts don't pay for it again. Parts that come back empty are
 * skipped; the result is empty only when every part was.
 */
export async function transcribePdf(
  bytes: Uint8Array,
  fileName: string,
  pageCount: number,
  opts: TranscribePdfOptions = {},
): Promise<Transcription> {
  if (bytes.byteLength > PDF_VISION_MAX_BYTES) {
    throw new ExtractionError(
      opts.pages
        ? "Some pages of this PDF are pictures, and the file is too large for Claude to read them. Split it into files under 23 MB, then add them again."
        : "This PDF looks scanned (its pages are pictures), and it's too large for Claude to read in one go. Split it into files under 23 MB, then add them again.",
    );
  }
  if (pageCount > PDF_VISION_MAX_PAGES) {
    throw new ExtractionError(
      opts.pages
        ? `Some pages of this PDF are pictures, and it has ${pageCount} pages, too many for Claude to read. Split it into files of ${PDF_VISION_MAX_PAGES} pages or fewer, then add them again.`
        : `This PDF looks scanned (its pages are pictures) and has ${pageCount} pages. Split it into files of ${PDF_VISION_MAX_PAGES} pages or fewer, then add them again.`,
    );
  }

  const wanted = opts.pages
    ? [...new Set(opts.pages)].filter((n) => Number.isInteger(n) && n >= 1 && n <= pageCount).sort((a, b) => a - b)
    : null;
  if (wanted && wanted.length === 0) throw new NoTextError();
  const document: Anthropic.Beta.BetaRequestDocumentBlock = {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) },
  };
  const badRequest = "Claude couldn't read this PDF. Try saving it again, or split it into smaller files.";

  // A short scan in one call, as before.
  const all = wanted ?? Array.from({ length: pageCount }, (_, i) => i + 1);
  if (!wanted && pageCount <= PDF_PAGES_PER_CALL) {
    return transcribe(document, transcribeInstruction("pdf", fileName), PDF_MAX_TOKENS, { ...opts, badRequest });
  }

  const parts: number[][] = [];
  for (let i = 0; i < all.length; i += PDF_PAGES_PER_CALL) parts.push(all.slice(i, i + PDF_PAGES_PER_CALL));
  // Several parts share the file through the prompt cache; one part needn't pay to write it.
  const source: Anthropic.Beta.BetaRequestDocumentBlock =
    parts.length > 1 ? { ...document, cache_control: { type: "ephemeral" } } : document;
  const results: Array<Transcription | null> = parts.map(() => null);
  await runPool(parts, PDF_PART_CONCURRENCY, async (numbers, index, started) => {
    try {
      results[index] = await transcribe(
        source,
        transcribeInstruction("pdf", fileName, { numbers, why: wanted ? "pictures" : "part" }),
        PDF_MAX_TOKENS,
        { ...opts, badRequest, onStarted: started },
      );
    } catch (error) {
      if (!(error instanceof NoTextError)) throw error;
    }
  });
  const done = results.filter((r): r is Transcription => r !== null);
  if (done.length === 0) throw new NoTextError();
  return { text: done.map((r) => r.text).join("\n\n"), cutOff: done.some((r) => r.cutOff) };
}
