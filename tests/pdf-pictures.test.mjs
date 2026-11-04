import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { load } from "./helpers.mjs";

const { extractPdfText } = await load("lib/extract/pdf.ts");
const { extractFromBytes } = await load("lib/extract/index.ts");

// Page 1 and 4: typed text. Page 2: a picture of notes under a short heading.
// Page 3: a title page with no picture.
const bytes = new Uint8Array(await readFile(new URL("./fixtures/mixed-picture-page.pdf", import.meta.url)));

test("finds picture pages in a typed PDF, not title pages", async () => {
  const pdf = await extractPdfText(bytes);
  assert.equal(pdf.pageCount, 4);
  assert.equal(pdf.looksScanned, false);
  assert.deepEqual(pdf.picturePages, [2]);
  assert.equal(pdf.pages.length, 4);
});

test("without Claude, the typed text is kept and the picture page is named", async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await extractFromBytes(bytes, { fileName: "mixed.pdf" });
    assert.equal(result.method, "pdf");
    assert.match(result.text, /MIXED-TEXT/);
    assert.match(result.warning ?? "", /^Page 2 is a picture and couldn't be read/);
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  }
});
