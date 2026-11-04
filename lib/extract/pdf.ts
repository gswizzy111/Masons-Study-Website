// PDF text extraction with unpdf (a serverless build of PDF.js).
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import { extractText, getDocumentProxy } from "unpdf";
import { cleanText, ExtractionError, visibleLength } from "./text";

/** Under this many characters per page on average, treat the PDF as scanned. */
export const SCANNED_CHARS_PER_PAGE = 100;

export type PdfText = {
  /** Cleaned text with "Page N:" headers, empty pages skipped. */
  text: string;
  pageCount: number;
  /** Characters of real text per page, on average. */
  charsPerPage: number;
  /** True when there is too little text to be a text PDF (photos or scans). */
  looksScanned: boolean;
};

function isPasswordError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  return name === "PasswordException" || (typeof message === "string" && /password/i.test(message));
}

/** Pulls the text layer out of a PDF, page by page. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  let pages: string[];
  let pageCount: number;
  try {
    // PDF.js may take ownership of the buffer it is given; hand it a copy so
    // the caller can still send the original bytes to Claude.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    pages = result.text;
    pageCount = result.totalPages;
    // Free PDF.js resources (the fake worker keeps the document otherwise).
    await pdf.loadingTask.destroy().catch(() => undefined);
  } catch (error) {
    if (isPasswordError(error)) {
      throw new ExtractionError("This PDF is password protected. Remove the password, then add it again.");
    }
    throw new ExtractionError("This PDF couldn't be opened. It may be damaged. Try saving it again and re-adding it.");
  }

  const parts: string[] = [];
  let visible = 0;
  pages.forEach((raw, i) => {
    const text = cleanText(raw ?? "");
    const length = visibleLength(text);
    visible += length;
    if (length > 0) parts.push(`Page ${i + 1}:\n${text}`);
  });

  const charsPerPage = pageCount > 0 ? visible / pageCount : 0;
  return {
    text: parts.join("\n\n"),
    pageCount,
    charsPerPage,
    looksScanned: pageCount > 0 && charsPerPage < SCANNED_CHARS_PER_PAGE,
  };
}
