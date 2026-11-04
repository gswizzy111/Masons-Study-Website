// Card progress: level transitions, spaced repetition and the database write.
// Relative imports only and no Next-only modules (lib/learn is bundled
// outside Next too). See docs/ARCHITECTURE.md section 4.
//
// Levels: 0 not studied, 1 still learning, 2 familiar, 3 mastered.
//
// Transitions (`applyAnswer`):
// - any wrong answer -> level 1, streak 0. A mastered card that is missed
//   (a lapse) drops to 1, loses its review date and its ease goes down 0.2
//   (min 1.3). Misses before a card is mastered leave ease alone, so
//   missing a new card a few times in one round doesn't shorten its
//   reviews for good.
// - mc correct -> at least 2 (multiple choice never masters a card).
// - written, review or test correct -> 3 if the card was already 2+, else 2.
// - flashcard (self-report) correct -> 2 (a mastered card stays mastered).
//
// Spaced repetition once mastered:
// - reaching level 3: interval 1 day, due in 1 day.
// - a correct answer on a mastered card that is due: interval x ease, then
//   ease +0.1 (max 3.0), due again after the new interval.
// - a correct answer on a mastered card that is not due yet keeps its
//   schedule (studying early should not push the review weeks out).
// - with an exam date ahead, a review is never scheduled more than half
//   the time left before the exam (at least 1 day), so every card comes
//   back before the exam. The stored interval doesn't grow while capped
//   (and ease doesn't either), so the long schedule picks up after the
//   exam where it left off.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardProgress, MasteryLevel } from "../types";

export type AnswerMode = "mc" | "written" | "flashcard" | "test" | "review";

const DAY_MS = 24 * 60 * 60 * 1000;

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const DEFAULT_EASE = 2.5;
/** Longest gap between reviews. */
export const MAX_INTERVAL_DAYS = 365;

/** The progress fields the transition reads and writes. */
export type ProgressState = Pick<
  CardProgress,
  | "level"
  | "streak"
  | "times_seen"
  | "times_correct"
  | "times_wrong"
  | "interval_days"
  | "ease"
  | "due_at"
  | "last_result"
  | "last_seen_at"
>;

/** A card nobody has answered yet. */
export function defaultProgressState(): ProgressState {
  return {
    level: 0,
    streak: 0,
    times_seen: 0,
    times_correct: 0,
    times_wrong: 0,
    interval_days: 0,
    ease: DEFAULT_EASE,
    due_at: null,
    last_result: null,
    last_seen_at: null,
  };
}

function clampLevel(n: number): MasteryLevel {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 3) return 3;
  return Math.round(n) as MasteryLevel;
}

function num(value: unknown, fallback: number): number {
  // numeric columns can arrive as strings from PostgREST.
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampEase(n: number): number {
  return round2(Math.min(MAX_EASE, Math.max(MIN_EASE, n)));
}

/** Reads a stored row (or nothing) into a clean ProgressState. */
export function normalizeProgress(row: Partial<ProgressState> | null | undefined): ProgressState {
  const base = defaultProgressState();
  if (!row) return base;
  return {
    level: clampLevel(num(row.level, 0)),
    streak: Math.max(0, Math.floor(num(row.streak, 0))),
    times_seen: Math.max(0, Math.floor(num(row.times_seen, 0))),
    times_correct: Math.max(0, Math.floor(num(row.times_correct, 0))),
    times_wrong: Math.max(0, Math.floor(num(row.times_wrong, 0))),
    interval_days: Math.max(0, num(row.interval_days, 0)),
    ease: clampEase(num(row.ease, DEFAULT_EASE)),
    due_at: row.due_at ?? null,
    last_result: row.last_result ?? null,
    last_seen_at: row.last_seen_at ?? null,
  };
}

/** The level a correct answer in `mode` moves a card to. */
export function levelAfterCorrect(prev: MasteryLevel, mode: AnswerMode): MasteryLevel {
  switch (mode) {
    case "mc":
      return prev >= 2 ? prev : 2;
    case "flashcard":
      return prev >= 3 ? 3 : 2;
    case "written":
    case "review":
    case "test":
      return prev >= 2 ? 3 : 2;
  }
}

/** Start of the exam day (local time) in ms, or NaN without a valid date. */
function examStartMs(examDate: string | null | undefined): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(examDate?.trim() ?? "");
  if (!match) return Number.NaN;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

/** Longest gap (days) allowed before the next review, given the exam date. Infinity without one ahead. */
export function reviewCapDays(examDate: string | null | undefined, now: Date = new Date()): number {
  const examMs = examStartMs(examDate);
  const left = examMs - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, left / DAY_MS / 2);
}

export type ApplyOptions = {
  /** The set's exam date (YYYY-MM-DD). Reviews are kept before it. */
  examDate?: string | null;
};

function isPastDue(dueAt: string | null, now: Date): boolean {
  if (!dueAt) return true;
  const t = new Date(dueAt).getTime();
  return Number.isNaN(t) || t <= now.getTime();
}

/**
 * The new progress after one answer. Pure: same input, same output.
 * `prev` may be null for a card that was never answered.
 */
export function applyAnswer(
  prev: Partial<ProgressState> | null | undefined,
  correct: boolean,
  mode: AnswerMode,
  now: Date = new Date(),
  options: ApplyOptions = {},
): ProgressState {
  const p = normalizeProgress(prev);
  const nowIso = now.toISOString();
  const counters = {
    times_seen: p.times_seen + 1,
    times_correct: p.times_correct + (correct ? 1 : 0),
    times_wrong: p.times_wrong + (correct ? 0 : 1),
    last_result: (correct ? "correct" : "wrong") as "correct" | "wrong",
    last_seen_at: nowIso,
  };

  if (!correct) {
    return {
      ...counters,
      level: 1,
      streak: 0,
      // A missed card starts its review schedule over once it is mastered again.
      interval_days: 0,
      // Only a lapse (a mastered card missed) makes its reviews come sooner.
      ease: p.level === 3 ? clampEase(p.ease - 0.2) : p.ease,
      due_at: null,
    };
  }

  const level = levelAfterCorrect(p.level, mode);
  let interval = p.interval_days;
  let ease = p.ease;
  let dueAt: string | null = level === 3 ? p.due_at : null;

  if (level === 3) {
    const cap = reviewCapDays(options.examDate, now);
    const dueIn = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
    if (p.level < 3 || interval <= 0) {
      // Just mastered: first review tomorrow.
      interval = 1;
      dueAt = dueIn(Math.min(1, cap));
    } else if (isPastDue(p.due_at, now)) {
      // A due review answered correctly: stretch the gap.
      const next = round2(Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval) * ease));
      if (next > cap) {
        // The exam comes first: review before it, and hold the schedule there.
        dueAt = dueIn(cap);
        interval = round2(Math.max(interval, cap));
      } else {
        interval = next;
        ease = clampEase(ease + 0.1);
        dueAt = dueIn(interval);
      }
    } else if (Number.isFinite(cap)) {
      // Mastered and not due yet: keep the schedule, unless it runs past the exam.
      const capAt = now.getTime() + cap * DAY_MS;
      const dueMs = dueAt ? new Date(dueAt).getTime() : Number.NaN;
      if (!Number.isFinite(dueMs) || dueMs > capAt) dueAt = new Date(capAt).toISOString();
    }
  } else {
    interval = 0;
  }

  return {
    ...counters,
    level,
    streak: p.streak + 1,
    interval_days: interval,
    ease,
    due_at: dueAt,
  };
}

const PROGRESS_COLUMNS =
  "card_id, user_id, set_id, level, streak, times_seen, times_correct, times_wrong, interval_days, ease, due_at, last_result, last_seen_at, updated_at";

function toCardProgress(row: Record<string, unknown>): CardProgress {
  const p = normalizeProgress(row as Partial<ProgressState>);
  return {
    ...p,
    card_id: String(row.card_id),
    user_id: String(row.user_id),
    set_id: String(row.set_id),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

/**
 * Records one answer for a card: reads its progress row (or the defaults),
 * applies the transition, upserts `card_progress` and stamps
 * `study_sets.last_studied_at`. Returns the saved row, or null if the read
 * or the write failed (never throws).
 *
 * `examDate` is the set's exam date (reviews are kept before it). Pass it
 * when you have it (null for none); when it is left out, it is read from
 * the set.
 *
 * Works with the browser or server client (RLS applies as the signed-in
 * user). With the service role, the row's user_id must already exist.
 */
export async function recordAnswer(
  supabase: SupabaseClient,
  input: { cardId: string; setId: string; correct: boolean; mode: AnswerMode; examDate?: string | null },
): Promise<CardProgress | null> {
  const { cardId, setId, correct, mode } = input;
  try {
    const [progressRead, setRead] = await Promise.all([
      supabase.from("card_progress").select(PROGRESS_COLUMNS).eq("card_id", cardId).maybeSingle(),
      input.examDate === undefined
        ? supabase.from("study_sets").select("exam_date").eq("id", setId).maybeSingle()
        : null,
    ]);
    const { data: existing, error: readError } = progressRead;
    if (readError) return null;
    const examDate =
      input.examDate !== undefined
        ? input.examDate
        : ((setRead?.data as { exam_date?: string | null } | null)?.exam_date ?? null);

    const now = new Date();
    const next = applyAnswer(existing as Partial<ProgressState> | null, correct, mode, now, { examDate });

    const owner = (existing as { user_id?: unknown } | null)?.user_id;
    const row = {
      card_id: cardId,
      set_id: setId,
      // New rows take user_id from auth.uid(); keep the owner on updates.
      ...(typeof owner === "string" ? { user_id: owner } : {}),
      ...next,
    };

    const { data, error } = await supabase
      .from("card_progress")
      .upsert(row, { onConflict: "card_id" })
      .select(PROGRESS_COLUMNS)
      .maybeSingle();
    if (error || !data) return null;

    // Best effort: the dashboard sorts by it, but the answer is already saved.
    await supabase.from("study_sets").update({ last_studied_at: now.toISOString() }).eq("id", setId);

    return toCardProgress(data as Record<string, unknown>);
  } catch {
    return null;
  }
}
