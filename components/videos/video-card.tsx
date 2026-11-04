"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import type { VideoResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatVideoDate, youtubeEmbedUrl, youtubeWatchUrl } from "@/components/videos/video-data";

type VideoCardProps = {
  video: VideoResult;
  /** True once the student pressed play; the thumbnail swaps for the player. */
  playing: boolean;
  onPlay: () => void;
  /** Lets the first row of thumbnails load eagerly. */
  priority?: boolean;
};

/**
 * A YouTube video as a thumbnail facade. Nothing from YouTube loads until
 * the student presses play; then a youtube-nocookie.com player takes its
 * place and receives focus.
 */
export function VideoCard({ video, playing, onPlay, priority = false }: VideoCardProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  const date = formatVideoDate(video.publishedAt);
  const meta = [video.channel, date].filter(Boolean).join(" · ");

  return (
    <article className="flex min-w-0 flex-col gap-2.5">
      <div className="relative aspect-video overflow-hidden rounded-md border border-line bg-surface-2">
        {playing ? (
          <iframe
            ref={frameRef}
            src={youtubeEmbedUrl(video.id)}
            title={video.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            aria-label={`Play ${video.title}`}
            className="group absolute inset-0 block size-full cursor-pointer focus-visible:outline-offset-[-2px]"
          >
            <Image
              src={video.thumbnail}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 1280px) 300px, (min-width: 1024px) 23vw, (min-width: 640px) 46vw, 92vw"
              className="object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.03]"
            />
            <span
              aria-hidden
              className={cn(
                "absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full",
                "bg-[rgb(10_12_14/0.72)] text-white shadow-md ring-1 ring-white/20",
                "transition-[background-color,scale] duration-200 ease-out",
                "group-hover:bg-accent group-hover:text-accent-ink group-focus-visible:bg-accent group-focus-visible:text-accent-ink",
                "motion-safe:group-active:scale-95",
              )}
            >
              <Play className="ml-0.5 size-5 fill-current" strokeWidth={1.75} />
            </span>
          </button>
        )}
      </div>
      <div className="min-w-0">
        <h4 className="line-clamp-2 text-[0.9375rem] leading-snug font-medium text-ink">
          <a
            href={youtubeWatchUrl(video.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-xs decoration-1 underline-offset-[3px] hover:underline"
          >
            {video.title}
            <span className="sr-only"> (opens YouTube in a new tab)</span>
          </a>
        </h4>
        {meta ? <p className="mt-1 truncate text-sm text-ink-2">{meta}</p> : null}
      </div>
    </article>
  );
}

/** Placeholder shaped like a VideoCard. */
export function VideoCardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <div className="aspect-video rounded-md bg-surface-2 motion-safe:animate-pulse" />
      <div className="h-4 w-[92%] rounded-sm bg-surface-2 motion-safe:animate-pulse" />
      <div className="h-4 w-[64%] rounded-sm bg-surface-2 motion-safe:animate-pulse" />
      <div className="h-3.5 w-[46%] rounded-sm bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );
}
