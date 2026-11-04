import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const { normalizeQuestions, placeAnswer } = await load("lib/ai/schemas.ts");
const { guideHeadings } = await load("lib/ai/exam-questions.ts");

const question = (i) => ({
  topic_id: "t1",
  stem: `Question ${i}`,
  choices: [`right ${i}`, `wrong a ${i}`, `wrong b ${i}`, `wrong c ${i}`],
  answer_index: 0,
  explanation: "Because.",
  difficulty: "medium",
});

test("placeAnswer keeps every choice and points at the right one", () => {
  const out = placeAnswer(["A", "B", "C", "D", "E"], 3, 1);
  assert.equal(out.answer_index, 1);
  assert.equal(out.choices[1], "D");
  assert.deepEqual([...out.choices].sort(), ["A", "B", "C", "D", "E"]);
});

test("a batch that always answers 'A' gets a spread-out key", () => {
  const out = normalizeQuestions({ questions: Array.from({ length: 8 }, (_, i) => question(i)) }, new Set(["t1"]));
  assert.equal(out.length, 8);
  for (const [i, q] of out.entries()) assert.equal(q.choices[q.answer_index], `right ${i}`);
  const positions = new Set(out.map((q) => q.answer_index));
  assert.equal(positions.size, 4);
});

test("guide headings become focus points, minus the review sections", () => {
  const md = "Intro\n### Glycolysis steps\ntext\n#### **PFK-1** regulation\n### Common mix-ups\n### Check yourself\n#### Answers";
  assert.deepEqual(guideHeadings(md), ["Glycolysis steps", "PFK-1 regulation"]);
});
