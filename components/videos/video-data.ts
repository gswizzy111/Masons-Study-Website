// Shared shapes and helpers for the Videos tab: used by the page (server),
// the POST /api/videos route and the client view. No server-only imports.
import type { Topic, VideoResult, VideoSuggestion } from "@/lib/types";

export const VIDEO_SUGGESTION_COLUMNS =
  "id, user_id, set_id, topic_id, topic_title, query, reason, videos, created_at";

/** What POST /api/videos answers with. */
export type VideosResponse = {
  /** The newest suggestion per topic, in topic order (topics never searched are absent). */
  suggestions: VideoSuggestion[];
  youtubeConfigured: boolean;
  aiConfigured: boolean;
  /** Something the student should know (for example Claude was unavailable). */
  notice: string | null;
  /** Set when one or more YouTube searches failed; earlier videos were kept. */
  youtubeError: string | null;
};

export type VideosRequest = {
  setId: string;
  /** Only these topics. Default: every topic in the set. */
  topicIds?: string[];
  /** Search again even when saved suggestions exist. */
  refresh?: boolean;
};

/**
 * Video row layout: a swipeable row (next card peeks in) on phones, a grid
 * from 640px. Used by the view and the loading skeleton.
 */
export const VIDEO_ROW_CLASS =
  "-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-3 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-x-5 sm:gap-y-7 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4";
export const VIDEO_ITEM_CLASS = "w-[80%] max-w-80 min-w-0 shrink-0 snap-start sm:w-auto sm:max-w-none";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const THUMBNAIL_PREFIX = "https://i.ytimg.com/vi/";

/** Validates the `videos` jsonb column; drops anything malformed. */
export function normalizeVideos(value: unknown): VideoResult[] {
  if (!Array.isArray(value)) return [];
  const out: VideoResult[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const v = raw as Record<string, unknown>;
    const id = typeof v.id === "string" ? v.id : "";
    if (!VIDEO_ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const thumb = typeof v.thumbnail === "string" && v.thumbnail.startsWith(THUMBNAIL_PREFIX)
      ? v.thumbnail
      : `${THUMBNAIL_PREFIX}${id}/hqdefault.jpg`;
    out.push({
      id,
      title: typeof v.title === "string" && v.title.trim() ? v.title : "Untitled video",
      channel: typeof v.channel === "string" ? v.channel : "",
      thumbnail: thumb,
      publishedAt: typeof v.publishedAt === "string" ? v.publishedAt : "",
    });
  }
  return out;
}

/** Validates `study_sets.topics`. */
export function normalizeTopics(value: unknown): Topic[] {
  if (!Array.isArray(value)) return [];
  const out: Topic[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: typeof t.title === "string" && t.title.trim() ? t.title.trim() : "Untitled topic",
      summary: typeof t.summary === "string" ? t.summary : "",
    });
  }
  return out;
}

/** A database row with `videos` checked. */
export function normalizeSuggestion(row: VideoSuggestion): VideoSuggestion {
  return { ...row, videos: normalizeVideos(row.videos) };
}

/** The newest row for each topic id (rows without a topic are skipped). */
export function latestByTopic(rows: readonly VideoSuggestion[]): Map<string, VideoSuggestion> {
  const map = new Map<string, VideoSuggestion>();
  for (const row of rows) {
    if (!row.topic_id) continue;
    const prev = map.get(row.topic_id);
    if (!prev || row.created_at >= prev.created_at) map.set(row.topic_id, row);
  }
  return map;
}

/** The newest suggestion for each topic, in topic order. */
export function orderedSuggestions(topics: readonly Topic[], rows: readonly VideoSuggestion[]): VideoSuggestion[] {
  const latest = latestByTopic(rows);
  const out: VideoSuggestion[] = [];
  for (const t of topics) {
    const row = latest.get(t.id);
    if (row) out.push(normalizeSuggestion(row));
  }
  return out;
}

/** A youtube.com search page for the query (works with or without an API key). */
export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** The youtube.com watch page for a video id. */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** The privacy-enhanced embed URL. Autoplay is fine here: it loads after a click. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Mar 2024", or "" when unknown. Fixed time zone so server and browser agree. */
export function formatVideoDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}
