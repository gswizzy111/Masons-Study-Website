// PDF text extraction with unpdf (a serverless build of PDF.js).
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import { extractText, getDocumentProxy, getResolvedPDFJS } from "unpdf";
import { cleanText, ExtractionError, visibleLength } from "./text";

/** Under this many characters per page on average, treat the PDF as scanned. */
export const SCANNED_CHARS_PER_PAGE = 100;
/** A page with an image and fewer characters than this is read as a picture. */
export const PICTURE_PAGE_MAX_CHARS = 100;
/** Images smaller than this (in pixels) are decoration: logos, bullets, icons. */
const MIN_PICTURE_PIXELS = 160 * 160;

export type PdfText = {
  /** Cleaned text with "Page N:" headers, empty pages skipped. */
  text: string;
  /** Cleaned text of each page (index 0 is page 1); "" for a page with none. */
  pages: string[];
  pageCount: number;
  /** Characters of real text per page, on average. */
  charsPerPage: number;
  /** True when there is too little text to be a text PDF (photos or scans). */
  looksScanned: boolean;
  /**
   * 1-based numbers of pages that are mostly a picture: a real image and
   * almost no text (a photographed page, a diagram-only slide). Their content
   * is not in `text`. Empty when the whole file looks scanned.
   */
  picturePages: number[];
};

/** Joins page texts with "Page N:" headers, skipping empty pages. */
export function joinPages(pages: readonly string[]): string {
  const parts: string[] = [];
  pages.forEach((text, i) => {
    if (visibleLength(text) > 0) parts.push(`Page ${i + 1}:\n${text}`);
  });
  return parts.join("\n\n");
}

type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

/** Pixel size of the image an operator paints, when the arguments say. */
function imagePixels(args: unknown): number | null {
  if (!Array.isArray(args)) return null;
  const [first, width, height] = args as unknown[];
  if (typeof width === "number" && typeof height === "number") return width * height;
  if (first && typeof first === "object") {
    const w = (first as { width?: unknown }).width;
    const h = (first as { height?: unknown }).height;
    if (typeof w === "number" && typeof h === "number") return w * h;
  }
  return null;
}

/**
 * Which of the given pages paint a real image. Reading a page's drawing
 * operations is cheap next to Claude, and only near-empty pages are checked.
 * A page that can't be inspected counts as no picture.
 */
async function pagesWithPictures(pdf: PdfDocument, candidates: number[]): Promise<number[]> {
  if (candidates.length === 0) return [];
  let imageOps: Set<number>;
  try {
    const { OPS } = await getResolvedPDFJS();
    imageOps = new Set(
      [
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObjectGroup,
        OPS.paintImageMaskXObject,
        OPS.paintImageMaskXObjectGroup,
        OPS.paintImageMaskXObjectRepeat,
      ].filter((op): op is number => typeof op === "number"),
    );
  } catch {
    return [];
  }
  const out: number[] = [];
  for (const pageNumber of candidates) {
    try {
      const page = await pdf.getPage(pageNumber);
      const ops = await page.getOperatorList();
      const hasPicture = ops.fnArray.some((fn, i) => {
        if (!imageOps.has(fn)) return false;
        const pixels = imagePixels(ops.argsArray[i]);
        return pixels === null || pixels >= MIN_PICTURE_PIXELS;
      });
      page.cleanup();
      if (hasPicture) out.push(pageNumber);
    } catch {
      // Unreadable drawing operations: treat the page as text only.
    }
  }
  return out;
}

function isPasswordError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  return name === "PasswordException" || (typeof message === "string" && /password/i.test(message));
}

/** Pulls the text layer out of a PDF, page by page, and finds picture pages. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  let rawPages: string[];
  let pageCount: number;
  let pdf: PdfDocument;
  try {
    // PDF.js may take ownership of the buffer it is given; hand it a copy so
    // the caller can still send the original bytes to Claude.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    const result = await extractText(pdf, { mergePages: false });
    rawPages = result.text;
    pageCount = result.totalPages;
  } catch (error) {
    if (isPasswordError(error)) {
      throw new ExtractionError("This PDF is password protected. Remove the password, then add it again.");
    }
    throw new ExtractionError("This PDF couldn't be opened. It may be damaged. Try saving it again and re-adding it.");
  }

  try {
    const pages = Array.from({ length: pageCount }, (_, i) => cleanText(rawPages[i] ?? ""));
    const lengths = pages.map(visibleLength);
    const visible = lengths.reduce((a, b) => a + b, 0);
    const charsPerPage = pageCount > 0 ? visible / pageCount : 0;
    const looksScanned = pageCount > 0 && charsPerPage < SCANNED_CHARS_PER_PAGE;

    // In a text PDF, near-empty pages that show an image are pictures whose
    // content the text layer doesn't have (diagram slides, photographed notes).
    const nearEmpty = looksScanned
      ? []
      : lengths.flatMap((length, i) => (length < PICTURE_PAGE_MAX_CHARS ? [i + 1] : []));
    const picturePages = await pagesWithPictures(pdf, nearEmpty);

    return { text: joinPages(pages), pages, pageCount, charsPerPage, looksScanned, picturePages };
  } finally {
    // Free PDF.js resources (the fake worker keeps the document otherwise).
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
