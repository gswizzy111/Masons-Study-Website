// Which files a study set accepts, and how they are described. Pure helpers,
// safe on the server and the client.
import type { Material } from "@/lib/types";

/** 50 MB, the storage bucket's limit per file. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Longest pasted note we store in one go. Longer notes should be a file. */
export const MAX_NOTES_CHARS = 500_000;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const ACCEPTED_EXTENSIONS = Object.keys(MIME_BY_EXT);

/** For <input accept>: extensions plus their MIME types. */
export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_EXTENSIONS.map((e) => `.${e}`),
  ...new Set(Object.values(MIME_BY_EXT)),
].join(",");

/** Why a common file type can't be used, and what to do instead. */
const REJECT_REASONS: Record<string, string> = {
  ppt: "Save .ppt files as .pptx, then add them again.",
  pps: "Save the slideshow as .pptx, then add it again.",
  ppsx: "Save the slideshow as .pptx, then add it again.",
  key: "Export Keynote files as .pptx or PDF first.",
  doc: "Save .doc files as .docx, then add them again.",
  rtf: "Save it as .docx or .txt first.",
  odt: "Save it as .docx or PDF first.",
  odp: "Save it as .pptx or PDF first.",
  pages: "Export Pages files as .docx or PDF first.",
  heic: "Save HEIC photos as JPG or PNG first.",
  heif: "Save HEIF photos as JPG or PNG first.",
  tif: "Save it as PNG or JPG first.",
  tiff: "Save it as PNG or JPG first.",
  svg: "Save it as PNG or JPG first.",
  xls: "Spreadsheets aren't supported. Export the sheet as PDF first.",
  xlsx: "Spreadsheets aren't supported. Export the sheet as PDF first.",
  csv: "Spreadsheets aren't supported. Export the sheet as PDF first.",
  zip: "Unzip it and add the files inside.",
  mp4: "Videos aren't supported. Upload the slides or notes instead.",
  mov: "Videos aren't supported. Upload the slides or notes instead.",
  mp3: "Audio isn't supported. Upload the slides or notes instead.",
  m4a: "Audio isn't supported. Upload the slides or notes instead.",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

/** The MIME type to store for an accepted file (by extension, since browsers often leave it blank). */
export function mimeTypeFor(file: Pick<File, "name" | "type">): string {
  return MIME_BY_EXT[extensionOf(file.name)] ?? (file.type || "application/octet-stream");
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** null when the file can be added, else a short reason it can't. */
export function rejectReason(file: Pick<File, "name" | "size">): string | null {
  const ext = extensionOf(file.name);
  if (!ext || !(ext in MIME_BY_EXT)) {
    return (
      REJECT_REASONS[ext] ??
      "This file type isn't supported. Use PDF, DOCX, PPTX, TXT, MD, or an image (PNG, JPG, WEBP, GIF)."
    );
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) {
    return `This file is ${formatBytes(file.size)}. The limit is 50 MB per file. Split it into smaller files.`;
  }
  return null;
}

export type MaterialType = "pdf" | "word" | "slides" | "text" | "image" | "notes" | "other";

export function materialType(m: Pick<Material, "kind" | "file_name" | "mime_type">): MaterialType {
  if (m.kind === "text") return "notes";
  const ext = extensionOf(m.file_name);
  if (ext === "pdf" || m.mime_type === "application/pdf") return "pdf";
  if (ext === "docx") return "word";
  if (ext === "pptx") return "slides";
  if (ext === "txt" || ext === "md") return "text";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext) || m.mime_type?.startsWith("image/")) {
    return "image";
  }
  return "other";
}

export const MATERIAL_TYPE_LABEL: Record<MaterialType, string> = {
  pdf: "PDF",
  word: "Word",
  slides: "Slides",
  text: "Text",
  image: "Image",
  notes: "Pasted notes",
  other: "File",
};
