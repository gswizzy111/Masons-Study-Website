// DOCX text extraction with mammoth. Converts to simple HTML first so
// headings, lists and tables survive as Markdown-like text.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import mammoth from "mammoth";
import { cleanText, decodeEntities, ExtractionError } from "./text";

// Images are dropped (they would arrive as huge data URIs).
const DROP_IMAGES = mammoth.images.imgElement(async () => ({ src: "" }));

function inlineText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => (inner.trim() ? `**${inner}**` : inner))
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_m, _t, inner: string) => (inner.trim() ? `*${inner}*` : inner))
      .replace(/<sup>([\s\S]*?)<\/sup>/gi, "^$1")
      .replace(/<sub>([\s\S]*?)<\/sub>/gi, "_$1")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .trim();
}

function tableToText(tableHtml: string): string {
  const rows: string[][] = [];
  for (const row of tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map((cell) =>
      inlineText(cell.replace(/<\/p>\s*<p[^>]*>/gi, " ")).replace(/\n+/g, " ").replace(/\|/g, "/"),
    );
    if (cells.some((c) => c)) rows.push(cells);
  }
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  const out = [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)];
  return out.join("\n");
}

function listToText(listHtml: string, ordered: boolean): string {
  const items = listHtml.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
  return items
    .map((item, i) => {
      const text = inlineText(item.replace(/<\/p>\s*<p[^>]*>/gi, "\n"));
      if (!text) return "";
      // Continuation lines (and flattened nested lists) are indented under the item.
      const [first, ...rest] = text.split(/\n+/);
      return [`${ordered ? `${i + 1}.` : "-"} ${first}`, ...rest.map((line) => `  ${line}`)].join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

/** Converts mammoth's HTML into Markdown-like text. */
export function htmlToText(html: string): string {
  let body = html;
  // Tables and lists first, as whole blocks (mammoth does not nest tables in lists).
  body = body.replace(/<table[\s\S]*?<\/table>/gi, (t) => `\n\n${tableToText(t)}\n\n`);
  // Innermost lists first so nested lists flatten into their parent item.
  for (let pass = 0; pass < 5 && /<(ul|ol)[^>]*>/i.test(body); pass++) {
    body = body.replace(/<(ul|ol)[^>]*>((?:(?!<(?:ul|ol)[^>]*>)[\s\S])*?)<\/\1>/gi, (_m, tag: string, inner: string) => {
      return `\n\n${listToText(inner, tag.toLowerCase() === "ol")}\n\n`;
    });
  }
  body = body.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => {
    const text = inlineText(inner);
    return text ? `\n\n${"#".repeat(Math.min(Number(level), 4))} ${text}\n\n` : "";
  });
  body = body.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_m, inner: string) => `\n\n${inlineText(inner)}\n\n`);
  return cleanText(decodeEntities(body.replace(/<[^>]+>/g, "")));
}

/** Text of a Word document, with headings, lists and tables kept. */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
      { convertImage: DROP_IMAGES, ignoreEmptyParagraphs: true },
    );
    html = result.value;
  } catch {
    throw new ExtractionError(
      "This Word file couldn't be opened. It may be damaged or an older .doc file. Save it as .docx and add it again.",
    );
  }
  const text = htmlToText(html);
  if (text) return text;
  // Fall back to raw text in case the HTML route lost something.
  try {
    const raw = await mammoth.extractRawText({ buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
    return cleanText(raw.value);
  } catch {
    return "";
  }
}
