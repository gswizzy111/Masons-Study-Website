// The exam_questions job: exam-style multiple-choice questions from the set's
// material, in batches of 5 written in parallel. See docs/ARCHITECTURE.md
// section 8.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import type Anthropic from "@anthropic-ai/sdk";
import { AiRefusalError } from "./client";
import { examBatchPrompt, examSystemPrompt, materialsBlock, type DifficultyPlan } from "./prompts";
import { callStructured, ExamBatchSchema, normalizeQuestions, runPool, type CleanQuestion } from "./schemas";
import { loadSetContext } from "./set-context";
import {
  deadlineSignal,
  isAbort,
  JobError,
  loadLearningProfile,
  loadSet,
  readableError,
  type JobContext,
  type JobOutcome,
} from "./build-set";
import type { Topic } from "../types";

export const EXAM_MIN_COUNT = 5;
export const EXAM_MAX_COUNT = 40;
export const EXAM_DEFAULT_COUNT = 15;
const BATCH_SIZE = 5;
const BATCH_CONCURRENCY = 4;
const AVOID_STEMS = 150;
/** Focus points (guide headings or key terms) read per topic. */
const FOCUS_POINTS = 60;

/** Angles handed to batches that share a topic, so they don't overlap. */
const ANGLES = [
  "mechanisms and step-by-step processes",
  "regulation and control, and what happens when it fails",
  "experiments, data and predictions",
  "clinical and real-world applications",
  "comparisons and commonly confused ideas",
  "structure and function",
  "quantitative reasoning (rates, yields, concentrations)",
  "how this topic connects to the rest of the set",
];

/** The ### and #### headings of a guide section, in order. */
export function guideHeadings(markdown: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = /^#{3,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const heading = m[1].replace(/[*_`]/g, "").trim();
    if (heading && !/^(check yourself|answers|common mix-ups)$/i.test(heading)) out.push(heading.slice(0, 120));
  }
  return out;
}

export type ExamDifficulty = "mixed" | "easy" | "medium" | "hard";

export type ExamOptions = { count: number; topicIds: string[] | null; difficulty: ExamDifficulty };

/** Reads job options leniently (the API route validates them strictly). */
export function readExamOptions(options: Record<string, unknown> | null | undefined): ExamOptions {
  const raw = options ?? {};
  const n = typeof raw.count === "number" && Number.isFinite(raw.count) ? Math.round(raw.count) : EXAM_DEFAULT_COUNT;
  const count = Math.min(EXAM_MAX_COUNT, Math.max(EXAM_MIN_COUNT, n));
  const topicIds = Array.isArray(raw.topicIds)
    ? raw.topicIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : null;
  const difficulty = (["mixed", "easy", "medium", "hard"] as const).includes(raw.difficulty as ExamDifficulty)
    ? (raw.difficulty as ExamDifficulty)
    : "mixed";
  return { count, topicIds: topicIds && topicIds.length ? topicIds : null, difficulty };
}

function planFor(size: number, difficulty: ExamDifficulty): DifficultyPlan {
  if (difficulty !== "mixed") return { easy: 0, medium: 0, hard: 0, [difficulty]: size };
  const easy = Math.round(size * 0.3);
  const hard = Math.round(size * 0.25);
  return { easy, medium: Math.max(0, size - easy - hard), hard };
}

/** Comparable form of a stem, to catch repeats. */
function stemKey(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 160);
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

export async function generateExamQuestions(ctx: JobContext): Promise<JobOutcome> {
  const { admin, job } = ctx;
  const setId = job.set_id;
  const options = readExamOptions(job.options);

  const set = await loadSet(admin, setId);
  let topics: Topic[] = set.topics;
  if (options.topicIds) {
    const wanted = new Set(options.topicIds);
    topics = topics.filter((t) => wanted.has(t.id));
    if (topics.length === 0) {
      throw new JobError("Those topics aren't in this set anymore. Pick topics again and retry.");
    }
  }
  const realTopicIds = new Set(topics.map((t) => t.id));
  // A set that was never built has no topics: draw from all of the material.
  const promptTopics: Topic[] = topics.length
    ? topics
    : [{ id: "all", title: set.title, summary: "All of the material in this set." }];

  await ctx.report(5, "Reading your material");
  let context = await loadSetContext(admin, setId);
  if (context.materialCount === 0) context = await loadSetContext(admin, setId, { includeGuide: true });
  if (!context.text.trim()) {
    throw new JobError("There's no material to write questions from yet. Add material and build the set first.");
  }

  const profile = await loadLearningProfile(admin, job.user_id);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: examSystemPrompt(profile) },
    {
      type: "text",
      text: materialsBlock({
        setTitle: set.title,
        description: set.description,
        text: context.text,
        truncated: context.truncated,
      }),
      cache_control: { type: "ephemeral" },
    },
  ];

  const { data: existing } = await admin
    .from("exam_questions")
    .select("stem")
    .eq("set_id", setId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const seen = new Set((existing ?? []).map((q) => stemKey(String(q.stem))));
  const avoidStems = (existing ?? [])
    .slice(0, AVOID_STEMS)
    .map((q) => String(q.stem).replace(/\s+/g, " ").trim())
    .map((s) => (s.length > 160 ? `${s.slice(0, 157)}...` : s));

  // Batches of 5; each gets its own share of topics so they don't overlap.
  const sizes: number[] = [];
  for (let left = options.count; left > 0; left -= BATCH_SIZE) sizes.push(Math.min(BATCH_SIZE, left));
  const shared = promptTopics.length < sizes.length;
  const batches: Array<{ size: number; topics: Topic[]; focus?: string[]; angle?: string }> = sizes.map(
    (size, k) => ({
      size,
      topics: shared ? [promptTopics[k % promptTopics.length]] : promptTopics.filter((_, i) => i % sizes.length === k),
    }),
  );
  if (shared) {
    // Several batches per topic, written at the same time: split each
    // topic's guide headings (or its card terms) between them and give each
    // a different angle, so they don't all test the same facts.
    const focusByTopic = await loadFocusPoints(ctx, setId, promptTopics);
    const lanesPerTopic = new Map<string, number>();
    for (const batch of batches) lanesPerTopic.set(batch.topics[0].id, (lanesPerTopic.get(batch.topics[0].id) ?? 0) + 1);
    const seenPerTopic = new Map<string, number>();
    batches.forEach((batch) => {
      const topicId = batch.topics[0].id;
      const lane = seenPerTopic.get(topicId) ?? 0;
      seenPerTopic.set(topicId, lane + 1);
      const lanes = lanesPerTopic.get(topicId) ?? 1;
      const points = focusByTopic.get(topicId) ?? [];
      const mine = points.filter((_, i) => i % lanes === lane);
      batch.focus = mine.length ? mine : undefined;
      batch.angle = ANGLES[lane % ANGLES.length];
    });
  }

  let written = 0;
  const failures: unknown[] = [];
  await ctx.report(10, `Writing ${plural(options.count, "question")}`);

  await runPool(
    batches,
    BATCH_CONCURRENCY,
    async (batch, k, started) => {
      const deadline = deadlineSignal(ctx.hardDeadline);
      try {
        const out = await callStructured({
          schema: ExamBatchSchema,
          system,
          prompt: examBatchPrompt({
            count: batch.size,
            topics: batch.topics,
            plan: planFor(batch.size, options.difficulty),
            batchIndex: k,
            batchCount: batches.length,
            avoidStems,
            focus: batch.focus,
            angle: batch.angle,
          }),
          effort: "medium",
          maxTokens: 24_000,
          onStarted: started,
          signal: deadline.signal,
        });

        const fresh: CleanQuestion[] = normalizeQuestions(out, realTopicIds)
          .filter((q) => {
            const key = stemKey(q.stem);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, batch.size);
        if (fresh.length === 0) return;

        const { error } = await admin.from("exam_questions").insert(
          fresh.map((q) => ({
            user_id: job.user_id,
            set_id: setId,
            topic_id: q.topic_id,
            stem: q.stem,
            choices: q.choices,
            answer_index: q.answer_index,
            explanation: q.explanation,
            difficulty: q.difficulty,
          })),
        );
        if (error) throw new JobError("Some questions were written but couldn't be saved.");
        written += fresh.length;
        await ctx.report(
          10 + Math.round((88 * Math.min(written, options.count)) / options.count),
          `Wrote ${written} of ${options.count} questions`,
        );
      } catch (error) {
        if (!(error instanceof AiRefusalError) && !isAbort(error)) {
          console.error(`[exam_questions ${job.id}] batch ${k}`, error);
        }
        failures.push(error);
      } finally {
        deadline.clear();
      }
    },
    () => Date.now() < ctx.softDeadline,
  );

  if (written === 0) {
    const first = failures[0];
    throw new JobError(
      first instanceof AiRefusalError
        ? "Claude couldn't write questions for this material. Try different topics."
        : isAbort(first)
          ? "Writing the questions took too long. Try again, or ask for fewer questions."
          : first
            ? readableError(first)
            : "No new questions could be written. Try different topics or a different difficulty.",
    );
  }
  if (written < options.count) {
    return {
      kind: "done",
      message: `Added ${plural(written, "question")}. Some couldn't be written this time; try again for more.`,
    };
  }
  return { kind: "done", message: `Added ${plural(written, "new question")}.` };
}

/**
 * Per topic: its guide section's headings, or else its flashcard terms.
 * Best effort: a read that fails just means no focus points.
 */
async function loadFocusPoints(ctx: JobContext, setId: string, topics: Topic[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = topics.map((t) => t.id).filter((id) => id !== "all");
  if (ids.length === 0) return out;
  const { data: sections } = await ctx.admin
    .from("guide_sections")
    .select("topic_id, content_md")
    .eq("set_id", setId)
    .in("topic_id", ids)
    .neq("content_md", "");
  for (const row of sections ?? []) {
    const headings = guideHeadings(String(row.content_md ?? ""));
    if (headings.length) out.set(String(row.topic_id), headings.slice(0, FOCUS_POINTS));
  }
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length) {
    const { data: cards } = await ctx.admin
      .from("cards")
      .select("topic_id, term")
      .eq("set_id", setId)
      .in("topic_id", missing)
      .order("position")
      .limit(1000);
    for (const card of cards ?? []) {
      const id = String(card.topic_id);
      const list = out.get(id) ?? [];
      if (list.length < FOCUS_POINTS) list.push(String(card.term).replace(/\s+/g, " ").slice(0, 120));
      out.set(id, list);
    }
  }
  return out;
}
