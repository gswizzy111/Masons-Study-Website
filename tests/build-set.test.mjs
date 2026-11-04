import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { buildDoneMessage } = await load("lib/ai/build-set.ts");
const { sanitizeTopics } = await load("lib/ai/set-context.ts");
const { pageList } = await load("lib/ai/prompts.ts");

const base = {
  total: 4,
  readyCount: 4,
  newCards: 12,
  failedNew: [],
  failedKept: [],
  cardSaveFailures: 0,
  filesFailed: 0,
  fileWarnings: [],
  truncated: false,
};

test("done message counts written sections after a failure", () => {
  assert.equal(buildDoneMessage(base), "Built 4 topics and 12 new flashcards.");
  const msg = buildDoneMessage({ ...base, readyCount: 3, failedKept: ["Glycolysis"] });
  assert.match(msg, /^Wrote 3 of 4 topics and 12 new flashcards\./);
  assert.match(msg, /"Glycolysis" couldn't be rewritten, so it keeps its previous text\./);
  assert.doesNotMatch(msg, /—/);
});

test("topics users write directly are capped and clipped", () => {
  const topics = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, title: "X".repeat(3000), summary: "Y".repeat(3000) }));
  const clean = sanitizeTopics(topics);
  assert.equal(clean.length, 12);
  assert.ok(clean.every((t) => t.title.length <= 200 && t.summary.length <= 600));
  assert.deepEqual(sanitizeTopics([{ id: "t1", title: "A" }, { id: "t1", title: "B" }, { id: 5, title: "C" }, null]), [
    { id: "t1", title: "A", summary: "" },
  ]);
  assert.deepEqual(sanitizeTopics("nope"), []);
});

test("page lists read naturally", () => {
  assert.equal(pageList([2]), "2");
  assert.equal(pageList([5, 2]), "2 and 5");
  assert.equal(pageList([1, 2, 3, 4, 9]), "1 to 4 and 9");
  assert.equal(pageList([1, 2, 7]), "1, 2 and 7");
});
