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
import { loadSetContext } from "./set-context";
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

export type ContinueFrom = "outline" | "sections";

/** The internal option a continued build_set job carries. */
export const CONTINUE_OPTION = "continue_from";
/** Running totals a continued build carries between runs. */
const CARDS_ADDED_OPTION = "cards_added";
const FILES_FAILED_OPTION = "files_failed";

function carried(job: Job, key: string): number {
  const value = Number(job.options?.[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
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

function isAbort(error: unknown): boolean {
  if (error instanceof Anthropic.APIUserAbortError) return true;
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "APIUserAbortError" || name === "TimeoutError";
}

/** Aborts at `deadline` (epoch ms). Call `clear()` when done. */
function deadlineSignal(deadline: number): { signal: AbortSignal; clear: () => void } {
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
  const topics = Array.isArray(set.topics)
    ? (set.topics as Topic[]).filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
    : [];
  return { ...set, topics };
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
 * After a failed build: the set stays usable ('ready') when it has a written
 * guide section, otherwise it is marked 'error'.
 */
export async function markBuildFailed(admin: SupabaseClient, setId: string): Promise<void> {
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

type ExtractSummary = { read: number; failed: number };

async function extractPending(ctx: JobContext, setId: string): Promise<ExtractSummary> {
  const { admin, job } = ctx;
  // 'processing' rows here are left over from a run that stopped: only one
  // build job runs per set at a time.
  const materials = await must<Array<ExtractableMaterial & { status: string }> | null>(
    admin
      .from("materials")
      .select("id, kind, file_name, mime_type, storage_path, content_text, status")
      .eq("set_id", setId)
      .in("status", ["pending", "processing", "error"])
      .order("created_at", { ascending: true }),
    "load the material",
  );
  const list = materials ?? [];
  const summary: ExtractSummary = { read: 0, failed: 0 };
  if (list.length === 0) return summary;

  let finished = 0;
  await runPool(list, EXTRACT_CONCURRENCY, async (material, _i, started) => {
    started();
    await ctx.report(2 + Math.round((18 * finished) / list.length), `Reading ${material.file_name}`);
    await admin.from("materials").update({ status: "processing", error: null }).eq("id", material.id);
    try {
      const { text } = await extractMaterial(admin, material);
      const { error } = await admin
        .from("materials")
        .update({ status: "ready", error: null, content_text: text, char_count: text.length })
        .eq("id", material.id);
      if (error) throw new ExtractionError("The text was read but couldn't be saved. Try again.");
      summary.read++;
    } catch (error) {
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
      finished++;
    }
  });
  return summary;
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

type SectionRow = { position: number; topic_id: string; status: string };

export async function buildSet(ctx: JobContext): Promise<JobOutcome> {
  const { admin, job } = ctx;
  const setId = job.set_id;
  const continueFrom = job.options?.[CONTINUE_OPTION] as ContinueFrom | undefined;

  let set = await loadSet(admin, setId);
  await admin.from("study_sets").update({ status: "building" }).eq("id", setId);

  // 1. Extract new (or previously failed) material.
  let extract: ExtractSummary = { read: 0, failed: carried(job, FILES_FAILED_OPTION) };
  if (!continueFrom) {
    await ctx.report(2, "Reading your material");
    extract = await extractPending(ctx, setId);
  }
  const carry = (cards: number) => ({ [CARDS_ADDED_OPTION]: cards, [FILES_FAILED_OPTION]: extract.failed });

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
        system,
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

    await must(admin.from("study_sets").update({ topics }).eq("id", setId), "save the topics");
    set = { ...set, topics };
    // From here on, a retry of this job picks up at the sections.
    job.options = { ...(job.options ?? {}), [CONTINUE_OPTION]: "sections" };
    await admin.from("jobs").update({ options: job.options }).eq("id", job.id).eq("status", "running");

    // One placeholder section per topic so the guide fills in live; drop the rest.
    await must(
      admin.from("guide_sections").upsert(
        topics.map((t, position) => ({
          user_id: job.user_id,
          set_id: setId,
          position,
          topic_id: t.id,
          title: t.title,
          content_md: "",
          status: "pending",
        })),
        { onConflict: "set_id,position" },
      ),
      "save the guide outline",
    );
    await must(
      admin.from("guide_sections").delete().eq("set_id", setId).gte("position", topics.length),
      "tidy the guide",
    );
  }

  // 4. Sections and cards, 3 at a time.
  const sections = await must<SectionRow[] | null>(
    admin.from("guide_sections").select("position, topic_id, status").eq("set_id", setId).order("position"),
    "load the guide",
  );
  const readyTopics = new Set((sections ?? []).filter((s) => s.status === "ready").map((s) => s.topic_id));
  const todo = topics.map((topic, index) => ({ topic, index })).filter(({ topic }) => !readyTopics.has(topic.id));

  const existingTerms = await selectAllTerms(admin, setId);
  const seenTerms = new Set(existingTerms.map(termKey));
  const promptTerms = existingTerms.slice(0, TERMS_IN_PROMPT);
  const last = await must<Array<{ position: number }> | null>(
    admin.from("cards").select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1),
    "load the flashcards",
  );
  let nextPosition = (last?.[0]?.position ?? -1) + 1;

  let readyCount = readyTopics.size;
  let attempted = 0;
  let newCards = continueFrom ? carried(job, CARDS_ADDED_OPTION) : 0;
  let cardSaveFailures = 0;
  const failed: Array<{ title: string; error: unknown }> = [];
  const unfinished: string[] = [];
  const total = topics.length;
  const progressNow = () => 30 + Math.round((68 * readyCount) / Math.max(1, total));

  await runPool(
    todo,
    SECTION_CONCURRENCY,
    async ({ topic, index }, _i, started) => {
      attempted++;
      await ctx.report(progressNow(), `Writing ${topic.title} (${index + 1} of ${total})`);
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
        failed.push({ title: topic.title, error });
        await admin
          .from("guide_sections")
          .update({ status: "error", content_md: "" })
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
    await admin.from("study_sets").update({ status: "error" }).eq("id", setId);
    const first = failed[0]?.error;
    throw new JobError(
      first instanceof AiRefusalError
        ? "Claude couldn't write this study guide. Try rebuilding, or check that the material is course content."
        : `The study guide couldn't be written. ${first ? readableError(first) : "Try again in a minute."}`,
    );
  }
  await must(admin.from("study_sets").update({ status: "ready" }).eq("id", setId), "finish the study set");

  const parts = [`Built ${plural(total, "topic")} and ${plural(newCards, "new flashcard")}.`];
  if (failed.length > 0) {
    parts.push(
      `${failed.length === 1 ? "One section" : `${failed.length} sections`} couldn't be written (${quoteList(
        failed.map((f) => f.title),
      )}). Rebuild to try again.`,
    );
  }
  if (cardSaveFailures > 0) parts.push(`${plural(cardSaveFailures, "flashcard")} couldn't be saved.`);
  if (extract.failed > 0) {
    parts.push(`${plural(extract.failed, "file")} couldn't be read. Check the material list.`);
  }
  if (context.truncated) {
    parts.push("Your material was very long, so some of it was left out. Splitting it into smaller sets helps.");
  }
  return { kind: "done", message: parts.join(" ") };
}
