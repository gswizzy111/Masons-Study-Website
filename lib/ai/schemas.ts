// Structured-output schemas for the pipeline, the normalizers that turn a
// reply into clean rows, and the structured Claude call they share.
// Relative imports only and no Next-only modules: the Netlify background
// function bundles this file outside Next.
//
// The JSON schemas sent to Claude carry the counts (3-12 topics, 8-25 cards,
// 4-5 choices) as guidance; the normalizers enforce them leniently afterwards
// (trim, drop bad items, cap lengths) so one slightly-off reply never fails a
// whole section.
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { assertNotRefused, FALLBACK_BETA, getAnthropic, MODEL, textOf } from "./client";
import { MAX_CARDS, MAX_TOPICS } from "./prompts";
import type { Topic } from "../types";

// ---------------------------------------------------------------------------
// Schemas (sent to Claude as output_config.format)
// ---------------------------------------------------------------------------

export const OutlineSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().describe('Topic id: "t" followed by a number, e.g. "t1".'),
        title: z.string().describe("2 to 6 words, sentence case."),
        summary: z.string().describe("One or two sentences on what the topic covers."),
      }),
    )
    .min(1)
    .describe("3 to 12 topics in teaching order."),
});
export type OutlineOutput = z.infer<typeof OutlineSchema>;

export const SectionSchema = z.object({
  content_md: z.string().describe("The study guide section in GitHub-flavored Markdown."),
  cards: z
    .array(
      z.object({
        term: z.string().describe("Front of the card: short term or question."),
        definition: z.string().describe("Back of the card: precise and self-contained."),
        hint: z.string().describe("A short recall cue, or an empty string."),
      }),
    )
    .min(1)
    .describe("8 to 25 flashcards for this topic."),
});
export type SectionOutput = z.infer<typeof SectionSchema>;

export const ExamBatchSchema = z.object({
  questions: z
    .array(
      z.object({
        topic_id: z.string().describe("One of the given topic ids."),
        stem: z.string().describe("The question, with any vignette or data."),
        choices: z.array(z.string()).min(1).describe("4 or 5 answer choices, plain text, no letters."),
        answer_index: z.number().int().describe("0-based index of the correct choice."),
        explanation: z.string().describe("Why the answer is right and each other choice is wrong."),
        difficulty: z.enum(["easy", "medium", "hard"]),
      }),
    )
    .min(1),
});
export type ExamBatchOutput = z.infer<typeof ExamBatchSchema>;

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** No em dashes in anything we show (house style). */
function noEmDash(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");
}

/**
 * Clean topics: trimmed, at most 12, unique ids of the form tN. Ids that are
 * missing, malformed or already used get the next free number.
 */
export function normalizeOutline(output: OutlineOutput, reservedIds: string[] = []): Topic[] {
  const used = new Set<string>();
  const reserved = new Set(reservedIds);
  const topics: Topic[] = [];
  let next = 1;
  const taken = (id: string) => used.has(id);
  // Filled-in ids also skip `reservedIds` (ids old cards may still carry).
  const freeId = () => {
    while (taken(`t${next}`) || reserved.has(`t${next}`)) next++;
    return `t${next}`;
  };

  for (const raw of output.topics) {
    const title = clip(noEmDash(raw.title.replace(/\s+/g, " ")), 120);
    if (!title) continue;
    const summary = clip(noEmDash(raw.summary.replace(/\s+/g, " ")), 600);
    const candidate = raw.id.trim().toLowerCase();
    const id = /^t\d{1,4}$/.test(candidate) && !taken(candidate) ? candidate : null;
    topics.push({ id: id ?? "", title, summary });
    if (id) used.add(id);
    if (topics.length >= MAX_TOPICS) break;
  }
  // Fill in ids after the first pass so valid ids keep priority.
  for (const topic of topics) {
    if (!topic.id) {
      topic.id = freeId();
      used.add(topic.id);
    }
  }
  return topics;
}

export type CleanCard = { term: string; definition: string; hint: string | null };

/** Cards within the database limits, no blanks, no repeats within the reply. */
export function normalizeCards(cards: SectionOutput["cards"]): CleanCard[] {
  const seen = new Set<string>();
  const out: CleanCard[] = [];
  for (const card of cards) {
    const term = clip(noEmDash(card.term.replace(/\s+/g, " ")), 500);
    const definition = clip(noEmDash(card.definition), 4000);
    if (!term || !definition) continue;
    const key = termKey(term);
    if (seen.has(key)) continue;
    seen.add(key);
    const hint = clip(noEmDash(card.hint ?? ""), 1000);
    out.push({ term, definition, hint: hint || null });
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

/** The key cards are deduplicated by (lowercase, single-spaced term). */
export function termKey(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Guide Markdown with house style applied. */
export function normalizeSectionMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/ ?— ?/g, ", ")
    .trim();
}

export type CleanQuestion = {
  topic_id: string | null;
  stem: string;
  choices: string[];
  answer_index: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

const LETTER_PREFIX = /^\(?[A-Ea-e1-5][.):]\s+/;

/** Usable questions: 4-5 distinct choices, a valid answer, known topic or null. */
export function normalizeQuestions(output: ExamBatchOutput, topicIds: Set<string>): CleanQuestion[] {
  const out: CleanQuestion[] = [];
  for (const q of output.questions) {
    const stem = clip(noEmDash(q.stem), 6000);
    const explanation = noEmDash(q.explanation).trim();
    const choices = q.choices.map((c) => clip(noEmDash(c.replace(LETTER_PREFIX, "")), 1000));
    if (!stem || !explanation) continue;
    if (choices.length < 4 || choices.length > 5 || choices.some((c) => !c)) continue;
    if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) continue;
    if (!Number.isInteger(q.answer_index) || q.answer_index < 0 || q.answer_index >= choices.length) continue;
    out.push({
      topic_id: topicIds.has(q.topic_id) ? q.topic_id : null,
      stem,
      choices,
      answer_index: q.answer_index,
      explanation,
      difficulty: q.difficulty,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The structured call
// ---------------------------------------------------------------------------

/** Claude replied, but not in the requested shape (after one retry). */
export class StructuredOutputError extends Error {
  constructor(message = "Claude's reply came back in an unexpected shape. Try again.") {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export type StructuredCallOptions<S extends z.ZodType> = {
  schema: S;
  /** System blocks: instructions first, the cached material block last. */
  system: Anthropic.Beta.BetaTextBlockParam[];
  /** The task for this call (after the cached prefix). */
  prompt: string;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  /** Called once Claude starts answering (the prompt, and its cache, is in). */
  onStarted?: () => void;
  signal?: AbortSignal;
};

/**
 * One structured call through `client.beta.messages.stream` with the refusal
 * fallback beta. The JSON is validated with the zod schema here rather than by
 * the SDK, so a mid-stream fallback (text split over several blocks) still
 * parses. Throws AiRefusalError on a refusal (after the fallback also
 * declined), StructuredOutputError on a bad shape, or the SDK's errors.
 */
export async function callStructured<S extends z.ZodType>(opts: StructuredCallOptions<S>): Promise<z.infer<S>> {
  const client = getAnthropic();
  // The SDK's helper turns the zod schema into a strict JSON schema; keep only
  // the wire fields so the SDK doesn't try to parse the reply itself.
  const { type, schema } = betaZodOutputFormat(opts.schema);

  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let started = false;
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: opts.maxTokens,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: opts.effort, format: { type, schema } },
        system: opts.system,
        messages: [{ role: "user", content: opts.prompt }],
      },
      { signal: opts.signal },
    );
    if (opts.onStarted) {
      stream.on("streamEvent", (event) => {
        if (!started && event.type === "content_block_start") {
          started = true;
          opts.onStarted?.();
        }
      });
    }
    const message = await stream.finalMessage();
    assertNotRefused(message);

    if (message.stop_reason === "max_tokens") {
      lastProblem = "Claude's answer ran too long and was cut off.";
      continue;
    }
    const text = textOf(message).trim();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      lastProblem = "Claude's reply wasn't valid JSON.";
      continue;
    }
    const parsed = opts.schema.safeParse(json);
    if (parsed.success) return parsed.data;
    lastProblem = "Claude's reply was missing some fields.";
  }
  throw new StructuredOutputError(`${lastProblem} Try again.`);
}

// ---------------------------------------------------------------------------
// Concurrency with a warm cache
// ---------------------------------------------------------------------------

/**
 * Runs `worker` over `items`, `concurrency` at a time. The first item starts
 * alone; the others wait until it calls `started()` (its prompt, including
 * the cached material, has been read) or settles, so they read the cache
 * instead of each writing it. `shouldStart` is checked before each item; when
 * it returns false no new items start. Worker errors are the worker's to
 * handle: a throw stops nothing else but is rethrown at the end.
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number, started: () => void) => Promise<void>,
  shouldStart: () => boolean = () => true,
): Promise<void> {
  let openGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
  let cursor = 0;
  const errors: unknown[] = [];

  async function lane(laneIndex: number) {
    if (laneIndex > 0) await gate;
    try {
      while (cursor < items.length) {
        if (!shouldStart()) return;
        const index = cursor++;
        try {
          await worker(items[index], index, index === 0 ? openGate : () => undefined);
        } catch (error) {
          errors.push(error);
        } finally {
          if (index === 0) openGate();
        }
      }
    } finally {
      // Never leave the other lanes waiting.
      if (laneIndex === 0) openGate();
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: lanes }, (_, i) => lane(i)));
  if (errors.length) throw errors[0];
}
