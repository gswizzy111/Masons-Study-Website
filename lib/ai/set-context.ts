// Builds the material context block for a study set. Works with the user's
// server client (RLS) or the service-role client (job runner).
// Relative imports only (bundled by the Netlify function too).
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_TOPICS } from "./prompts";
import type { Topic } from "../types";

/** Longest topic title and summary passed on to prompts. */
export const TOPIC_TITLE_MAX_CHARS = 200;
export const TOPIC_SUMMARY_MAX_CHARS = 600;
const TOPIC_ID_MAX_CHARS = 100;

function clipText(value: string, max: number): string {
  const t = value.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * `study_sets.topics` as stored, made safe to prompt with: at most
 * MAX_TOPICS (the most a build ever writes), unique string ids, titles and
 * summaries clipped. Users can write this column directly, so every prompt
 * and job reads topics through here.
 */
export function sanitizeTopics(value: unknown): Topic[] {
  if (!Array.isArray(value)) return [];
  const out: Topic[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (out.length >= MAX_TOPICS) break;
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id.trim().slice(0, TOPIC_ID_MAX_CHARS) : "";
    const title = typeof t.title === "string" ? clipText(t.title, TOPIC_TITLE_MAX_CHARS) : "";
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const summary = typeof t.summary === "string" ? clipText(t.summary, TOPIC_SUMMARY_MAX_CHARS) : "";
    out.push({ id, title, summary });
  }
  return out;
}

export type SetContext = {
  title: string;
  topics: Topic[];
  /** Materials (and guide sections when asked), ready to put in a prompt. */
  text: string;
  /** True when some text was cut to fit maxChars. Callers must say so. */
  truncated: boolean;
  /** Length of `text`. */
  charCount: number;
  /** Number of ready materials with text. */
  materialCount: number;
};

export type SetContextOptions = {
  /** Append the ready study-guide sections after the materials. */
  includeGuide?: boolean;
  /** Upper bound on `text` length. Default 600000. */
  maxChars?: number;
};

const DEFAULT_MAX_CHARS = 600_000;
const CUT_MARKER = "\n[... cut to fit; the rest of this item was left out ...]";

type Block = { open: string; body: string; close: string };

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ");
}

/** Keep material text from closing its own wrapper. */
function neutralize(body: string, tag: string): string {
  return body.replace(new RegExp(`</${tag}>`, "gi"), `</ ${tag}>`);
}

/**
 * Share `budget` characters across bodies so short ones stay whole and long
 * ones are cut evenly (water-filling). Returns the allowed length per body.
 */
function allocate(lengths: number[], budget: number): number[] {
  const order = lengths.map((len, i) => ({ len, i })).sort((a, b) => a.len - b.len);
  const out = new Array<number>(lengths.length).fill(0);
  let remaining = Math.max(0, budget);
  let left = order.length;
  for (const { len, i } of order) {
    const share = Math.floor(remaining / left);
    const give = Math.min(len, share);
    out[i] = give;
    remaining -= give;
    left -= 1;
  }
  return out;
}

/**
 * Loads a set's title, topics and one text block: each ready material's
 * `content_text` wrapped in `<material name="...">`, then (with
 * `includeGuide`) each ready guide section in `<guide_section title="...">`.
 * When the total is over `maxChars`, long items are cut evenly and
 * `truncated` is true. Topics go through sanitizeTopics. Throws if the set
 * can't be read.
 */
export async function loadSetContext(
  supabase: SupabaseClient,
  setId: string,
  opts: SetContextOptions = {},
): Promise<SetContext> {
  const maxChars = Math.max(1_000, opts.maxChars ?? DEFAULT_MAX_CHARS);

  const { data: set, error: setError } = await supabase
    .from("study_sets")
    .select("title, topics")
    .eq("id", setId)
    .maybeSingle();
  if (setError) throw new Error(`Couldn't load the study set: ${setError.message}`);
  if (!set) throw new Error("Study set not found.");

  const { data: materials, error: materialsError } = await supabase
    .from("materials")
    .select("file_name, content_text, created_at")
    .eq("set_id", setId)
    .eq("status", "ready")
    .order("created_at", { ascending: true });
  if (materialsError) throw new Error(`Couldn't load materials: ${materialsError.message}`);

  const blocks: Block[] = [];
  let materialCount = 0;
  for (const m of materials ?? []) {
    const body = (m.content_text as string | null)?.trim();
    if (!body) continue;
    materialCount += 1;
    blocks.push({
      open: `<material name="${attr(String(m.file_name ?? "Untitled"))}">\n`,
      body: neutralize(body, "material"),
      close: "\n</material>",
    });
  }

  if (opts.includeGuide) {
    // Written sections, including ones being rewritten right now (a rebuild
    // keeps the previous text until the new text is in).
    const { data: sections, error: guideError } = await supabase
      .from("guide_sections")
      .select("title, topic_id, content_md, position")
      .eq("set_id", setId)
      .in("status", ["ready", "pending", "writing"])
      .neq("content_md", "")
      .order("position", { ascending: true });
    if (guideError) throw new Error(`Couldn't load the study guide: ${guideError.message}`);
    for (const s of sections ?? []) {
      const body = (s.content_md as string | null)?.trim();
      if (!body) continue;
      blocks.push({
        open: `<guide_section title="${attr(String(s.title ?? ""))}" topic_id="${attr(String(s.topic_id ?? ""))}">\n`,
        body: neutralize(body, "guide_section"),
        close: "\n</guide_section>",
      });
    }
  }

  const separator = "\n\n";
  const overhead =
    blocks.reduce((n, b) => n + b.open.length + b.close.length, 0) +
    Math.max(0, blocks.length - 1) * separator.length;
  const totalBody = blocks.reduce((n, b) => n + b.body.length, 0);

  let truncated = false;
  let parts: string[];
  if (overhead + totalBody <= maxChars) {
    parts = blocks.map((b) => b.open + b.body + b.close);
  } else {
    truncated = true;
    const budget = maxChars - overhead - blocks.length * CUT_MARKER.length;
    const allowed = allocate(
      blocks.map((b) => b.body.length),
      budget,
    );
    parts = blocks.map((b, i) => {
      const keep = allowed[i];
      if (keep >= b.body.length) return b.open + b.body + b.close;
      return b.open + b.body.slice(0, keep) + CUT_MARKER + b.close;
    });
  }

  const text = parts.join(separator);
  const topics = sanitizeTopics(set.topics);
  return {
    title: String(set.title ?? ""),
    topics,
    text,
    truncated,
    charCount: text.length,
    materialCount,
  };
}
