// Unit tests for lib/learn (grading, round selection, progress, quick tests).
// Run with plain node: `node --test tests/*.test.mjs`
import { test } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers.mjs";

const grade = await load("lib/learn/grade.ts");
const engine = await load("lib/learn/engine.ts");
const progress = await load("lib/learn/progress.ts");
const quick = await load("lib/learn/quick-test.ts");

const right = (given, expected, opts) => grade.gradeAnswer(given, expected, opts).correct;

test("a different term one or two letters away is not a typo", () => {
  const pairs = [
    ["adduction", "abduction"],
    ["efferent", "afferent"],
    ["repolarization", "depolarization"],
    ["hyperthyroidism", "hypothyroidism"],
    ["hypothyroidism", "hyperthyroidism"],
    ["hyperparathyroidism", "hypoparathyroidism"],
    ["lactose", "lactase"],
    ["maltase", "maltose"],
    ["sucrose", "sucrase"],
    ["fumarate", "fumarase"],
    ["retinal", "retinol"],
    ["type ii diabetes", "Type I diabetes"],
    ["Type I diabetes", "type ii diabetes"],
    ["vitamin D2", "Vitamin D3"],
    ["Complex IV", "ATP synthase (Complex V)"],
    ["Complex I", "Complex IV"],
    ["Complex IV", "Complex I"],
    ["Complex III", "Complex II"],
    ["MHC class I", "MHC class II"],
    ["CD8+ T cells", "CD4+ T cells"],
    ["does require oxygen", "Does not require oxygen"],
  ];
  for (const [given, expected] of pairs) assert.equal(right(given, expected), false, `${given} for ${expected}`);
});

test("real typos are still forgiven", () => {
  const pairs = [
    ["mitochondira", "mitochondria"],
    ["glycolosis", "glycolysis"],
    ["phosphofructokinse", "phosphofructokinase"],
    ["hemoglobn", "hemoglobin"],
    ["oxidative phosphorylaton", "Oxidative phosphorylation"],
    ["krebs cycel", "Krebs cycle"],
    ["glycolysys", "glycolysis"],
    ["teh enzyme that makes ATP from ADP and phosphate", "The enzyme that makes ATP from ADP and phosphate"],
  ];
  for (const [given, expected] of pairs) {
    const r = grade.gradeAnswer(given, expected);
    assert.ok(r.correct && r.similarity < 1, `${given} for ${expected}: ${JSON.stringify(r)}`);
  }
});

test("another card's answer is a mix-up, not a typo", () => {
  const r = grade.gradeAnswer("cytokine", "cytosine", { others: ["Cytokine", "Adenine"] });
  assert.deepEqual([r.correct, r.close], [false, false]);
  const c = grade.gradeAnswer("Complex IV", "ATP synthase (Complex V)", {
    others: ["Complex IV (cytochrome c oxidase)", "Ubiquinone (CoQ)"],
  });
  assert.deepEqual([c.correct, c.close], [false, false]);
  // A duplicate of the card's own answer doesn't count against it.
  assert.equal(right("glycolysis", "Glycolysis", { others: ["Glycolysis"] }), true);
});

test("alternatives: fractions, stages, ion pairs and phrases stay whole", () => {
  for (const [given, expected] of [
    ["4", "1/4"],
    ["1", "1/4"],
    ["3", "3/4"],
    ["G2", "G2/M"],
    ["M", "G2/M"],
    ["S", "G1/S"],
    ["Na+", "Na+/K+-ATPase"],
    ["K+-ATPase", "Na+/K+-ATPase"],
    ["fight", "Fight or flight response"],
    ["flight response", "Fight or flight response"],
    ["all", "All or none principle"],
    ["fight", "Fight or flight"],
    ["as a regulator", "Citrate (as a regulator)"],
  ]) {
    assert.equal(right(given, expected), false, `${given} for ${expected}`);
  }
  assert.deepEqual(grade.answerAlternatives("1/4"), ["1/4"]);
  assert.equal(right("Signals low energy", "Signals low energy; activates PFK-1 and AMP kinase.", { side: "definition" }), false);
  for (const [given, expected] of [
    ["Complex V", "ATP synthase (Complex V)"],
    ["ATP synthase", "ATP synthase (Complex V)"],
    ["Citrate", "Citrate (as a regulator)"],
    ["glucose", "glucose/fructose"],
    ["fructose", "Glucose or fructose"],
    ["Na/K ATPase", "Na+/K+-ATPase"],
    ["1/4", "1/4"],
  ]) {
    assert.equal(right(given, expected), true, `${given} for ${expected}`);
  }
});

test("numbers keep their decimal point and sign", () => {
  for (const [given, expected] of [
    ["74", "7.4"],
    ["25", "2.5"],
    ["70 mV", "-70 mV"],
    ["+70 mV", "-70 mV"],
    ["7.5", "7.4"],
    ["Cl+", "Cl-"],
  ]) {
    assert.equal(right(given, expected), false, `${given} for ${expected}`);
  }
  for (const [given, expected] of [
    ["-70mV", "-70 mV"],
    ["−70 mV", "-70 mV"],
    ["0.5", ".5"],
    ["30 mV", "+30 mV"],
    ["type 2 diabetes", "Type II diabetes"],
    ["Na", "Na+"],
  ]) {
    assert.equal(right(given, expected), true, `${given} for ${expected}`);
  }
  assert.equal(grade.normalizeAnswer("7.4"), "7 point 4");
  assert.equal(grade.normalizeAnswer("-70 mV"), "minus 70 mv");
});

test("a letter label is not an article", () => {
  for (const [given, expected] of [
    ["band", "A band"],
    ["site", "A site"],
    ["DNA", "A-DNA"],
    ["B band", "A band"],
  ]) {
    assert.equal(right(given, expected), false, `${given} for ${expected}`);
  }
  assert.equal(right("a band", "A band"), true);
  assert.equal(right("the A site", "A site"), true);
  assert.equal(right("krebs cycle", "The Krebs cycle"), true);
  assert.notEqual(grade.normalizeAnswer("A band"), grade.normalizeAnswer("band"));
});

const card = (id, term, definition, topic_id = "t1") => ({ id, term, definition, topic_id, starred: false });

test("distractors never include a card with the same prompt", () => {
  const pool = [
    card("atp", "ATP", "Energy currency"),
    card("gtp", "GTP", "energy currency."),
    card("nadh", "NADH", "Electron carrier"),
    card("fadh2", "FADH2", "Another electron carrier"),
  ];
  for (let i = 0; i < 50; i += 1) {
    const options = engine.pickDistractors(pool[0], pool, "term");
    assert.ok(!options.includes("GTP"), JSON.stringify(options));
  }
});

test("due reviews come in the order they became due", () => {
  const now = new Date("2026-11-04T20:00:00Z");
  const hour = 3600_000;
  const cards = [];
  const map = new Map();
  for (let i = 0; i < 8; i += 1) {
    cards.push(card(`l${i}`, `L${i}`, `learning ${i}`));
    map.set(`l${i}`, { level: 1 + (i % 2), due_at: null, last_seen_at: new Date(now - 24 * hour - 30 * 60_000).toISOString() });
  }
  for (const id of ["m1", "m2"]) {
    cards.push(card(id, id, `mastered ${id}`));
    map.set(id, { level: 3, due_at: new Date(now - hour).toISOString(), last_seen_at: new Date(now - 49 * hour).toISOString() });
  }
  const round = engine.selectRoundCards(cards, map, { now }).map((c) => c.id);
  assert.deepEqual(round.slice(0, 2), ["m1", "m2"]);
});

test("ease only drops when a mastered card is missed", () => {
  let p = null;
  for (let i = 0; i < 3; i += 1) p = progress.applyAnswer(p, false, "mc");
  assert.equal(p.ease, progress.DEFAULT_EASE);
  const mastered = { level: 3, ease: 2.5, interval_days: 6, due_at: new Date(Date.now() - 1000).toISOString() };
  assert.equal(progress.applyAnswer(mastered, false, "review").ease, 2.3);
});

test("reviews land before the exam", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0);
  const examDate = "2026-11-13"; // 8.5 days away
  const prev = { level: 3, ease: 2.6, interval_days: 6.5, due_at: new Date(now.getTime() - 1000).toISOString() };
  const next = progress.applyAnswer(prev, true, "review", now, { examDate });
  const dueDays = (new Date(next.due_at) - now) / 86_400_000;
  assert.ok(dueDays <= 8.5 / 2 + 1e-6, `due in ${dueDays} days`);
  assert.equal(next.interval_days, 6.5); // held, not grown, while capped
  assert.equal(next.ease, 2.6);
  // Without an exam (or after it), the schedule stretches as usual.
  const free = progress.applyAnswer(prev, true, "review", now);
  assert.equal(free.interval_days, 16.9);
  const past = progress.applyAnswer(prev, true, "review", now, { examDate: "2026-11-01" });
  assert.equal(past.interval_days, 16.9);
  // A review already scheduled after the exam is pulled in by a correct answer.
  const later = { level: 3, ease: 2.5, interval_days: 20, due_at: new Date(now.getTime() + 15 * 86_400_000).toISOString() };
  const pulled = progress.applyAnswer(later, true, "flashcard", now, { examDate });
  assert.ok(new Date(pulled.due_at) < new Date(2026, 10, 13));
});

test("quick-test answers count by question type", () => {
  const item = (type, correct, extra = {}) => ({
    questionKey: "q",
    type,
    cardId: "c",
    correct,
    given: correct ? "x" : "y",
    expected: "x",
    blank: false,
    ...extra,
  });
  assert.equal(quick.progressModeFor(item("tf", true)), null);
  assert.equal(quick.progressModeFor(item("tf", false)), "mc");
  assert.equal(quick.progressModeFor(item("mc", true)), "mc");
  assert.equal(quick.progressModeFor(item("matching", true)), "mc");
  assert.equal(quick.progressModeFor(item("written", true)), "test");
  assert.equal(quick.progressModeFor(item("written", false, { blank: true, given: "" })), null);
  assert.equal(quick.progressModeFor(item("mc", true), true), null);
  assert.equal(quick.progressModeFor(item("mc", false), true), "mc");
  assert.equal(progress.levelAfterCorrect(2, "mc"), 2);
});

test("matching groups never hold two cards with the same definition", () => {
  const cards = [
    card("a", "ATP", "Energy currency"),
    card("b", "GTP", "Energy currency"),
    card("c", "NADH", "Electron carrier"),
    card("d", "FADH2", "Another electron carrier"),
    card("e", "CoQ", "Mobile carrier in the membrane"),
    card("f", "Cyt c", "Mobile carrier in the space"),
  ];
  for (let i = 0; i < 30; i += 1) {
    const qs = quick.buildQuickTest(cards, cards, { count: "all", types: ["matching"], topicKeys: null, answerWith: "term" });
    for (const q of qs.filter((x) => x.type === "matching")) {
      const defs = q.items.map((it) => grade.normalizeAnswer(it.definition));
      assert.equal(new Set(defs).size, defs.length, JSON.stringify(defs));
    }
    assert.equal(qs.reduce((n, q) => n + (q.type === "matching" ? q.items.length : 1), 0), cards.length);
  }
});
