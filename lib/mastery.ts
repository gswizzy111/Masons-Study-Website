// Mastery buckets and summaries. Pure functions, no I/O.
// Relative imports only (bundled by the Netlify function too).
import type { Card, CardProgress, Topic } from "./types";

/** The three buckets shown everywhere (colors are fixed per bucket). */
export type Bucket = "not_studied" | "learning" | "mastered";

/**
 * Card counts for a group of cards.
 * - `not_studied + learning + mastered === total` (use these for stacked bars).
 * - `familiar` is the level-2 part of `learning` (a subset, not a fourth bucket).
 * - `due` counts cards that need review now (see `isDue`).
 * - `percent` = round(100 * mastered / total), 0 when there are no cards.
 */
export type MasterySummary = {
  total: number;
  not_studied: number;
  learning: number;
  familiar: number;
  mastered: number;
  due: number;
  percent: number;
};

/** The progress fields these helpers read. A full CardProgress row works. */
export type ProgressLike = Pick<CardProgress, "card_id" | "level" | "due_at" | "last_seen_at">;

const DAY_MS = 24 * 60 * 60 * 1000;

/** none or level 0 -> not_studied, level 1-2 -> learning, level 3 -> mastered. */
export function bucketOf(p?: { level: number } | null): Bucket {
  const level = p?.level ?? 0;
  if (level >= 3) return "mastered";
  if (level >= 1) return "learning";
  return "not_studied";
}

function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * True when a card needs review now:
 * - mastered (level 3) and its `due_at` has arrived, or
 * - still learning (level 1-2) and not seen for a day or more.
 * Not-studied cards are never "due" (they are new, not review).
 */
export function isDue(
  p: Pick<CardProgress, "level" | "due_at" | "last_seen_at"> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!p) return false;
  const nowMs = now.getTime();
  if (p.level >= 3) {
    const due = timeOf(p.due_at);
    return due !== null && due <= nowMs;
  }
  if (p.level >= 1) {
    const seen = timeOf(p.last_seen_at);
    return seen === null || nowMs - seen >= DAY_MS;
  }
  return false;
}

function emptySummary(): MasterySummary {
  return { total: 0, not_studied: 0, learning: 0, familiar: 0, mastered: 0, due: 0, percent: 0 };
}

function finish(s: MasterySummary): MasterySummary {
  s.percent = s.total > 0 ? Math.round((100 * s.mastered) / s.total) : 0;
  return s;
}

function progressMap(progress: readonly ProgressLike[]): Map<string, ProgressLike> {
  const map = new Map<string, ProgressLike>();
  for (const p of progress) map.set(p.card_id, p);
  return map;
}

function add(s: MasterySummary, p: ProgressLike | undefined, now: Date): void {
  s.total += 1;
  const bucket = bucketOf(p);
  s[bucket] += 1;
  if (p && p.level === 2) s.familiar += 1;
  if (isDue(p, now)) s.due += 1;
}

/** Summary for a list of cards. Progress rows for other cards are ignored. */
export function summarize(
  cards: readonly Pick<Card, "id">[],
  progress: readonly ProgressLike[],
  now: Date = new Date(),
): MasterySummary {
  const byCard = progressMap(progress);
  const s = emptySummary();
  for (const card of cards) add(s, byCard.get(card.id), now);
  return finish(s);
}

/** The pseudo-topic for cards with no topic, or a topic the set no longer has. */
export const OTHER_TOPIC: Topic = {
  id: "other",
  title: "Other",
  summary: "Cards that are not linked to a topic.",
};

/**
 * One summary per topic, in topic order (topics with no cards included, with
 * zeros), then an "Other" entry (`id: 'other'`) for cards with no or unknown
 * `topic_id`, omitted when there are none.
 */
export function summarizeByTopic(
  topics: readonly Topic[],
  cards: readonly Pick<Card, "id" | "topic_id">[],
  progress: readonly ProgressLike[],
  now: Date = new Date(),
): Array<{ topic: Topic; summary: MasterySummary }> {
  const byCard = progressMap(progress);
  const byTopic = new Map<string, MasterySummary>();
  for (const topic of topics) {
    if (!byTopic.has(topic.id)) byTopic.set(topic.id, emptySummary());
  }
  const other = emptySummary();

  for (const card of cards) {
    const target = (card.topic_id && byTopic.get(card.topic_id)) || other;
    add(target, byCard.get(card.id), now);
  }

  const seen = new Set<string>();
  const result: Array<{ topic: Topic; summary: MasterySummary }> = [];
  for (const topic of topics) {
    if (seen.has(topic.id)) continue;
    seen.add(topic.id);
    result.push({ topic, summary: finish(byTopic.get(topic.id) ?? emptySummary()) });
  }
  if (other.total > 0) result.push({ topic: OTHER_TOPIC, summary: finish(other) });
  return result;
}
