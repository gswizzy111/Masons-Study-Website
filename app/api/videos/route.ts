// POST /api/videos { setId, topicIds?, refresh? }
// Returns saved video suggestions, or makes new ones: one search per topic
// (Claude when connected, else a simple search by topic name), then YouTube
// results when a key is set. Stays well under the 60 s function limit:
// Claude is cut off at 28 s and each YouTube search at 10 s (6 at a time,
// at most 12 topics, so two rounds).
// Each YouTube search costs 100 of the default 10,000 daily quota units, so
// searches are limited: at most MAX_TOPICS per request, a refresh of the same
// topic at most every 10 minutes, and a per-user daily budget.
import { createClient, getUser } from "@/lib/supabase/server";
import { isAllowedEmail, NOT_ALLOWED_MESSAGE } from "@/lib/access";
import { aiConfigured, youtubeConfigured } from "@/lib/env";
import { friendlyAiError } from "@/lib/ai/client";
import { MAX_TOPICS } from "@/lib/ai/prompts";
import { runPool } from "@/lib/ai/schemas";
import { sanitizeTopics } from "@/lib/ai/set-context";
import { fallbackVideoQuery, suggestVideoQueries, type VideoQuery } from "@/lib/ai/videos";
import { takeQuota } from "@/lib/usage-limits";
import { searchYouTube, YouTubeError } from "@/lib/youtube";
import type { LearningProfile, Topic, VideoResult, VideoSuggestion } from "@/lib/types";
import {
  VIDEO_SUGGESTION_COLUMNS,
  latestByTopic,
  normalizeTopics,
  orderedSuggestions,
  type VideosResponse,
} from "@/components/videos/video-data";

export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAUDE_DEADLINE_MS = 28_000;
const MAX_TOPIC_IDS = 100;
const VIDEOS_PER_TOPIC = 4;
/** YouTube searches running at once. */
const SEARCH_CONCURRENCY = 6;
/** A topic's videos can be refreshed again after this long. */
const REFRESH_COOLDOWN_MS = 10 * 60_000;

function fail(status: number, error: string, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (retryAfterSeconds) headers["retry-after"] = String(Math.ceil(retryAfterSeconds));
  return Response.json({ error }, { status, headers });
}

function ok(body: VideosResponse) {
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}

type ParsedBody = { setId: string; topicIds: string[] | null; refresh: boolean };

function parseBody(raw: unknown): ParsedBody | string {
  if (!raw || typeof raw !== "object") return "Send a JSON body with a setId.";
  const b = raw as Record<string, unknown>;
  if (typeof b.setId !== "string" || !UUID_RE.test(b.setId)) return "A valid setId is required.";
  let topicIds: string[] | null = null;
  if (b.topicIds !== undefined && b.topicIds !== null) {
    if (
      !Array.isArray(b.topicIds) ||
      b.topicIds.length > MAX_TOPIC_IDS ||
      !b.topicIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 100)
    ) {
      return "topicIds must be a list of topic ids.";
    }
    topicIds = Array.from(new Set(b.topicIds as string[]));
  }
  if (b.refresh !== undefined && typeof b.refresh !== "boolean") return "refresh must be true or false.";
  return { setId: b.setId, topicIds, refresh: b.refresh === true };
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "APIUserAbortError" || error.name === "TimeoutError")
  );
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Send a JSON body with a setId.");
  }
  const parsed = parseBody(raw);
  if (typeof parsed === "string") return fail(400, parsed);
  const { setId, topicIds, refresh } = parsed;

  const user = await getUser();
  if (!user) return fail(401, "Sign in to find videos.");
  if (!isAllowedEmail(user.email)) return fail(403, NOT_ALLOWED_MESSAGE);
  const supabase = await createClient();

  // RLS limits this to the signed-in user's own sets.
  const { data: set, error: setError } = await supabase
    .from("study_sets")
    .select("id, title, topics")
    .eq("id", setId)
    .maybeSingle();
  if (setError) return fail(500, "Couldn't load this study set. Try again.");
  if (!set) return fail(404, "Study set not found.");

  const setTitle = typeof set.title === "string" ? set.title.slice(0, 200) : "";
  // Users can write study_sets.topics directly: at most MAX_TOPICS, clipped,
  // the same ids normalizeTopics keeps for the page.
  const clipped = new Map(sanitizeTopics(set.topics).map((t) => [t.id, t] as const));
  const allTopics = normalizeTopics(set.topics)
    .filter((t) => clipped.has(t.id))
    .slice(0, MAX_TOPICS)
    .map((t) => clipped.get(t.id) ?? t);
  const ytOn = youtubeConfigured();
  const aiOn = aiConfigured();

  const { data: rowData, error: rowsError } = await supabase
    .from("video_suggestions")
    .select(VIDEO_SUGGESTION_COLUMNS)
    .eq("set_id", setId)
    .order("created_at", { ascending: true });
  if (rowsError) return fail(500, "Couldn't load saved videos. Try again.");
  const existing = (rowData ?? []) as VideoSuggestion[];

  const respond = (rows: VideoSuggestion[], notice: string | null = null, youtubeError: string | null = null) =>
    ok({
      suggestions: orderedSuggestions(allTopics, rows),
      youtubeConfigured: ytOn,
      aiConfigured: aiOn,
      notice,
      youtubeError,
    });

  if (allTopics.length === 0) return respond(existing);

  const requested = topicIds ? allTopics.filter((t) => topicIds.includes(t.id)) : allTopics;
  if (requested.length === 0) {
    return fail(400, "Those topics are no longer in this set. Reload the page.");
  }

  // Without refresh, only topics never searched (or searched before YouTube
  // was connected, so they have no videos yet) are looked up. A refresh
  // skips topics searched in the last few minutes.
  const latest = latestByTopic(existing);
  const now = Date.now();
  const fresh = (t: Topic) => {
    const row = latest.get(t.id);
    return Boolean(row && now - new Date(row.created_at).getTime() < REFRESH_COOLDOWN_MS);
  };
  const targets: Topic[] = refresh
    ? requested.filter((t) => !fresh(t))
    : requested.filter((t) => {
        const row = latest.get(t.id);
        return !row || (ytOn && (!Array.isArray(row.videos) || row.videos.length === 0));
      });
  if (targets.length === 0) {
    return respond(existing, refresh ? "These were just refreshed. Try again in a few minutes." : null);
  }

  // Per-user budget: one unit per topic searched (Claude and YouTube calls).
  if (aiOn || ytOn) {
    const quota = await takeQuota(supabase, "videos", targets.length);
    if (!quota.ok) return fail(quota.status, quota.message, quota.retryAfterSeconds);
  }

  // 1. One search per topic.
  let notice: string | null = null;
  let queries: VideoQuery[];
  if (aiOn) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("learning_profile")
      .eq("id", user.id)
      .maybeSingle();
    const profile = (profileRow?.learning_profile ?? null) as LearningProfile | null;
    try {
      queries = await suggestVideoQueries({
        setTitle,
        topics: targets,
        profile,
        signal: AbortSignal.timeout(CLAUDE_DEADLINE_MS),
      });
      if (queries.length > 0 && queries.every((q) => q.fallback)) {
        notice = "Claude's picks couldn't be read this time, so these are simple searches by topic name.";
      }
    } catch (error) {
      queries = targets.map((t) => fallbackVideoQuery(t, setTitle));
      notice = isAbort(error)
        ? "Claude took too long to pick searches, so these are simple searches by topic name. Try refreshing later."
        : `${friendlyAiError(error)} For now these are simple searches by topic name.`;
    }
  } else {
    queries = targets.map((t) => fallbackVideoQuery(t, setTitle));
  }

  // 2. YouTube results, a few at a time. null = that search failed.
  const videosByTopic = new Map<string, VideoResult[] | null>();
  let youtubeError: string | null = null;
  if (ytOn) {
    const results: PromiseSettledResult<VideoResult[]>[] = queries.map(() => ({
      status: "rejected",
      reason: null,
    }));
    await runPool(queries, SEARCH_CONCURRENCY, async (q, i, started) => {
      started();
      try {
        results[i] = { status: "fulfilled", value: await searchYouTube(q.query, { maxResults: VIDEOS_PER_TOPIC }) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    });
    results.forEach((result, i) => {
      const topicId = queries[i].topic_id;
      if (result.status === "fulfilled") {
        videosByTopic.set(topicId, result.value);
      } else {
        videosByTopic.set(topicId, null);
        if (!youtubeError) {
          youtubeError =
            result.reason instanceof YouTubeError
              ? result.reason.message
              : "YouTube search failed. Try again in a minute.";
        }
      }
    });
  }

  // 3. Replace the rows for these topics. A topic whose YouTube search failed
  // keeps its saved row (and videos) when it has one.
  const topicById = new Map(allTopics.map((t) => [t.id, t] as const));
  const replaced = new Set<string>();
  const inserts = queries.flatMap((q) => {
    const videos = ytOn ? videosByTopic.get(q.topic_id) : [];
    if (videos === null && latest.has(q.topic_id)) return [];
    replaced.add(q.topic_id);
    return [
      {
        set_id: setId,
        topic_id: q.topic_id,
        topic_title: topicById.get(q.topic_id)?.title ?? "Topic",
        query: q.query,
        reason: q.reason || null,
        videos: videos ?? [],
      },
    ];
  });

  let inserted: VideoSuggestion[] = [];
  if (inserts.length > 0) {
    const { data, error } = await supabase
      .from("video_suggestions")
      .insert(inserts)
      .select(VIDEO_SUGGESTION_COLUMNS);
    if (error) return fail(500, "Couldn't save the video suggestions. Try again.");
    inserted = (data ?? []) as VideoSuggestion[];
  }

  // Old rows for replaced topics go, plus rows for topics no longer in the
  // set when everything was refreshed. Insert first, so a failure never
  // leaves a topic empty; if this delete fails, the newest row still wins.
  const knownIds = new Set(allTopics.map((t) => t.id));
  const cleanOrphans = refresh && !topicIds;
  const stale = existing.filter(
    (row) =>
      (row.topic_id !== null && replaced.has(row.topic_id)) ||
      (cleanOrphans && (row.topic_id === null || !knownIds.has(row.topic_id))),
  );
  let kept = existing;
  if (stale.length > 0) {
    const staleIds = stale.map((row) => row.id);
    const { error } = await supabase.from("video_suggestions").delete().in("id", staleIds);
    if (!error) {
      const gone = new Set(staleIds);
      kept = existing.filter((row) => !gone.has(row.id));
    }
  }

  return respond([...kept, ...inserted], notice, youtubeError);
}
