// Server-side reads for the dashboard and set pages. Uses the request's
// Supabase client (RLS applies). Import from Server Components only.
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { bucketOf, isDue, type MasterySummary, type ProgressLike } from "@/lib/mastery";
import type { StudySet } from "@/lib/types";
import type { CourseLite } from "@/components/sets/course-colors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** The API returns at most this many rows per request. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Reads every row of a query, a page at a time (the API caps a response at
 * 1,000 rows). `page(from, to)` must apply a stable order.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PageResult<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const from = i * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export type SetWithCourse = StudySet & { course: CourseLite | null };

/**
 * One study set (with its course) for the signed-in user, or null when it
 * doesn't exist or isn't theirs. Deduplicated per request, so the set
 * layout, its pages and generateMetadata share one query.
 */
export const getSet = cache(async (setId: string): Promise<SetWithCourse | null> => {
  if (!isUuid(setId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("study_sets")
    .select("*, course:courses(id, name, color)")
    .eq("id", setId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as StudySet & { course: CourseLite | CourseLite[] | null };
  const course = Array.isArray(row.course) ? (row.course[0] ?? null) : row.course;
  return { ...row, topics: Array.isArray(row.topics) ? row.topics : [], course };
});

export type GuideState = {
  /** Guide sections that have text (ready, or being rewritten with their earlier text). */
  writtenSections: number;
  /** Sections a build couldn't write (status 'error', no text). */
  failedSections: number;
  /** Materials that were read and can be studied from. */
  readyMaterials: number;
};

/**
 * What the set's guide and material look like right now, for build and
 * tutor wording: whether a guide exists (a later build updates it), which
 * sections failed, and whether Claude has any material to read. Never
 * throws: on a read error it reports nothing written, which only changes
 * wording. Deduplicated per request (the set layout and overview share it).
 */
export const getGuideState = cache(async (setId: string): Promise<GuideState> => {
  const empty: GuideState = { writtenSections: 0, failedSections: 0, readyMaterials: 0 };
  if (!isUuid(setId)) return empty;
  const supabase = await createClient();
  const [written, failed, materials] = await Promise.all([
    supabase
      .from("guide_sections")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId)
      .neq("content_md", ""),
    supabase
      .from("guide_sections")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId)
      .eq("status", "error"),
    supabase
      .from("materials")
      .select("id", { count: "exact", head: true })
      .eq("set_id", setId)
      .eq("status", "ready"),
  ]);
  return {
    writtenSections: written.error ? 0 : (written.count ?? 0),
    failedSections: failed.error ? 0 : (failed.count ?? 0),
    readyMaterials: materials.error ? 0 : (materials.count ?? 0),
  };
});

/** The user's courses, by name. */
export async function getCourses(supabase: SupabaseClient): Promise<CourseLite[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, color")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CourseLite[];
}

/**
 * A mastery summary from a card count plus the progress rows of studied
 * cards. Cards without a progress row count as not studied. Matches
 * lib/mastery's `summarize` without loading every card.
 */
export function summaryFromProgress(
  totalCards: number,
  progress: readonly Pick<ProgressLike, "level" | "due_at" | "last_seen_at">[],
  now: Date = new Date(),
): MasterySummary {
  let learning = 0;
  let familiar = 0;
  let mastered = 0;
  let due = 0;
  for (const p of progress) {
    const bucket = bucketOf(p);
    if (bucket === "mastered") mastered += 1;
    else if (bucket === "learning") learning += 1;
    if (p.level === 2) familiar += 1;
    if (isDue(p, now)) due += 1;
  }
  const total = Math.max(totalCards, learning + mastered);
  const not_studied = Math.max(0, total - learning - mastered);
  return {
    total,
    not_studied,
    learning,
    familiar,
    mastered,
    due,
    percent: total > 0 ? Math.round((100 * mastered) / total) : 0,
  };
}
