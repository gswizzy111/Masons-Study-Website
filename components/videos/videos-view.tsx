"use client";

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, Info, RefreshCw, Search, SquarePlay } from "lucide-react";
import type { SetStatus, Topic, VideoSuggestion } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { VideoCard, VideoCardSkeleton } from "@/components/videos/video-card";
import {
  VIDEO_ITEM_CLASS,
  VIDEO_ROW_CLASS,
  youtubeSearchUrl,
  type VideosRequest,
  type VideosResponse,
} from "@/components/videos/video-data";

type VideosViewProps = {
  setId: string;
  setStatus: SetStatus;
  topics: Topic[];
  initialSuggestions: VideoSuggestion[];
  youtubeConfigured: boolean;
  aiConfigured: boolean;
};

type Pending = { kind: "all" } | { kind: "topics"; ids: Set<string> } | null;

const SKELETON_COUNT = 4;

export function VideosView({
  setId,
  setStatus,
  topics,
  initialSuggestions,
  youtubeConfigured: initialYoutube,
  aiConfigured: initialAi,
}: VideosViewProps) {
  const [suggestions, setSuggestions] = useState<VideoSuggestion[]>(initialSuggestions);
  const [config, setConfig] = useState({ youtube: initialYoutube, ai: initialAi });
  const [pending, setPending] = useState<Pending>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const busy = useRef(false);

  const byTopic = useMemo(() => {
    const map = new Map<string, VideoSuggestion>();
    for (const s of suggestions) if (s.topic_id) map.set(s.topic_id, s);
    return map;
  }, [suggestions]);

  const isPending = useCallback(
    (topicId: string) =>
      pending?.kind === "all" || (pending?.kind === "topics" && pending.ids.has(topicId)),
    [pending],
  );

  const run = useCallback(
    async (request: Omit<VideosRequest, "setId">) => {
      if (busy.current) return;
      busy.current = true;
      const ids = request.topicIds ?? null;
      const scopeTopics = ids ? topics.filter((t) => ids.includes(t.id)) : topics;
      setPending(ids ? { kind: "topics", ids: new Set(ids) } : { kind: "all" });
      setGlobalError(null);
      setErrors((prev) => {
        if (!ids) return {};
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
      setAnnouncement(
        scopeTopics.length === 1
          ? `Finding videos for ${scopeTopics[0].title}.`
          : `Finding videos for ${pluralize(scopeTopics.length, "topic")}.`,
      );

      try {
        const res = await fetch("/api/videos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ setId, ...request } satisfies VideosRequest),
        });
        const body = (await res.json().catch(() => null)) as
          | (Partial<VideosResponse> & { error?: string })
          | null;
        if (!res.ok || !body || body.error || !Array.isArray(body.suggestions)) {
          const message =
            body?.error ||
            (res.status === 401
              ? "Your session ended. Log in again to find videos."
              : "Couldn't find videos right now. Try again.");
          throw new Error(message);
        }
        const data = body as VideosResponse;
        setSuggestions(data.suggestions);
        setConfig({ youtube: data.youtubeConfigured, ai: data.aiConfigured });
        setNotice(data.notice);
        setYoutubeError(data.youtubeError);
        setAnnouncement(
          data.youtubeError
            ? `Some searches didn't load. ${data.youtubeError}`
            : scopeTopics.length === 1
              ? `Updated videos for ${scopeTopics[0].title}.`
              : `Updated videos for ${pluralize(scopeTopics.length, "topic")}.`,
        );
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Couldn't find videos right now. Try again.";
        if (ids && ids.length === 1) {
          setErrors((prev) => ({ ...prev, [ids[0]]: message }));
        } else {
          setGlobalError(message);
        }
        setAnnouncement(message);
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [setId, topics],
  );

  if (topics.length === 0) {
    return <NoTopics setId={setId} setStatus={setStatus} />;
  }

  const hasAny = suggestions.length > 0;
  const firstRun = !hasAny && pending === null;
  const anyPending = pending !== null;
  // Without Claude or YouTube a refresh would only rebuild the same searches.
  const canRefresh = config.ai || config.youtube;
  const description = `${config.youtube ? "Videos" : "A YouTube search"} for each topic in this set${
    config.ai ? ", picked to match how you learn." : "."
  }`;

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">Videos</h2>
          <p className="mt-1 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-2">
            {description}
          </p>
        </div>
        {hasAny && canRefresh ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start sm:self-auto"
            onClick={() => run({ refresh: true })}
            loading={pending?.kind === "all"}
            disabled={anyPending}
          >
            {pending?.kind === "all" ? null : <RefreshCw strokeWidth={1.75} aria-hidden />}
            Refresh all
          </Button>
        ) : null}
      </div>

      <ConnectionNote youtube={config.youtube} ai={config.ai} />

      {notice ? (
        <Callout tone="neutral" className="mb-6">
          {notice}
        </Callout>
      ) : null}
      {youtubeError ? (
        <Callout tone="danger" role="alert" className="mb-6">
          {youtubeError}
        </Callout>
      ) : null}
      {globalError ? (
        <Callout tone="danger" role="alert" className="mb-6">
          {globalError}
        </Callout>
      ) : null}

      {firstRun ? (
        <FirstRun
          topicCount={topics.length}
          youtube={config.youtube}
          ai={config.ai}
          onFind={() => run({ refresh: false })}
        />
      ) : (
        <ol className="flex flex-col">
          {topics.map((topic, index) => (
            <TopicSection
              key={topic.id}
              index={index}
              topic={topic}
              suggestion={byTopic.get(topic.id) ?? null}
              youtube={config.youtube}
              canRefresh={canRefresh}
              pending={isPending(topic.id)}
              disabled={anyPending}
              error={errors[topic.id] ?? null}
              playing={playing}
              onPlay={setPlaying}
              onRefresh={(refresh) => run({ topicIds: [topic.id], refresh })}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TopicSection({
  index,
  topic,
  suggestion,
  youtube,
  canRefresh,
  pending,
  disabled,
  error,
  playing,
  onPlay,
  onRefresh,
}: {
  index: number;
  topic: Topic;
  suggestion: VideoSuggestion | null;
  youtube: boolean;
  canRefresh: boolean;
  pending: boolean;
  disabled: boolean;
  error: string | null;
  playing: string | null;
  onPlay: (key: string | null) => void;
  onRefresh: (refresh: boolean) => void;
}) {
  const headingId = useId();
  const videos = suggestion?.videos ?? [];
  const showVideos = youtube && videos.length > 0;

  let body: ReactNode;
  if (pending) {
    body = (
      <div className={VIDEO_ROW_CLASS}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <div key={i} className={VIDEO_ITEM_CLASS}>
            <VideoCardSkeleton />
          </div>
        ))}
      </div>
    );
  } else if (!suggestion) {
    body = (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong/80 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[0.9375rem] text-ink-2">This topic hasn&apos;t been searched yet.</p>
        <Button
          variant="outline"
          size="sm"
          className="self-start sm:self-auto"
          onClick={() => onRefresh(false)}
          disabled={disabled}
        >
          <Search strokeWidth={1.75} aria-hidden />
          Find videos
        </Button>
      </div>
    );
  } else if (showVideos) {
    body = (
      <ul className={VIDEO_ROW_CLASS}>
        {videos.map((video, i) => {
          const key = `${topic.id}:${video.id}`;
          return (
            <li key={video.id} className={`${VIDEO_ITEM_CLASS} motion-safe:animate-rise-in`}>
              <VideoCard
                video={video}
                playing={playing === key}
                onPlay={() => onPlay(key)}
                priority={index === 0 && i < 2}
              />
            </li>
          );
        })}
      </ul>
    );
  } else {
    body = (
      <SearchBox
        query={suggestion.query}
        topicTitle={topic.title}
        message={
          youtube
            ? "YouTube didn't return videos for this search. Try it on YouTube, or refresh for a new search."
            : null
        }
      />
    );
  }

  return (
    <li className="border-t border-line py-8 first:border-t-0 first:pt-0 sm:py-10">
      <section aria-labelledby={headingId} aria-busy={pending || undefined}>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-wide text-ink-2 tabular-nums">
            Topic {String(index + 1).padStart(2, "0")}
          </p>
          <h3
            id={headingId}
            className="mt-1 font-display text-xl leading-snug font-semibold tracking-[-0.012em] break-words text-ink"
          >
            {topic.title}
          </h3>
          {suggestion?.reason && !pending ? (
            <p className="mt-2 max-w-[68ch] text-[0.9375rem] leading-relaxed text-ink-2">
              {suggestion.reason}
            </p>
          ) : null}
        </div>
        {suggestion && (canRefresh || showVideos) ? (
          <div className="-ml-3 flex shrink-0 flex-wrap items-center gap-1 sm:ml-0">
            {canRefresh ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRefresh(true)}
                disabled={disabled}
                aria-label={`Refresh videos for ${topic.title}`}
              >
                <RefreshCw strokeWidth={1.75} aria-hidden />
                Refresh
              </Button>
            ) : null}
            {showVideos ? (
              <Button asChild variant="ghost" size="sm">
                <a href={youtubeSearchUrl(suggestion.query)} target="_blank" rel="noreferrer">
                  More on YouTube
                  <ExternalLink strokeWidth={1.75} aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mb-4 flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {error}
        </p>
      ) : null}

      {body}
      </section>
    </li>
  );
}

function SearchBox({
  query,
  topicTitle,
  message,
}: {
  query: string;
  topicTitle: string;
  message: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="min-w-0">
        {message ? <p className="mb-2 text-sm text-ink-2">{message}</p> : null}
        <p className="text-sm font-medium text-ink-2">Suggested search</p>
        <p className="mt-1 font-mono text-sm break-words text-ink">{query}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
        <a
          href={youtubeSearchUrl(query)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Search on YouTube for ${topicTitle} (opens in a new tab)`}
        >
          <Search strokeWidth={1.75} aria-hidden />
          Search on YouTube
          <ExternalLink strokeWidth={1.75} aria-hidden />
        </a>
      </Button>
    </div>
  );
}

function FirstRun({
  topicCount,
  youtube,
  ai,
  onFind,
}: {
  topicCount: number;
  youtube: boolean;
  ai: boolean;
  onFind: () => void;
}) {
  const how = ai
    ? youtube
      ? "Claude picks a search for each topic, matched to how you learn, and the top videos show up here, ready to play."
      : "Claude picks a search for each topic, matched to how you learn, that you can open on YouTube."
    : youtube
      ? "Each topic gets a search by its name, and the top videos show up here, ready to play."
      : "Each topic gets a search by its name that you can open on YouTube.";
  return (
    <EmptyState
      icon={<SquarePlay />}
      title="Find videos for this set"
      body={
        <>
          {how} This set has {pluralize(topicCount, "topic")}.
        </>
      }
      action={
        <Button onClick={onFind}>
          <Search strokeWidth={1.75} aria-hidden />
          Find videos
        </Button>
      }
    />
  );
}

function ConnectionNote({ youtube, ai }: { youtube: boolean; ai: boolean }) {
  if (youtube && ai) return null;
  return (
    <Callout tone="neutral" className="mb-6" icon={<Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />}>
      <ul className="flex flex-col gap-1">
        {!youtube ? (
          <li>
            Videos aren&apos;t shown here yet because YouTube isn&apos;t connected. Adding a YouTube
            API key shows videos right on this page. Until then, each topic has a search to open on
            YouTube.
          </li>
        ) : null}
        {!ai ? (
          <li>
            Claude isn&apos;t connected, so searches use each topic&apos;s name instead of being
            matched to how you learn.
          </li>
        ) : null}
      </ul>
    </Callout>
  );
}

function Callout({
  tone,
  role,
  icon,
  className,
  children,
}: {
  tone: "neutral" | "danger";
  role?: "alert";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-4 text-sm leading-relaxed text-ink",
        tone === "danger" ? "border-danger/30 bg-danger-soft" : "border-line bg-surface-2",
        className,
      )}
    >
      {icon ??
        (tone === "danger" ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
        ) : (
          <Info className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
        ))}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function NoTopics({ setId, setStatus }: { setId: string; setStatus: SetStatus }) {
  const building = setStatus === "building";
  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">Videos</h2>
      </div>
      <EmptyState
        icon={<SquarePlay />}
        title={building ? "Topics are on the way" : "No topics yet"}
        body={
          building
            ? "Claude is building this set. Once its topics are ready, you can find videos for each one here."
            : "Videos are picked per topic. Add your material and build the set, then come back here."
        }
        action={
          building ? null : (
            <Button asChild variant="outline">
              <Link href={`/sets/${setId}`}>Go to overview</Link>
            </Button>
          )
        }
      />
    </div>
  );
}
