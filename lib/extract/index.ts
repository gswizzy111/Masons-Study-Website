// Turns one uploaded material into plain text for the study-set build.
// PDF (unpdf), DOCX (mammoth), PPTX (jszip), TXT/MD (UTF-8), and Claude
// vision for photos and scanned PDFs.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiNotConfiguredError, AiRefusalError } from "../ai/client";
import type { Material } from "../types";
import { pageList } from "../ai/prompts";
import { extractDocxText } from "./docx";
import { extractPdfText, joinPages } from "./pdf";
import { extractPptxText } from "./pptx";
import { cleanText, decodeUtf8, extensionOf, ExtractionError, visibleLength } from "./text";
import { NoTextError, transcribeImage, transcribePdf, type TranscribeOptions } from "./vision";

export { ExtractionError } from "./text";

/** The storage bucket for uploads. */
export const MATERIALS_BUCKET = "materials";

/** A mostly-scanned PDF falls back to its text layer when it has at least this much. */
const MIN_FALLBACK_CHARS = 200;

export type FileKind = "pdf" | "docx" | "pptx" | "text" | "image";

export type ExtractableMaterial = Pick<
  Material,
  "id" | "kind" | "file_name" | "mime_type" | "storage_path" | "content_text"
>;

export type ExtractResult = {
  text: string;
  /** How the text was read. */
  method: "text" | "pdf" | "docx" | "pptx" | "vision";
  /**
   * Something the student should know although the file was read: pages that
   * are pictures and couldn't be read, or a long file only partly read.
   */
  warning?: string;
};

/** Who a material must belong to: the job's user and set. */
export type MaterialOwner = { userId: string; setId: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_ONLY = new RegExp(`^${UUID}$`);

/**
 * True when `path` is an upload of this user's set, in exactly the shape
 * components/sets/upload-material.ts writes: `<user_id>/<set_id>/<uuid>-<safe
 * name>`. The file name part only allows [A-Za-z0-9._-], so "..", "?", "#",
 * "%", "/" and backslashes can never reach the Storage URL the service-role
 * client builds. The database enforces the same shape
 * (materials_storage_path_owned).
 */
export function isOwnStoragePath(path: string, owner: MaterialOwner): boolean {
  if (!UUID_ONLY.test(owner.userId) || !UUID_ONLY.test(owner.setId)) return false;
  return new RegExp(`^${owner.userId}/${owner.setId}/${UUID}-[A-Za-z0-9._-]{1,100}$`).test(path);
}

const CUT_WARNING = "This file is long, so only the first part was read. Split it into smaller files to include the rest.";

function picturePagesWarning(pages: number[], reason: string): string {
  const which = pages.length === 1 ? `Page ${pages[0]} is a picture` : `Pages ${pageList(pages)} are pictures`;
  return `${which} and couldn't be read (${reason}), so ${pages.length === 1 ? "it was" : "they were"} left out.`;
}

/** Why picture pages couldn't be transcribed, in a few words. */
function pictureFailureReason(error: unknown): string {
  if (error instanceof AiNotConfiguredError) return "reading pictures needs Claude";
  if (error instanceof AiRefusalError) return "Claude declined";
  if (error instanceof ExtractionError) return "the file is too large for Claude";
  return "Claude couldn't be reached";
}

/** Splits a transcription with "Page N:" headers into page number -> text. */
export function splitTranscribedPages(text: string): Map<number, string> {
  const out = new Map<number, string>();
  const header = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?Page (\d{1,4})(?:\*\*)?:(?:\*\*)?/gim;
  const marks: Array<{ page: number; start: number; end: number }> = [];
  for (let m = header.exec(text); m; m = header.exec(text)) {
    marks.push({ page: Number(m[1]), start: m.index, end: m.index + m[0].length });
  }
  marks.forEach((mark, i) => {
    const body = cleanText(text.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : text.length));
    if (body) out.set(mark.page, out.has(mark.page) ? `${out.get(mark.page)}\n\n${body}` : body);
  });
  return out;
}

const KIND_BY_EXT: Record<string, FileKind> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  txt: "text",
  md: "text",
  markdown: "text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  heic: "image",
  heif: "image",
};

const KIND_BY_MIME: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "text",
  "text/markdown": "text",
  "text/x-markdown": "text",
};

/** Which extractor handles a file, by extension first, then MIME type. */
export function fileKindOf(fileName: string, mimeType?: string | null): FileKind | null {
  const byExt = KIND_BY_EXT[extensionOf(fileName)];
  if (byExt) return byExt;
  const mime = (mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (KIND_BY_MIME[mime]) return KIND_BY_MIME[mime];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return null;
}

function requireText(text: string, emptyMessage: string): string {
  if (visibleLength(text) === 0) throw new ExtractionError(emptyMessage);
  return text;
}

/**
 * A typed PDF with some picture pages: Claude reads just those pages and
 * their text replaces the (near-empty) text layer of those pages. If that
 * fails, the text layer is kept and the result carries a warning. An abort
 * (the job's deadline) is passed on.
 */
async function readPicturePages(
  bytes: Uint8Array,
  fileName: string,
  pdf: Awaited<ReturnType<typeof extractPdfText>>,
  opts: TranscribeOptions,
): Promise<ExtractResult> {
  const pictures = pdf.picturePages;
  try {
    const read = await transcribePdf(bytes, fileName, pdf.pageCount, { ...opts, pages: pictures });
    const byPage = splitTranscribedPages(read.text);
    const pages = [...pdf.pages];
    let placed = 0;
    for (const n of pictures) {
      const text = byPage.get(n);
      if (text) {
        pages[n - 1] = text;
        placed++;
      }
    }
    // Claude didn't label the pages: keep its text after the typed pages.
    const loose = placed === 0 ? cleanText(read.text) : "";
    const text = loose
      ? `${joinPages(pages)}\n\nPictures on page${pictures.length === 1 ? "" : "s"} ${pageList(pictures)}:\n${loose}`
      : joinPages(pages);
    return { method: "pdf", text, ...(read.cutOff ? { warning: CUT_WARNING } : {}) };
  } catch (error) {
    if (error instanceof NoTextError) return { method: "pdf", text: pdf.text };
    if (isAbortError(error)) throw error;
    if (!(error instanceof ExtractionError || error instanceof AiNotConfiguredError || error instanceof AiRefusalError)) {
      console.error(`[extract] picture pages of ${fileName}`, error);
    }
    return { method: "pdf", text: pdf.text, warning: picturePagesWarning(pictures, pictureFailureReason(error)) };
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "APIUserAbortError" || name === "TimeoutError";
}

/** Extracts text from file bytes. Used by extractMaterial and by tests. */
export async function extractFromBytes(
  bytes: Uint8Array,
  file: { fileName: string; mimeType?: string | null },
  opts: TranscribeOptions = {},
): Promise<ExtractResult> {
  const kind = fileKindOf(file.fileName, file.mimeType);
  switch (kind) {
    case "text":
      return {
        method: "text",
        text: requireText(cleanText(decodeUtf8(bytes)), "This file is empty."),
      };
    case "docx":
      return {
        method: "docx",
        text: requireText(
          await extractDocxText(bytes),
          "No text was found in this Word file. If it only holds pictures, export it as PDF and add that instead.",
        ),
      };
    case "pptx":
      return {
        method: "pptx",
        text: requireText(
          await extractPptxText(bytes),
          "No text was found on these slides. If they're pictures, export the deck as PDF and add that instead.",
        ),
      };
    case "pdf": {
      const pdf = await extractPdfText(bytes);
      if (pdf.pageCount === 0) throw new ExtractionError("This PDF has no pages.");
      if (!pdf.looksScanned) {
        if (pdf.picturePages.length > 0) return readPicturePages(bytes, file.fileName, pdf, opts);
        return { method: "pdf", text: pdf.text };
      }
      try {
        const read = await transcribePdf(bytes, file.fileName, pdf.pageCount, opts);
        return { method: "vision", text: read.text, ...(read.cutOff ? { warning: CUT_WARNING } : {}) };
      } catch (error) {
        // Mostly pictures, but when Claude can't read it (too big, declined,
        // not connected) a real text layer beats nothing. Passing errors
        // (rate limits, timeouts) still fail so a rebuild tries again.
        const permanent =
          error instanceof ExtractionError || error instanceof AiNotConfiguredError || error instanceof AiRefusalError;
        if (permanent && visibleLength(pdf.text) >= MIN_FALLBACK_CHARS) {
          return {
            method: "pdf",
            text: pdf.text,
            warning: "Most pages of this PDF are pictures and couldn't be read, so only its typed text was used.",
          };
        }
        throw error;
      }
    }
    case "image": {
      const read = await transcribeImage(bytes, file.fileName, opts);
      return { method: "vision", text: read.text, ...(read.cutOff ? { warning: CUT_WARNING } : {}) };
    }
    default:
      throw new ExtractionError(
        "This file type can't be read. Use PDF, Word (.docx), PowerPoint (.pptx), text, Markdown, or a photo.",
      );
  }
}

/** Downloads a material's file from Storage (the path is already checked). */
async function download(admin: SupabaseClient, path: string): Promise<Uint8Array> {
  // Encoded segment by segment as a second guard: nothing in the path can
  // change which URL storage-js requests.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const { data, error } = await admin.storage.from(MATERIALS_BUCKET).download(encoded);
  if (error || !data) {
    throw new ExtractionError("This file couldn't be found in storage. Remove it and add it again.");
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * The text of one material. Pasted notes are cleaned and returned; files are
 * downloaded with the service-role client and read by type. Only files under
 * the job's own user and set folder are ever downloaded. Throws
 * ExtractionError with a readable message, or a Claude error from vision.
 */
export async function extractMaterial(
  admin: SupabaseClient,
  material: ExtractableMaterial,
  owner: MaterialOwner,
  opts: TranscribeOptions = {},
): Promise<ExtractResult> {
  if (material.kind === "text") {
    return {
      method: "text",
      text: requireText(cleanText(material.content_text ?? ""), "This note is empty. Add some text, then try again."),
    };
  }
  if (!material.storage_path) {
    throw new ExtractionError("This file was never uploaded. Remove it and add it again.");
  }
  if (!isOwnStoragePath(material.storage_path, owner)) {
    throw new ExtractionError("This file isn't stored where uploads go. Remove it and add it again.");
  }
  const bytes = await download(admin, material.storage_path);
  if (bytes.byteLength === 0) throw new ExtractionError("This file is empty.");
  return extractFromBytes(bytes, { fileName: material.file_name, mimeType: material.mime_type }, opts);
}
