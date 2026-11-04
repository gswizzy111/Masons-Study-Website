// Claude picks one YouTube search per topic, tuned to the learning profile.
// Relative imports only and no Next-only modules (see docs/ARCHITECTURE.md
// section 2). Model, thinking, effort and fallback rules: section 7.
import * as z from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { LearningProfile, Topic } from "../types";
import { FALLBACK_BETA, MODEL, assertNotRefused, getAnthropic, textOf } from "./client";
import { describeLearningProfile } from "./learning-profile";

export type VideoQuery = {
  topic_id: string;
  /** A YouTube search, 4-9 words. */
  query: string;
  /** One sentence on what to look for while watching ("" for fallbacks). */
  reason: string;
  /** True when this came from the simple fallback, not from Claude. */
  fallback?: boolean;
};

export type SuggestVideoQueriesInput = {
  setTitle: string;
  topics: Topic[];
  profile: LearningProfile | null | undefined;
  /** Cancels the Claude call. */
  signal?: AbortSignal;
  /** Per-attempt timeout for the Claude call. Default 25 s. */
  timeoutMs?: number;
};

// Kept free of length/count constraints: structured outputs support only a
// subset of JSON Schema, so limits are enforced in code after parsing.
const VideoQueriesSchema = z.object({
  suggestions: z.array(
    z.object({
      topic_id: z.string().describe("The topic's id, exactly as given (for example t1)."),
      query: z
        .string()
        .describe("The YouTube search: 4 to 9 words, specific and searchable."),
      reason: z
        .string()
        .describe("One plain sentence on what to look for or pay attention to while watching."),
    }),
  ),
});

const MAX_SUMMARY_CHARS = 400;
const MAX_QUERY_WORDS = 10;
const MAX_QUERY_CHARS = 120;
const MAX_REASON_CHARS = 280;

/** Search-style guidance from the learning profile. */
function searchStyleHints(profile: LearningProfile | null | undefined): string[] {
  const p = profile ?? {};
  const hints: string[] = [];
  const explain = new Set(p.explain_with ?? []);
  const goals = new Set(p.goals ?? []);

  if (explain.has("visual_descriptions")) {
    hints.push(
      'They learn well from visuals: favor animations and diagram walkthroughs (words like "animation" or "diagram explained").',
    );
  }
  if (goals.has("mcat")) {
    hints.push(
      'They are preparing for the MCAT: for topics the MCAT tests, favor MCAT-style review videos (include "MCAT").',
    );
  }
  if (goals.has("usmle") || p.level === "med") {
    hints.push(
      'They are in or near medical school: for topics with clinical weight, favor board-style review (words like "USMLE" or "Step 1") or "clinical" explanations.',
    );
  }
  if (explain.has("clinical") && !goals.has("usmle")) {
    hints.push('They like clinical connections: where it fits, favor videos that tie the topic to disease ("clinical").');
  }
  if (p.depth === "deep") {
    hints.push('They like depth: favor full lecture-length explanations (words like "lecture" or "full explanation").');
  } else if (p.depth === "concise") {
    hints.push('They like it short: favor short explainers (words like "in 5 minutes" or "quick explainer").');
  }
  if (explain.has("step_by_step")) {
    hints.push('They like mechanisms broken down: favor step-by-step walkthroughs ("step by step").');
  }
  if (explain.has("examples") || p.approach === "details_first") {
    hints.push('They learn from concrete examples: favor worked examples where the topic has calculations or problems.');
  }
  if (hints.length === 0) {
    hints.push("No strong format preference: favor clear, well-made explainer videos.");
  }
  return hints;
}

function systemPrompt(profile: LearningProfile | null | undefined): string {
  return [
    "You choose YouTube searches that help one student understand the topics in their study set. For each topic you write the single search most likely to surface a great explainer video for that topic, and one sentence on what to watch for.",
    "",
    "About the student:",
    describeLearningProfile(profile),
    "",
    "What kind of videos suit them:",
    ...searchStyleHints(profile).map((h) => `- ${h}`),
    "",
    "Rules for each search:",
    "- Exactly one entry per topic, using the topic's id exactly as given. Cover every topic.",
    '- 4 to 9 words. Name the exact process, structure, molecule or mechanism the topic is about, the way a good video title would (for example "electron transport chain animation proton gradient" or "loop of Henle countercurrent multiplier explained"). Never vague phrases like "biology help" or "study tips".',
    "- Aim at the part of the topic that matters most, using its summary. If a topic is broad, search for its core idea.",
    "- Add at most two style words from the guidance above, only where they fit the topic. The subject words come first.",
    "- No quotation marks, hashtags, channel names, years or search operators.",
    "",
    "Rules for each reason:",
    '- One plain sentence, under 25 words, telling the student what to look for or pay attention to while watching (for example "Watch how protons flow back through ATP synthase and why that step makes most of the ATP.").',
    '- Write to the student as "you" or as an instruction. Do not start with "This video". No em dashes.',
  ].join("\n");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function userPrompt(setTitle: string, topics: Topic[]): string {
  const lines = topics.map((t) => {
    const summary = (t.summary ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SUMMARY_CHARS);
    return `<topic id="${escapeAttr(t.id)}" title="${escapeAttr(t.title)}">${summary}</topic>`;
  });
  return [
    `Study set: ${setTitle.trim() || "Untitled set"}`,
    "",
    "<topics>",
    ...lines,
    "</topics>",
    "",
    `Write one YouTube search and reason for each of these ${topics.length} topics.`,
  ].join("\n");
}

/** Cleans a model-written query into plain search words. "" if unusable. */
export function cleanQuery(raw: string): string {
  const words = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/["“”«»#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, MAX_QUERY_WORDS);
  const query = words.join(" ").slice(0, MAX_QUERY_CHARS).trim();
  return words.length >= 2 ? query : "";
}

/** One sentence, no em dashes (visible copy rule), capped. */
export function cleanReason(raw: string): string {
  let text = raw
    .replace(/\s+/g, " ")
    .replace(/\s*—\s*/g, ", ")
    .trim();
  if (text.length > MAX_REASON_CHARS) {
    const cut = text.slice(0, MAX_REASON_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    text = `${cut.slice(0, lastSpace > 0 ? lastSpace : cut.length).replace(/[,;:]$/, "")}…`;
  }
  return text;
}

const SET_TITLE_PREFIX =
  /^(?:(?:exam|midterm|final|quiz|test|unit|chapter|ch\.?|module|week|lecture|lec\.?|part|block)\s*[\w.]*\s*)+[:\-–—|.]\s*/i;

/** The set title without "Exam 2:" style prefixes, for search text. */
export function searchableSetTitle(setTitle: string): string {
  const trimmed = setTitle.replace(/\s+/g, " ").trim();
  const stripped = trimmed.replace(SET_TITLE_PREFIX, "").trim();
  return (stripped || trimmed).replace(/["#]+/g, "").trim();
}

/** The deterministic search used without Claude: "<topic> explained <set title>". */
export function fallbackVideoQuery(topic: Pick<Topic, "id" | "title">, setTitle: string): VideoQuery {
  const topicTitle = topic.title.replace(/\s+/g, " ").replace(/["#]+/g, "").trim() || "Biology";
  const setPart = searchableSetTitle(setTitle);
  const sameAsTopic =
    !setPart ||
    setPart.toLowerCase() === topicTitle.toLowerCase() ||
    topicTitle.toLowerCase().includes(setPart.toLowerCase());
  const query = `${topicTitle} explained${sameAsTopic ? "" : ` ${setPart}`}`.slice(0, MAX_QUERY_CHARS).trim();
  return { topic_id: topic.id, query, reason: "", fallback: true };
}

/**
 * One YouTube search per topic (in topic order), picked by Claude for this
 * student. Topics Claude skipped or answered badly get the fallback search.
 * Throws AiNotConfiguredError without a key, AiRefusalError when declined,
 * and SDK errors otherwise (use friendlyAiError for the message).
 */
export async function suggestVideoQueries(input: SuggestVideoQueriesInput): Promise<VideoQuery[]> {
  const topics = input.topics.filter((t) => t && typeof t.id === "string" && t.id.trim());
  if (topics.length === 0) return [];

  const client = getAnthropic();
  const format = betaZodOutputFormat(VideoQueriesSchema);

  const message = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "low",
        format: { type: format.type, schema: format.schema },
      },
      system: systemPrompt(input.profile),
      messages: [{ role: "user", content: userPrompt(input.setTitle, topics) }],
    },
    { signal: input.signal, timeout: input.timeoutMs ?? 25_000, maxRetries: 1 },
  );

  assertNotRefused(message);

  let parsed: z.infer<typeof VideoQueriesSchema> | null = null;
  try {
    parsed = format.parse(textOf(message));
  } catch {
    parsed = null;
  }

  const byId = new Map<string, VideoQuery>();
  for (const s of parsed?.suggestions ?? []) {
    const id = s.topic_id.trim();
    if (byId.has(id)) continue;
    const query = cleanQuery(s.query);
    if (!query) continue;
    byId.set(id, { topic_id: id, query, reason: cleanReason(s.reason) });
  }

  return topics.map((t) => byId.get(t.id) ?? fallbackVideoQuery(t, input.setTitle));
}
