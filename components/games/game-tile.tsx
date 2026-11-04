import type { ReactNode } from "react";
import Link from "next/link";
import { Play, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Planet, SPACE, SpaceSky } from "@/components/games/meteor/backdrop";
import { cn } from "@/lib/utils";

/** One game on the hub: preview, name, one line, personal best, Play. */
export function GameTile({
  href,
  name,
  description,
  best,
  meta,
  preview,
}: {
  href: string;
  name: string;
  description: string;
  /** e.g. "4,350 points", or null before the first game. */
  best: string | null;
  /** A short fact about the round, e.g. "6 pairs a round". */
  meta?: string;
  preview: ReactNode;
}) {
  return (
    <Card className="h-full overflow-hidden">
      <div className="relative h-40 border-b border-line sm:h-44">{preview}</div>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <h3 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">{name}</h3>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">{description}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <p className="flex items-center gap-1.5">
            <Trophy className="size-4 text-ink-3" strokeWidth={1.75} aria-hidden />
            <span className="text-ink-2">Your best:</span>
            {best ? (
              <span className="font-mono font-medium tabular-nums text-ink">{best}</span>
            ) : (
              <span className="text-ink-2">no score yet</span>
            )}
          </p>
          {meta ? <p className="text-ink-2">{meta}</p> : null}
        </div>
        <Button asChild size="lg" className="w-full sm:w-auto sm:self-start">
          <Link href={href}>
            <Play strokeWidth={1.75} aria-hidden />
            Play {name}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** A still frame of Meteor for the hub. Decorative. */
export function MeteorPreview() {
  return (
    <div aria-hidden className="dark absolute inset-0 overflow-hidden">
      <SpaceSky compact />
      <PreviewMeteor className="top-[14%] left-[16%]" width="w-28" lines={2} />
      <PreviewMeteor className="top-[30%] left-[56%]" width="w-32" lines={3} target />
      <Planet shields={3} height={26} />
    </div>
  );
}

function PreviewMeteor({
  className,
  width,
  lines,
  target = false,
}: {
  className: string;
  width: string;
  lines: number;
  target?: boolean;
}) {
  return (
    <div className={cn("absolute flex flex-col items-center", className)}>
      <span
        className="h-7 w-[2px] rounded-full"
        style={{ background: `linear-gradient(to top, ${SPACE.fire}, transparent)` }}
      />
      <span
        className={cn("flex flex-col gap-1 rounded-[9px] border px-2.5 py-2", width)}
        style={{
          background: SPACE.plate,
          borderColor: target ? SPACE.teal : `color-mix(in oklab, ${SPACE.fire} 45%, transparent)`,
          boxShadow: `0 0 18px -6px ${SPACE.fire}`,
        }}
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full bg-white/70"
            style={{ width: i === lines - 1 ? "60%" : "100%" }}
          />
        ))}
      </span>
      <span
        className="-mt-1.5 size-3 rounded-full"
        style={{
          background: `radial-gradient(circle at 40% 35%, ${SPACE.fireCore}, ${SPACE.fire} 60%, #b4502a)`,
          boxShadow: `0 0 12px 3px color-mix(in oklab, ${SPACE.fire} 60%, transparent)`,
        }}
      />
    </div>
  );
}

/** A still frame of Match for the hub. Decorative. */
export function MatchPreview() {
  // Tile states in the frame: matched pairs fade, one tile is picked.
  const tiles: Array<"term" | "def" | "picked" | "gone"> = [
    "term",
    "def",
    "gone",
    "def",
    "picked",
    "term",
    "def",
    "gone",
    "term",
    "def",
    "term",
    "def",
  ];
  return (
    <div aria-hidden className="graph-paper absolute inset-0 bg-surface-2 p-4 sm:p-5">
      <div className="mx-auto grid h-full max-w-[19rem] grid-cols-4 grid-rows-3 gap-1.5 sm:gap-2">
        {tiles.map((kind, i) => (
          <span
            key={i}
            className={cn(
              "flex flex-col justify-center gap-1 rounded-sm border px-2",
              kind === "gone" && "border-dashed border-line-strong/70 bg-transparent",
              kind === "term" && "border-line bg-surface shadow-xs",
              kind === "def" && "border-line bg-surface shadow-xs",
              kind === "picked" && "border-accent bg-accent-soft shadow-xs ring-2 ring-accent/25",
            )}
          >
            {kind === "term" || kind === "picked" ? (
              <span
                className={cn(
                  "h-1.5 w-3/5 rounded-full",
                  kind === "picked" ? "bg-accent-strong/70" : "bg-ink/55",
                )}
              />
            ) : null}
            {kind === "def" ? (
              <>
                <span className="h-1 w-full rounded-full bg-ink-3/45" />
                <span className="h-1 w-4/5 rounded-full bg-ink-3/45" />
              </>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
