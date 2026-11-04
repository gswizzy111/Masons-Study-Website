// The build_set job: read the material, plan topics, then write one study
// guide section and its flashcards per topic. See docs/ARCHITECTURE.md
// section 8.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AiNotConfiguredError,
  AiRefusalError,
  friendlyAiError,
} from "./client";
import { describeLearningProfile } from "./learning-profile";
import { guideSystemPrompt, materialsBlock, outlinePrompt, sectionPrompt } from "./prompts";
import {
  callStructured,
  normalizeCards,
  normalizeOutline,
  normalizeSectionMarkdown,
  OutlineSchema,
  runPool,
  SectionSchema,
  StructuredOutputError,
  termKey,
} from "./schemas";
import { loadSetContext, sanitizeTopics } from "./set-context";
import { ExtractionError, extractMaterial, type ExtractableMaterial } from "../extract";
import type { Job, LearningProfile, Topic } from "../types";

// ---------------------------------------------------------------------------
// Shared job types (also used by exam-questions.ts and run-job.ts)
// ---------------------------------------------------------------------------

/** A failure with a message that is safe and useful to show the student. */
export class JobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobError";
  }
}

export type JobContext = {
  /** Service-role client: bypasses RLS, so set user_id on every insert. */
  admin: SupabaseClient;
  /** The claimed job row (status running). */
  job: Job;
  /** Updates the job's progress (0-100) and message. */
  report: (progress: number, message: string) => Promise<void>;
  /** Epoch ms: start no new long step after this. */
  softDeadline: number;
  /** Epoch ms: abort Claude calls still running at this point. */
  hardDeadline: number;
};

export type JobOutcome =
  | { kind: "done"; message: string }
  /** Out of time: re-queue the job and continue from `continueFrom`. */
  | {
      kind: "yield";
      message: string;
      progress: number;
      continueFrom: ContinueFrom;
      /** Merged into the job's options for the next run (running totals). */
      carry?: Record<string, number>;
    };

/** "extract": material was still being read when time ran out. */
export type ContinueFrom = "extract" | "outline" | "sections";

/** The internal option a continued build_set job carries. */
export const CONTINUE_OPTION = "continue_from";
/** Running totals a continued build carries between runs. */
const CARDS_ADDED_OPTION = "cards_added";
const FILES_FAILED_OPTION = "files_failed";
/** Ceiling for a carried total (a set holds at most a few thousand cards). */
const CARRY_MAX = 20_000;

/**
 * A running total from an earlier run of this job. Only the runner writes
 * these (users' job inserts are stripped to the public options by a
 * database trigger), but they are clamped anyway.
 */
function carried(job: Job, key: string): number {
  const value = Math.trunc(Number(job.options?.[key] ?? 0));
  return Number.isFinite(value) && value > 0 ? Math.min(value, CARRY_MAX) : 0;
}

function continueFromOf(job: Job): ContinueFrom | undefined {
  const value = job.options?.[CONTINUE_OPTION];
  return value === "extract" || value === "outline" || value === "sections" ? value : undefined;
}

/** Turns any error into a message for the student. */
export function readableError(error: unknown): string {
  if (error instanceof JobError || error instanceof ExtractionError || error instanceof StructuredOutputError) {
    return error.message;
  }
  if (error instanceof AiNotConfiguredError) return "Claude isn't connected yet: add ANTHROPIC_API_KEY.";
  if (error instanceof AiRefusalError) return error.message;
  if (error instanceof Anthropic.AnthropicError) return friendlyAiError(error);
  return "Something went wrong. Try again in a minute.";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECTION_CONCURRENCY = 3;
const EXTRACT_CONCURRENCY = 3;
const TERMS_IN_PROMPT = 300;

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;
}

function quoteList(items: string[]): string {
  const quoted = items.map((t) => `"${t}"`);
  if (quoted.length <= 2) return quoted.join(" and ");
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}

export function isAbort(error: unknown): boolean {
  if (error instanceof Anthropic.APIUserAbortError) return true;
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "APIUserAbortError" || name === "TimeoutError";
}

/** Aborts at `deadline` (epoch ms). Call `clear()` when done. */
export function deadlineSignal(deadline: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1_000, deadline - Date.now()));
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function must<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new JobError(`Couldn't ${what}. Try again in a minute.`);
  return data;
}

type SetRow = { id: string; user_id: string; title: string; description: string | null; topics: unknown };

export async function loadSet(admin: SupabaseClient, setId: string): Promise<SetRow & { topics: Topic[] }> {
  const set = await must<SetRow | null>(
    admin.from("study_sets").select("id, user_id, title, description, topics").eq("id", setId).maybeSingle(),
    "load the study set",
  );
  if (!set) throw new JobError("This study set no longer exists.");
  // Users can write study_sets.topics directly: cap and clip before any prompt.
  return { ...set, topics: sanitizeTopics(set.topics) };
}

export async function loadLearningProfile(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("learning_profile").eq("id", userId).maybeSingle();
  return describeLearningProfile((data?.learning_profile ?? null) as LearningProfile | null);
}

/** Every value of one column for a set, paged past the 1,000-row API cap. */
async function selectAllTerms(admin: SupabaseClient, setId: string): Promise<string[]> {
  const out: string[] = [];
  const page = 1000;
  for (let from = 0; from < 20_000; from += page) {
    const rows = await must<Array<{ term: string }> | null>(
      admin.from("cards").select("term").eq("set_id", setId).order("position").range(from, from + page - 1),
      "load the existing flashcards",
    );
    for (const r of rows ?? []) out.push(r.term);
    if (!rows || rows.length < page) break;
  }
  return out;
}

/**
 * After a failed build: sections that were being rewritten keep their
 * previous text and go back to 'ready'; ones that never had text are marked
 * 'error'. The set stays usable ('ready') when it has a written guide
 * section, otherwise it is marked 'error'.
 */
export async function markBuildFailed(admin: SupabaseClient, setId: string): Promise<void> {
  await admin
    .from("guide_sections")
    .update({ status: "ready" })
    .eq("set_id", setId)
    .in("status", ["pending", "writing"])
    .neq("content_md", "");
  await admin
    .from("guide_sections")
    .update({ status: "error" })
    .eq("set_id", setId)
    .in("status", ["pending", "writing"])
    .eq("content_md", "");
  const { count } = await admin
    .from("guide_sections")
    .select("id", { count: "exact", head: true })
    .eq("set_id", setId)
    .eq("status", "ready");
  await admin
    .from("study_sets")
    .update({ status: (count ?? 0) > 0 ? "ready" : "error" })
    .eq("id", setId);
}

// ---------------------------------------------------------------------------
// Step 1: extraction
// ---------------------------------------------------------------------------

function extractionMessage(error: unknown): string {
  if (error instanceof ExtractionError) return error.message;
  if (error instanceof AiNotConfiguredError) {
    return "Reading photos and scanned pages needs Claude. Add ANTHROPIC_API_KEY, then build again.";
  }
  if (error instanceof AiRefusalError) {
    return "Claude couldn't read this file. Try a clearer photo or a different file.";
  }
  if (error instanceof Anthropic.AnthropicError) return friendlyAiError(error);
  return "This file couldn't be read. Try adding it again.";
}

type ExtractSummary = {
  read: number;
  failed: number;
  /** Materials not read because time ran out; the next run reads them. */
  unfinished: number;
};

async function extractPending(ctx: JobContext, setId: string, retryErrored: boolean): Promise<ExtractSummary> {
  const { admin, job } = ctx;
  // 'processing' rows here are left over from a run that stopped: only one
  // build job runs per set at a time. Files that failed are tried again on a
  // new build, not when this build continues after running out of time.
  const statuses = retryErrored ? ["pending", "processing", "error"] : ["pending", "processing"];
  const materials = await must<Array<ExtractableMaterial & { status: string }> | null>(
    admin
      .from("materials")
      .select("id, kind, file_name, mime_type, storage_path, content_text, status")
      .eq("set_id", setId)
      .in("status", statuses)
      .order("created_at", { ascending: true }),
    "load the material",
  );
  const list = materials ?? [];
  const summary: ExtractSummary = { read: 0, failed: 0, unfinished: 0 };
  if (list.length === 0) return summary;

  const owner = { userId: job.user_id, setId };
  let finished = 0;
  let started = 0;
  await runPool(
    list,
    EXTRACT_CONCURRENCY,
    async (material, _i, opened) => {
      opened();
      started++;
      await ctx.report(2 + Math.round((18 * finished) / list.length), `Reading ${material.file_name}`);
      await admin.from("materials").update({ status: "processing", error: null }).eq("id", material.id);
      const deadline = deadlineSignal(ctx.hardDeadline);
      try {
        const { text, warning } = await extractMaterial(admin, material, owner, { signal: deadline.signal });
        const { error } = await admin
          .from("materials")
          // A ready material's `error` holds a note about what couldn't be read.
          .update({ status: "ready", error: warning ?? null, content_text: text, char_count: text.length })
          .eq("id", material.id);
        if (error) throw new ExtractionError("The text was read but couldn't be saved. Try again.");
        summary.read++;
      } catch (error) {
        if (isAbort(error)) {
          // Out of time: the next run reads this one again.
          summary.unfinished++;
          await admin.from("materials").update({ status: "pending", error: null }).eq("id", material.id);
          return;
        }
        if (!(error instanceof ExtractionError)) console.error(`[build_set ${job.id}] extract ${material.id}`, error);
        summary.failed++;
        await admin
          .from("materials")
          .update({
            status: "error",
            error: extractionMessage(error),
            // Pasted notes keep their text; files had none to keep.
            ...(material.kind === "file" ? { content_text: null, char_count: null } : {}),
          })
          .eq("id", material.id);
      } finally {
        deadline.clear();
        finished++;
      }
    },
    () => Date.now() < ctx.softDeadline,
  );
  summary.unfinished += list.length - started;
  return summary;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

type SectionRow = { position: number; topic_id: string; title?: string; status: string; content_md: string };

/** "Built 4 topics..." or, after failures, "Wrote 3 of 4 topics...". */
export function buildDoneMessage(input: {
  total: number;
  readyCount: number;
  newCards: number;
  /** Sections that couldn't be written and had no earlier text. */
  failedNew: string[];
  /** Sections that couldn't be rewritten and kept their earlier text. */
  failedKept: string[];
  cardSaveFailures: number;
  filesFailed: number;
  fileWarnings: Array<{ file: string; warning: string }>;
  truncated: boolean;
}): string {
  const { total, readyCount, newCards, failedNew, failedKept } = input;
  const failedCount = failedNew.length + failedKept.length;
  const parts = [
    failedCount > 0
      ? `Wrote ${readyCount.toLocaleString("en-US")} of ${plural(total, "topic")} and ${plural(newCards, "new flashcard")}.`
      : `Built ${plural(total, "topic")} and ${plural(newCards, "new flashcard")}.`,
  ];
  if (failedKept.length > 0) {
    parts.push(
      failedKept.length === 1
        ? `${quoteList(failedKept)} couldn't be rewritten, so it keeps its previous text.`
        : `${failedKept.length} sections couldn't be rewritten (${quoteList(failedKept)}), so they keep their previous text.`,
    );
  }
  if (failedNew.length > 0) {
    parts.push(
      `${failedNew.length === 1 ? "One section" : `${failedNew.length} sections`} couldn't be written (${quoteList(
        failedNew,
      )}).`,
    );
  }
  if (failedCount > 0) parts.push("Build again to try once more.");
  if (input.cardSaveFailures > 0) parts.push(`${plural(input.cardSaveFailures, "flashcard")} couldn't be saved.`);
  if (input.filesFailed > 0) {
    parts.push(`${plural(input.filesFailed, "file")} couldn't be read. Check the material list.`);
  }
  for (const { file, warning } of input.fileWarnings.slice(0, 3)) parts.push(`"${file}": ${warning}`);
  if (input.fileWarnings.length > 3) {
    parts.push(`${plural(input.fileWarnings.length - 3, "more file")} had parts that couldn't be read.`);
  }
  if (input.truncated) {
    parts.push("Your material was very long, so some of it was left out. Splitting it into smaller sets helps.");
  }
  return parts.join(" ");
}

export async function buildSet(ctx: JobContext): Promise<JobOutcome> {
  const { admin, job } = ctx;
  const setId = job.set_id;
  const continueFrom = continueFromOf(job);

  let set = await loadSet(admin, setId);
  await admin.from("study_sets").update({ status: "building" }).eq("id", setId);

  // 1. Extract new (or previously failed) material. A run that continues
  // after time ran out mid-extraction reads what is left.
  let extract: ExtractSummary = { read: 0, failed: carried(job, FILES_FAILED_OPTION), unfinished: 0 };
  if (!continueFrom || continueFrom === "extract") {
    await ctx.report(2, "Reading your material");
    const fresh = await extractPending(ctx, setId, !continueFrom);
    extract = { ...fresh, failed: fresh.failed + (continueFrom ? extract.failed : 0) };
  }
  const carry = (cards: number) => ({ [CARDS_ADDED_OPTION]: cards, [FILES_FAILED_OPTION]: extract.failed });
  if (extract.unfinished > 0) {
    return {
      kind: "yield",
      message: "Still reading your material",
      progress: 20,
      continueFrom: "extract",
      carry: carry(0),
    };
  }

  // Files that were read only in part (a ready material's `error` is a note).
  const { data: notedRows } = await admin
    .from("materials")
    .select("file_name, error")
    .eq("set_id", setId)
    .eq("status", "ready")
    .not("error", "is", null)
    .order("created_at", { ascending: true });
  const fileWarnings = (notedRows ?? []).map((r) => ({ file: String(r.file_name), warning: String(r.error) }));

  // 2. Material text and the learning profile.
  await ctx.report(20, "Getting your material ready");
  const context = await loadSetContext(admin, setId);
  if (context.materialCount === 0 || !context.text.trim()) {
    const { count } = await admin
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId)
      .eq("status", "error");
    throw new JobError(
      (count ?? 0) > 0
        ? "None of this set's material could be read. Fix or replace the files marked with a problem, then build again."
        : "There's no material to study yet. Upload a file or paste your notes, then build again.",
    );
  }
  const profile = await loadLearningProfile(admin, job.user_id);
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: guideSystemPrompt(profile) },
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

  // 3. Outline (skipped when continuing a build whose outline is saved).
  let topics: Topic[];
  if (continueFrom === "sections" && set.topics.length > 0) {
    topics = set.topics;
  } else {
    if (Date.now() > ctx.softDeadline) {
      return {
        kind: "yield",
        message: "Still working: planning topics next",
        progress: 20,
        continueFrom: "outline",
        carry: carry(0),
      };
    }
    await ctx.report(22, "Planning topics");
    const deadline = deadlineSignal(ctx.hardDeadline);
    let outline;
    try {
      outline = await callStructured({
        schema: OutlineSchema,
        // Same blocks, but no cache write: a different output format means
        // the sections can't read a cache this call writes.
        system: system.map((block) => ({ type: block.type, text: block.text })),
        prompt: outlinePrompt({ existingTopics: set.topics }),
        effort: "high",
        maxTokens: 32_000,
        signal: deadline.signal,
      });
    } catch (error) {
      if (isAbort(error)) {
        return {
          kind: "yield",
          message: "Still working: planning topics next",
          progress: 20,
          continueFrom: "outline",
          carry: carry(0),
        };
      }
      throw error;
    } finally {
      deadline.clear();
    }
    topics = normalizeOutline(
      outline,
      set.topics.map((t) => t.id),
    );
    if (topics.length === 0) throw new JobError("Claude couldn't find topics in this material. Try adding more material.");

    // The guide as it is now. A rebuild never blanks text that was already
    // written: each topic's earlier section text moves with it and stays
    // until its new text is in (or for good, if the rewrite fails).
    const before = await must<SectionRow[] | null>(
      admin.from("guide_sections").select("position, topic_id, title, status, content_md").eq("set_id", setId),
      "load the guide",
    );
    const previous = new Map<string, SectionRow>();
    for (const row of [...(before ?? [])].sort((a, b) => a.position - b.position)) {
      if (row.content_md && !previous.has(row.topic_id)) previous.set(row.topic_id, row);
    }
    const kept = new Set(topics.map((t) => t.id));
    // Sections of topics the new outline dropped stay after the new ones
    // until this build finishes, so a failed build loses nothing.
    const orphans = [...previous.values()].filter((row) => !kept.has(row.topic_id));

    await must(admin.from("study_sets").update({ topics }).eq("id", setId), "save the topics");
    set = { ...set, topics };
    // From here on, a retry of this job picks up at the sections.
    job.options = { ...(job.options ?? {}), [CONTINUE_OPTION]: "sections" };
    await admin.from("jobs").update({ options: job.options }).eq("id", job.id).eq("status", "running");

    await must(
      admin.from("guide_sections").upsert(
        [
          ...topics.map((t, position) => ({
            user_id: job.user_id,
            set_id: setId,
            position,
            topic_id: t.id,
            title: t.title,
            content_md: previous.get(t.id)?.content_md ?? "",
            status: "pending",
          })),
          ...orphans.map((row, i) => ({
            user_id: job.user_id,
            set_id: setId,
            position: topics.length + i,
            topic_id: row.topic_id,
            title: row.title || "Earlier topic",
            content_md: row.content_md,
            status: "ready",
          })),
        ],
        { onConflict: "set_id,position" },
      ),
      "save the guide outline",
    );
    await must(
      admin
        .from("guide_sections")
        .delete()
        .eq("set_id", setId)
        .gte("position", topics.length + orphans.length),
      "tidy the guide",
    );
  }

  // 4. Sections and cards, 3 at a time.
  const sections = await must<SectionRow[] | null>(
    admin
      .from("guide_sections")
      .select("position, topic_id, status, content_md")
      .eq("set_id", setId)
      .order("position"),
    "load the guide",
  );
  const rowAt = new Map((sections ?? []).map((row) => [row.position, row] as const));
  // A section counts as done only at its own position with its own topic
  // (a continued run skips what an earlier run of this job wrote).
  const isDone = (topic: Topic, index: number) => {
    const row = rowAt.get(index);
    return row?.topic_id === topic.id && row.status === "ready";
  };
  // Positions whose section already has text for its topic (kept if a rewrite fails).
  const hadText = new Set(
    topics.flatMap((topic, index) => {
      const row = rowAt.get(index);
      return row?.topic_id === topic.id && row.content_md ? [index] : [];
    }),
  );
  const todo = topics.map((topic, index) => ({ topic, index })).filter(({ topic, index }) => !isDone(topic, index));
  // Every section to write needs its row (a continued run normally has them
  // from the outline step); existing rows and their text are left alone.
  const missing = todo.filter(({ index }) => !rowAt.has(index));
  if (missing.length > 0) {
    await must(
      admin.from("guide_sections").upsert(
        missing.map(({ topic, index }) => ({
          user_id: job.user_id,
          set_id: setId,
          position: index,
          topic_id: topic.id,
          title: topic.title,
          content_md: "",
          status: "pending",
        })),
        { onConflict: "set_id,position", ignoreDuplicates: true },
      ),
      "save the guide outline",
    );
  }

  const existingTerms = await selectAllTerms(admin, setId);
  const seenTerms = new Set(existingTerms.map(termKey));
  const promptTerms = existingTerms.slice(0, TERMS_IN_PROMPT);
  const last = await must<Array<{ position: number }> | null>(
    admin.from("cards").select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1),
    "load the flashcards",
  );
  let nextPosition = (last?.[0]?.position ?? -1) + 1;

  let readyCount = topics.length - todo.length;
  let attempted = 0;
  let newCards = continueFrom ? carried(job, CARDS_ADDED_OPTION) : 0;
  let cardSaveFailures = 0;
  const failed: Array<{ title: string; error: unknown; keptText: boolean }> = [];
  const unfinished: string[] = [];
  const total = topics.length;
  const progressNow = () => 30 + Math.round((68 * readyCount) / Math.max(1, total));

  await runPool(
    todo,
    SECTION_CONCURRENCY,
    async ({ topic, index }, _i, started) => {
      attempted++;
      await ctx.report(progressNow(), `Writing ${topic.title} (${index + 1} of ${total})`);
      // The previous text (if any) stays in place while Claude writes.
      await admin
        .from("guide_sections")
        .update({ status: "writing", title: topic.title, topic_id: topic.id })
        .eq("set_id", setId)
        .eq("position", index);

      const deadline = deadlineSignal(ctx.hardDeadline);
      try {
        const out = await callStructured({
          schema: SectionSchema,
          system,
          prompt: sectionPrompt({ topic, index, topics, existingTerms: promptTerms }),
          effort: "high",
          maxTokens: 48_000,
          onStarted: started,
          signal: deadline.signal,
        });

        const content = normalizeSectionMarkdown(out.content_md);
        if (!content) throw new StructuredOutputError("Claude returned an empty section.");
        await must(
          admin
            .from("guide_sections")
            .update({ content_md: content, status: "ready", title: topic.title, topic_id: topic.id })
            .eq("set_id", setId)
            .eq("position", index),
          "save the guide section",
        );
        readyCount++;

        // Skip terms the set already has (case-insensitive), so a rebuild
        // never duplicates cards or touches their progress.
        const fresh = normalizeCards(out.cards).filter((card) => {
          const key = termKey(card.term);
          if (seenTerms.has(key)) return false;
          seenTerms.add(key);
          return true;
        });
        if (fresh.length > 0) {
          const rows = fresh.map((card) => ({
            user_id: job.user_id,
            set_id: setId,
            term: card.term,
            definition: card.definition,
            hint: card.hint,
            topic_id: topic.id,
            source: "ai" as const,
            position: nextPosition++,
          }));
          const { error } = await admin.from("cards").insert(rows);
          if (error) {
            console.error(`[build_set ${job.id}] cards for ${topic.id}`, error.message);
            cardSaveFailures += rows.length;
          } else {
            newCards += rows.length;
          }
        }
      } catch (error) {
        if (isAbort(error) && Date.now() >= ctx.hardDeadline - 1_000) {
          unfinished.push(topic.id);
          await admin
            .from("guide_sections")
            .update({ status: "pending" })
            .eq("set_id", setId)
            .eq("position", index);
          return;
        }
        if (!(error instanceof AiRefusalError)) console.error(`[build_set ${job.id}] section ${topic.id}`, error);
        // Never blank a section: earlier text stays and stays readable.
        const keptText = hadText.has(index);
        failed.push({ title: topic.title, error, keptText });
        await admin
          .from("guide_sections")
          .update({ status: keptText ? "ready" : "error" })
          .eq("set_id", setId)
          .eq("position", index);
      } finally {
        deadline.clear();
        started();
      }
      await ctx.report(progressNow(), `Wrote ${topic.title} (${readyCount} of ${total} done)`);
    },
    () => Date.now() < ctx.softDeadline,
  );

  // Out of time: anything not started (or cut off) continues in a new run.
  if (unfinished.length > 0 || attempted < todo.length) {
    return {
      kind: "yield",
      message: `Still writing: ${readyCount} of ${total} topics done`,
      progress: progressNow(),
      continueFrom: "sections",
      carry: carry(newCards),
    };
  }

  // 5. Finish.
  if (readyCount === 0) {
    // Nothing new was written; sections with earlier text keep it.
    await markBuildFailed(admin, setId);
    const first = failed[0]?.error;
    const kept = failed.some((f) => f.keptText);
    const why =
      first instanceof AiRefusalError
        ? "Claude couldn't write this study guide. Try rebuilding, or check that the material is course content."
        : `The study guide couldn't be written. ${first ? readableError(first) : "Try again in a minute."}`;
    throw new JobError(kept ? `${why} Your previous guide is unchanged.` : why);
  }
  // Sections of topics the new outline dropped go once the build is through.
  await admin.from("guide_sections").delete().eq("set_id", setId).gte("position", total);
  await must(admin.from("study_sets").update({ status: "ready" }).eq("id", setId), "finish the study set");

  return {
    kind: "done",
    message: buildDoneMessage({
      total,
      readyCount,
      newCards,
      failedNew: failed.filter((f) => !f.keptText).map((f) => f.title),
      failedKept: failed.filter((f) => f.keptText).map((f) => f.title),
      cardSaveFailures,
      filesFailed: extract.failed,
      fileWarnings,
      truncated: context.truncated,
    }),
  };
}
