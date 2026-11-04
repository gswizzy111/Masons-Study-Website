#!/usr/bin/env node
// Seed a confirmed demo user with a realistic study set, for local testing.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
// environment or .env.local. Never point this at production.
//
//   node scripts/seed-demo.mjs demo@test.local password123
//   node scripts/seed-demo.mjs demo@test.local password123 --empty   # user only
//
// Prints JSON: { userId, email, password, setId, courseId }.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile() {
  try {
    for (const line of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // no .env.local; rely on the environment
  }
}
loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error(`Refusing to seed a non-local Supabase (${url})`);

const [email = `demo-${Date.now()}@test.local`, password = "password123", flag] = process.argv.slice(2);
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: created, error: userErr } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "Mason" },
});
if (userErr) throw userErr;
const userId = created.user.id;

await db
  .from("profiles")
  .update({
    display_name: "Mason",
    onboarded_at: new Date().toISOString(),
    learning_profile: {
      level: "premed",
      goals: ["course_exams", "mcat"],
      approach: "big_picture_first",
      depth: "balanced",
      explain_with: ["analogies", "step_by_step", "clinical", "tables"],
      practice: ["recall", "application", "vignettes"],
      notes: "I need the why behind a mechanism. I mix up similar enzymes.",
    },
  })
  .eq("id", userId);

if (flag === "--empty") {
  console.log(JSON.stringify({ userId, email, password }));
  process.exit(0);
}

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

const course = must(
  await db.from("courses").insert({ user_id: userId, name: "BIO 301", color: "teal" }).select().single(),
  "course",
);
const examDate = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
const topics = [
  { id: "t1", title: "Glycolysis", summary: "Glucose to two pyruvate in the cytosol, net 2 ATP and 2 NADH." },
  { id: "t2", title: "Citric acid cycle", summary: "Acetyl-CoA is oxidized; NADH and FADH2 carry the electrons." },
  { id: "t3", title: "Electron transport and ATP synthase", summary: "A proton gradient powers ATP synthesis." },
  { id: "t4", title: "Regulation", summary: "PFK-1, hormones, and the fed versus fasted switch." },
];
const set = must(
  await db
    .from("study_sets")
    .insert({
      user_id: userId,
      course_id: course.id,
      title: "Exam 2: Cellular respiration",
      description: "Lectures 7-11. Focus on regulation and ETC inhibitors.",
      exam_date: examDate,
      status: "ready",
      topics,
      last_studied_at: new Date(Date.now() - 864e5).toISOString(),
    })
    .select()
    .single(),
  "set",
);

must(
  await db.from("materials").insert({
    user_id: userId,
    set_id: set.id,
    kind: "text",
    file_name: "Pasted notes",
    mime_type: "text/plain",
    content_text:
      "Glycolysis: 10 steps in the cytosol. Hexokinase traps glucose. PFK-1 is rate limiting. Pyruvate kinase makes ATP. " +
      "Citric acid cycle: citrate synthase, isocitrate dehydrogenase (rate limiting), alpha-ketoglutarate dehydrogenase. " +
      "ETC: complexes I-IV, cytochrome c, ubiquinone; ATP synthase uses the proton gradient. Cyanide blocks complex IV.",
    char_count: 360,
    status: "ready",
  }),
  "material",
);

const sectionMd = (t) => `**Big picture:** ${t.summary}

### How it works
1. **Step one:** the cell commits the substrate.
2. **Step two:** energy is captured as ATP or carried away on NADH.
3. **Step three:** products move on to the next pathway.

| | Glycolysis | Citric acid cycle |
|---|---|---|
| Where | Cytosol | Mitochondrial matrix |
| Rate-limiting enzyme | PFK-1 | Isocitrate dehydrogenase |
| Net energy per glucose | 2 ATP, 2 NADH | 2 GTP, 6 NADH, 2 FADH2 |

> **High-yield:** know the rate-limiting enzyme of each pathway and what turns it on and off.

> **Clinical connection:** cyanide blocks complex IV, so cells can't use oxygen even when plenty is delivered.

### Check yourself
- Why does high ATP slow ${t.title.toLowerCase()}?
- Which step is irreversible, and why does that matter for regulation?`;

must(
  await db.from("guide_sections").insert(
    topics.map((t, i) => ({
      user_id: userId,
      set_id: set.id,
      position: i,
      topic_id: t.id,
      title: t.title,
      content_md: sectionMd(t),
      status: "ready",
    })),
  ),
  "guide",
);

const CARDS = [
  ["t1", "Hexokinase", "Phosphorylates glucose to glucose-6-phosphate in most tissues; low Km; inhibited by glucose-6-phosphate."],
  ["t1", "Glucokinase", "Liver and pancreatic beta-cell isoform of hexokinase; high Km, induced by insulin, not inhibited by G6P."],
  ["t1", "Phosphofructokinase-1 (PFK-1)", "Rate-limiting enzyme of glycolysis: fructose-6-phosphate to fructose-1,6-bisphosphate."],
  ["t1", "Pyruvate kinase", "Makes pyruvate and ATP from phosphoenolpyruvate; activated by fructose-1,6-bisphosphate."],
  ["t1", "Substrate-level phosphorylation", "ATP made by direct phosphate transfer from a substrate to ADP."],
  ["t1", "Lactate dehydrogenase", "Converts pyruvate to lactate and regenerates NAD+ when oxygen is low."],
  ["t2", "Pyruvate dehydrogenase complex", "Pyruvate to acetyl-CoA; needs B1, lipoate, CoA, FAD, NAD+."],
  ["t2", "Citrate synthase", "Condenses acetyl-CoA with oxaloacetate to form citrate."],
  ["t2", "Isocitrate dehydrogenase", "Rate-limiting enzyme of the citric acid cycle; makes NADH and CO2."],
  ["t2", "alpha-Ketoglutarate dehydrogenase", "Makes succinyl-CoA, NADH and CO2; uses the same cofactors as PDH."],
  ["t2", "Succinate dehydrogenase", "Oxidizes succinate to fumarate and is also complex II of the ETC."],
  ["t2", "Oxaloacetate", "Four-carbon acceptor regenerated at the end of each turn of the cycle."],
  ["t3", "Complex I", "NADH dehydrogenase; passes electrons to ubiquinone and pumps 4 protons."],
  ["t3", "Ubiquinone (CoQ)", "Lipid-soluble carrier moving electrons from complexes I and II to complex III."],
  ["t3", "Cytochrome c", "Small mobile carrier moving electrons from complex III to complex IV."],
  ["t3", "Complex IV", "Cytochrome c oxidase; reduces O2 to water; blocked by cyanide and carbon monoxide."],
  ["t3", "ATP synthase (Complex V)", "Uses the proton-motive force to make ATP; blocked by oligomycin."],
  ["t3", "Uncoupler", "Lets protons leak back (2,4-DNP, thermogenin): oxygen use rises, ATP falls, heat is made."],
  ["t4", "Fructose-2,6-bisphosphate", "Activates PFK-1; made by PFK-2; insulin raises it, glucagon lowers it."],
  ["t4", "AMP", "Signals low energy; activates PFK-1 and AMP kinase."],
  ["t4", "Citrate (as a regulator)", "Inhibits PFK-1 when the citric acid cycle is backed up."],
  ["t4", "Insulin", "Fed-state hormone; promotes glycolysis and glycogen synthesis."],
  ["t4", "Glucagon", "Fasted-state hormone; raises cAMP, slows liver glycolysis, promotes gluconeogenesis."],
  ["t4", "Pasteur effect", "Glucose use drops when oxygen is present because oxidative phosphorylation makes ATP so efficiently."],
];
const cards = must(
  await db
    .from("cards")
    .insert(
      CARDS.map(([topic_id, term, definition], i) => ({
        user_id: userId,
        set_id: set.id,
        topic_id,
        term,
        definition,
        source: "ai",
        starred: i % 7 === 0,
        position: i,
      })),
    )
    .select(),
  "cards",
);

// Progress mix: 6 mastered (2 due), 8 still learning (some familiar), rest not studied.
const now = Date.now();
const progress = cards.slice(0, 14).map((c, i) => {
  const mastered = i < 6;
  return {
    card_id: c.id,
    user_id: userId,
    set_id: set.id,
    level: mastered ? 3 : i < 10 ? 2 : 1,
    streak: mastered ? 3 : 1,
    times_seen: mastered ? 4 : 2,
    times_correct: mastered ? 4 : 1,
    times_wrong: mastered ? 0 : 1,
    interval_days: mastered ? 3 : 0,
    ease: 2.5,
    due_at: mastered ? new Date(now + (i < 2 ? -3600e3 : 3 * 864e5)).toISOString() : null,
    last_result: mastered ? "correct" : i % 2 ? "wrong" : "correct",
    last_seen_at: new Date(now - 864e5).toISOString(),
  };
});
must(await db.from("card_progress").insert(progress), "progress");

must(
  await db.from("exam_questions").insert(
    [0, 1, 2, 3, 4].map((i) => ({
      user_id: userId,
      set_id: set.id,
      topic_id: topics[i % 4].id,
      stem: `A 24-year-old runner is given a drug that blocks complex IV. Which change happens first? (Question ${i + 1})`,
      choices: ["NADH builds up in the matrix", "ATP synthase speeds up", "Oxygen use rises", "The proton gradient grows"],
      answer_index: 0,
      explanation: "Blocking complex IV stops electron flow, so NADH can't be reoxidized and builds up. The gradient collapses and oxygen use falls.",
      difficulty: "medium",
    })),
  ),
  "exam questions",
);

must(
  await db.from("test_attempts").insert({
    user_id: userId,
    set_id: set.id,
    kind: "cards",
    score: 14,
    total: 20,
    details: [],
  }),
  "attempt",
);
must(
  await db.from("game_scores").insert([
    { user_id: userId, set_id: set.id, game: "meteor", score: 2400, meta: { level: 3, hits: 12, misses: 2 } },
    { user_id: userId, set_id: set.id, game: "match", score: 41250, meta: {} },
  ]),
  "scores",
);

console.log(JSON.stringify({ userId, email, password, setId: set.id, courseId: course.id }));
