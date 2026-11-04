// YouTube Data API v3 search for the Videos tab. Server only (the API key
// must never reach the browser). Relative imports and no Next-only modules,
// so this can run anywhere Node runs.
import { serverEnv } from "./env";
import type { VideoResult } from "./types";

const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const DEFAULT_TIMEOUT_MS = 10_000;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const THUMBNAIL_PREFIX = "https://i.ytimg.com/vi/";

export type YouTubeErrorCode =
  | "not_configured"
  | "quota"
  | "bad_key"
  | "api_disabled"
  | "key_restricted"
  | "bad_request"
  | "timeout"
  | "network"
  | "unknown";

/** A YouTube search failure with a message that is safe to show the student. */
export class YouTubeError extends Error {
  readonly code: YouTubeErrorCode;
  readonly status: number | null;

  constructor(code: YouTubeErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "YouTubeError";
    this.code = code;
    this.status = status;
  }
}

export const YOUTUBE_NOT_CONFIGURED_MESSAGE =
  "YouTube is not connected yet. Add YOUTUBE_API_KEY to show videos here.";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

/**
 * Decodes the HTML entities YouTube puts in titles ("&#39;", "&amp;",
 * "&quot;", "&#x27;"). One pass, so "&amp;lt;" becomes "&lt;", not "<".
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (match, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

type Thumb = { url?: unknown } | null | undefined;
type SearchItem = {
  id?: { kind?: unknown; videoId?: unknown } | null;
  snippet?: {
    title?: unknown;
    channelTitle?: unknown;
    publishedAt?: unknown;
    liveBroadcastContent?: unknown;
    thumbnails?: { high?: Thumb; medium?: Thumb; default?: Thumb; standard?: Thumb; maxres?: Thumb } | null;
  } | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function pickThumbnail(videoId: string, thumbs: NonNullable<SearchItem["snippet"]>["thumbnails"]): string {
  // high (480x360) first, then medium (320x180). Only i.ytimg.com/vi/ URLs are
  // used, so the page can always render them (next.config images pattern).
  for (const t of [thumbs?.high, thumbs?.medium, thumbs?.standard, thumbs?.default]) {
    const url = str(t?.url);
    if (url.startsWith(THUMBNAIL_PREFIX)) return url;
  }
  return `${THUMBNAIL_PREFIX}${videoId}/hqdefault.jpg`;
}

/**
 * Turns a search.list response body into VideoResult[]: videos only, no
 * live or upcoming broadcasts, no duplicates, titles decoded. Never throws
 * on odd shapes; unusable items are skipped.
 */
export function parseSearchResponse(body: unknown, maxResults = Infinity): VideoResult[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const out: VideoResult[] = [];
  const seen = new Set<string>();
  for (const raw of items as SearchItem[]) {
    if (out.length >= maxResults) break;
    const id = str(raw?.id?.videoId);
    const kind = str(raw?.id?.kind);
    if (!VIDEO_ID_RE.test(id) || seen.has(id)) continue;
    if (kind && kind !== "youtube#video") continue;
    const snippet = raw?.snippet;
    const live = str(snippet?.liveBroadcastContent);
    if (live === "live" || live === "upcoming") continue;
    const title = decodeHtmlEntities(str(snippet?.title)).trim();
    if (!title) continue;
    seen.add(id);
    out.push({
      id,
      title,
      channel: decodeHtmlEntities(str(snippet?.channelTitle)).trim(),
      thumbnail: pickThumbnail(id, snippet?.thumbnails),
      publishedAt: str(snippet?.publishedAt),
    });
  }
  return out;
}

type ApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
    status?: unknown;
    errors?: Array<{ reason?: unknown; message?: unknown }>;
    details?: Array<{ reason?: unknown }>;
  };
};

/** Maps a YouTube API error response to a readable YouTubeError. */
export function errorFromResponse(status: number, body: unknown): YouTubeError {
  const err = (body as ApiErrorBody | null)?.error;
  const reasons = new Set<string>();
  for (const e of err?.errors ?? []) if (typeof e?.reason === "string") reasons.add(e.reason);
  for (const d of err?.details ?? []) if (typeof d?.reason === "string") reasons.add(d.reason);
  const message = str(err?.message);
  const has = (...names: string[]) => names.some((n) => reasons.has(n));

  if (has("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded", "userRateLimitExceeded", "RATE_LIMIT_EXCEEDED")) {
    return new YouTubeError(
      "quota",
      "YouTube's daily search limit for this site is used up. Videos come back tomorrow; the search links still work.",
      status,
    );
  }
  if (has("keyInvalid", "keyExpired", "API_KEY_INVALID", "API_KEY_EXPIRED") || /api key not valid|api key expired/i.test(message)) {
    return new YouTubeError("bad_key", "YouTube rejected the API key. Check YOUTUBE_API_KEY.", status);
  }
  if (has("accessNotConfigured", "SERVICE_DISABLED") || /has not been used in project|is disabled/i.test(message)) {
    return new YouTubeError(
      "api_disabled",
      "YouTube Data API v3 is not turned on for this API key's Google Cloud project.",
      status,
    );
  }
  if (
    has(
      "ipRefererBlocked",
      "forbidden",
      "API_KEY_HTTP_REFERRER_BLOCKED",
      "API_KEY_IP_ADDRESS_BLOCKED",
      "API_KEY_SERVICE_BLOCKED",
    )
  ) {
    return new YouTubeError(
      "key_restricted",
      "The YouTube API key is restricted and can't be used from this server. Check its restrictions in Google Cloud.",
      status,
    );
  }
  if (status === 400) {
    return new YouTubeError("bad_request", "YouTube couldn't run that search. Try refreshing.", status);
  }
  if (status === 429) {
    return new YouTubeError("quota", "YouTube is limiting searches right now. Try again in a minute.", status);
  }
  return new YouTubeError(
    "unknown",
    `YouTube search failed${status ? ` (${status})` : ""}. Try again in a minute.`,
    status,
  );
}

export type SearchOptions = {
  /** 1-10. Default 4. */
  maxResults?: number;
  /** Cancels the request (combined with the built-in timeout). */
  signal?: AbortSignal;
  /** Per-request timeout. Default 10 s. */
  timeoutMs?: number;
};

/**
 * Searches YouTube for embeddable English videos. Throws YouTubeError with a
 * readable message (never the key). Never calls the API without a key.
 */
export async function searchYouTube(query: string, options: SearchOptions = {}): Promise<VideoResult[]> {
  const key = serverEnv().youtubeApiKey;
  if (!key) throw new YouTubeError("not_configured", YOUTUBE_NOT_CONFIGURED_MESSAGE);

  const q = query.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!q) return [];
  const maxResults = Math.min(10, Math.max(1, Math.round(options.maxResults ?? 4)));

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    relevanceLanguage: "en",
    // Ask for a couple extra so skipped live streams don't leave a gap.
    maxResults: String(Math.min(10, maxResults + 2)),
    q,
    key,
  });

  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, {
      signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new YouTubeError("timeout", "YouTube took too long to answer. Try again.");
    }
    if (options.signal?.aborted) throw error;
    throw new YouTubeError("network", "Couldn't reach YouTube. Check the connection and try again.");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw errorFromResponse(res.status, body);
  if (body === null) {
    if (timeout.aborted) throw new YouTubeError("timeout", "YouTube took too long to answer. Try again.");
    throw new YouTubeError("unknown", "YouTube sent an answer we couldn't read. Try again.", res.status);
  }
  return parseSearchResponse(body, maxResults);
}
