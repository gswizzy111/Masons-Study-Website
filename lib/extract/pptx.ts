// PPTX text extraction with jszip: slide text (<a:t> runs) and speaker notes
// in slide order, each under a "Slide N:" header.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import JSZip from "jszip";
import { cleanText, decodeEntities, ExtractionError } from "./text";

type Rel = { id: string; type: string; target: string };

function parseRels(xml: string): Rel[] {
  const rels: Rel[] = [];
  for (const tag of xml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = /\bId="([^"]*)"/.exec(tag)?.[1];
    const type = /\bType="([^"]*)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1];
    if (id && type && target) rels.push({ id, type, target: decodeEntities(target) });
  }
  return rels;
}

/** Resolves a relationship target against the folder of the part that owns it. */
function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const piece of target.split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  return `${partPath.slice(0, slash)}/_rels/${partPath.slice(slash + 1)}.rels`;
}

/** Paragraph text from DrawingML: runs joined, one line per <a:p>. */
function paragraphsOf(xml: string): string[] {
  const out: string[] = [];
  for (const para of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) ?? []) {
    let line = "";
    const pieces = para.match(/<a:t\b[^>]*>[\s\S]*?<\/a:t>|<a:t\b[^>]*\/>|<a:br\b[^>]*\/?>|<a:tab\b[^>]*\/?>/g) ?? [];
    for (const piece of pieces) {
      if (piece.startsWith("<a:br")) line += "\n";
      else if (piece.startsWith("<a:tab")) line += "\t";
      else {
        const inner = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/.exec(piece)?.[1] ?? "";
        line += decodeEntities(inner);
      }
    }
    const indent = /<a:pPr\b[^>]*\blvl="(\d)"/.exec(para)?.[1];
    const bullet = indent && Number(indent) > 0 ? "  ".repeat(Number(indent)) : "";
    if (line.trim()) out.push(bullet + line.trim());
  }
  return out;
}

/** Shapes in a notes slide, minus the slide image, number, header and footer placeholders. */
function notesText(xml: string): string {
  const shapes = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? [];
  const kept = shapes.filter((shape) => !/<p:ph\b[^>]*\btype="(sldImg|sldNum|hdr|ftr|dt)"/.test(shape));
  return cleanText(kept.flatMap(paragraphsOf).join("\n"));
}

function slideNumberFromPath(path: string): number {
  return Number(/slide(\d+)\.xml$/.exec(path)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

/** Slide part paths in presentation order (falls back to file-name order). */
async function orderedSlides(zip: JSZip): Promise<string[]> {
  const all = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumberFromPath(a) - slideNumberFromPath(b));

  const presentation = await zip.file("ppt/presentation.xml")?.async("string");
  const presRels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("string");
  if (!presentation || !presRels) return all;

  const relById = new Map(parseRels(presRels).map((r) => [r.id, r]));
  const ordered: string[] = [];
  const idList = /<p:sldIdLst\b[\s\S]*?<\/p:sldIdLst>/.exec(presentation)?.[0] ?? "";
  for (const tag of idList.match(/<p:sldId\b[^>]*>/g) ?? []) {
    const rid = /\br:id="([^"]*)"/.exec(tag)?.[1];
    const rel = rid ? relById.get(rid) : undefined;
    if (!rel) continue;
    const path = resolvePart("ppt", rel.target);
    if (zip.file(path) && !ordered.includes(path)) ordered.push(path);
  }
  // Keep any slide the list missed (shouldn't happen, but never drop content).
  for (const path of all) if (!ordered.includes(path)) ordered.push(path);
  return ordered;
}

/** Text of a PowerPoint deck: each slide's text, then its speaker notes. */
export async function extractPptxText(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ExtractionError(
      "These slides couldn't be opened. They may be damaged or an older .ppt file. Save as .pptx and add them again.",
    );
  }

  const slides = await orderedSlides(zip);
  if (slides.length === 0) {
    throw new ExtractionError("No slides were found in this file. Save it as .pptx or PDF and add it again.");
  }

  const blocks: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const path = slides[i];
    const xml = (await zip.file(path)?.async("string")) ?? "";
    const text = cleanText(paragraphsOf(xml).join("\n"));

    let notes = "";
    const relsXml = await zip.file(relsPathFor(path))?.async("string");
    if (relsXml) {
      const notesRel = parseRels(relsXml).find((r) => /\/notesSlide$/.test(r.type));
      if (notesRel) {
        const notesXml = await zip.file(resolvePart("ppt/slides", notesRel.target))?.async("string");
        if (notesXml) notes = notesText(notesXml);
      }
    }

    if (!text && !notes) continue;
    const parts = [`Slide ${i + 1}:`];
    if (text) parts.push(text);
    if (notes) parts.push(`Speaker notes:\n${notes}`);
    blocks.push(parts.join("\n"));
  }

  return cleanText(blocks.join("\n\n"));
}
