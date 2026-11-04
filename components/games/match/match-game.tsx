"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { RotateCcw, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GamePageHeader } from "@/components/games/game-page-header";
import {
  formatClock,
  formatSeconds,
  freshSeed,
  seededRandom,
} from "@/components/games/game-data";
import { saveGameScore } from "@/components/games/save-score";
import { SoundToggle, useGameSound } from "@/components/games/use-game-sound";
import {
  buildBoard,
  isPair,
  MISS_PENALTY_MS,
  textSize,
  type MatchCard,
  type Tile,
} from "@/components/games/match/match-engine";
import { cn, pluralize } from "@/lib/utils";

type Phase = "ready" | "playing" | "done";

type Result = {
  roundId: number;
  ms: number;
  pairs: number;
  mistakes: number;
  previousBest: number | null;
  save: "saving" | "saved" | "failed";
};

// Never clamped: tiles grow to fit their text, so a definition is never cut off.
const TEXT_CLASSES: Record<ReturnType<typeof textSize>, string> = {
  lg: "text-base sm:text-lg",
  md: "text-sm sm:text-base",
  sm: "text-[0.8125rem] leading-snug sm:text-sm",
  xs: "text-xs leading-snug sm:text-[0.8125rem]",
};

const START_CLOCK = "0.0";

/** Milliseconds on a steady clock. Called from event handlers and frames only. */
function clockNow(): number {
  return performance.now();
}

export function MatchGame({
  setId,
  cards,
  initialBest,
  seed,
}: {
  setId: string;
  cards: MatchCard[];
  /** Fastest saved time for this set in ms, or null. */
  initialBest: number | null;
  /** Shuffles the first board the same way on the server and in the browser. */
  seed: number;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const sound = useGameSound();
  const uid = useId();
  const titleId = `${uid}-title`;
  const doneId = `${uid}-done`;

  const [board, setBoard] = useState<Tile[]>(() => buildBoard(cards, seededRandom(seed)));
  const [gone, setGone] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [penaltyFlash, setPenaltyFlash] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState<number | null>(initialBest);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string }>({ id: 0, text: "" });

  const startRef = useRef(0);
  const penaltyRef = useRef(0);
  const roundRef = useRef(0);
  const clockRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const tileEls = useRef(new Map<string, HTMLButtonElement>());
  const focusNextRef = useRef<string | null>(null);
  const timersRef = useRef<{ wrong?: number; penalty?: number }>({});

  const pairs = board.length / 2;
  const pairsLeft = pairs - gone.length / 2;
  // A definition too long for a tile (shortened on the board) is shown in full below it.
  const selectedTile = selected ? board.find((t) => t.id === selected) : undefined;
  const shownInFull = selectedTile && selectedTile.full !== selectedTile.text ? selectedTile : null;

  const say = (text: string) => setAnnouncement((prev) => ({ id: prev.id + 1, text }));

  const setClock = (text: string) => {
    const node = clockRef.current?.firstChild;
    if (node) node.nodeValue = text;
  };

  // The clock: tenths, drawn straight into the DOM while a round runs.
  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    const tick = () => {
      const node = clockRef.current?.firstChild;
      if (node) node.nodeValue = formatClock(clockNow() - startRef.current + penaltyRef.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // After tiles change: move focus off vanished tiles, or to the result.
  useEffect(() => {
    const id = focusNextRef.current;
    if (!id) return;
    focusNextRef.current = null;
    tileEls.current.get(id)?.focus();
  }, [gone, board]);

  useEffect(() => {
    if (phase === "done") doneRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      window.clearTimeout(timers.wrong);
      window.clearTimeout(timers.penalty);
    };
  }, []);

  function finish(nextMistakes: number) {
    const ms = Math.max(0, Math.round(clockNow() - startRef.current + penaltyRef.current));
    const roundId = roundRef.current;
    const previousBest = best;
    setClock(formatClock(ms));
    setResult({ roundId, ms, pairs, mistakes: nextMistakes, previousBest, save: "saving" });
    if (previousBest === null || ms < previousBest) setBest(ms);
    setPhase("done");
    sound.play("finish");
    say(`All matched in ${formatSeconds(ms)}.`);
    void saveGameScore({
      setId,
      game: "match",
      score: ms,
      meta: { pairs, mistakes: nextMistakes },
    }).then((ok) => {
      setResult((prev) =>
        prev && prev.roundId === roundId ? { ...prev, save: ok ? "saved" : "failed" } : prev,
      );
    });
  }

  function pick(tile: Tile) {
    if (phase === "done" || gone.includes(tile.id)) return;
    if (phase === "ready") {
      startRef.current = clockNow();
      penaltyRef.current = 0;
      setPhase("playing");
    }
    if (wrong.length) {
      window.clearTimeout(timersRef.current.wrong);
      setWrong([]);
    }

    const first = selected ? board.find((t) => t.id === selected) : undefined;
    if (!first) {
      setSelected(tile.id);
      return;
    }
    if (first.id === tile.id) {
      setSelected(null);
      return;
    }
    // Two of the same kind: switch the pick instead of counting a miss.
    if (first.side === tile.side) {
      setSelected(tile.id);
      return;
    }

    setSelected(null);
    if (isPair(first, tile)) {
      const nextGone = [...gone, first.id, tile.id];
      setGone(nextGone);
      const left = pairs - nextGone.length / 2;
      if (left === 0) {
        finish(mistakes);
        return;
      }
      sound.play("match");
      say(`Matched. ${left === 1 ? "1 pair" : `${left} pairs`} left.`);
      // Keyboard players keep their place: focus the next tile still on the board.
      const active = document.activeElement;
      if (active === tileEls.current.get(tile.id) || active === tileEls.current.get(first.id)) {
        const start = board.findIndex((t) => t.id === tile.id);
        for (let step = 1; step <= board.length; step += 1) {
          const candidate = board[(start + step) % board.length];
          if (!nextGone.includes(candidate.id)) {
            focusNextRef.current = candidate.id;
            break;
          }
        }
      }
      return;
    }

    // Wrong pair: shake, flash, and a second on the clock.
    penaltyRef.current += MISS_PENALTY_MS;
    setMistakes((m) => m + 1);
    setWrong([first.id, tile.id]);
    setPenaltyFlash((n) => n + 1);
    window.clearTimeout(timersRef.current.wrong);
    timersRef.current.wrong = window.setTimeout(() => setWrong([]), 650);
    window.clearTimeout(timersRef.current.penalty);
    timersRef.current.penalty = window.setTimeout(() => setPenaltyFlash(0), 1100);
    sound.play("wrong");
    say("Not a pair. Plus 1 second.");
    if (!reduceMotion) {
      for (const id of [first.id, tile.id]) {
        tileEls.current.get(id)?.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(-4px)" },
            { transform: "translateX(3px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 320, easing: "ease-out" },
        );
      }
    }
  }

  function newRound() {
    roundRef.current += 1;
    window.clearTimeout(timersRef.current.wrong);
    window.clearTimeout(timersRef.current.penalty);
    const next = buildBoard(cards, seededRandom(freshSeed()));
    startRef.current = 0;
    penaltyRef.current = 0;
    setClock(START_CLOCK);
    setBoard(next);
    setGone([]);
    setSelected(null);
    setWrong([]);
    setMistakes(0);
    setPenaltyFlash(0);
    setResult(null);
    setPhase("ready");
    focusNextRef.current = next[0]?.id ?? null;
    say("New board. The timer starts when you pick your first tile.");
    gridRef.current?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Arrow keys move between tiles still on the board.
  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: 0, ArrowDown: 0 };
    if (!(event.key in moves)) return;
    const grid = gridRef.current;
    const current = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-tile]");
    if (!grid || !current) return;
    const columns = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").length);
    const step =
      event.key === "ArrowUp" ? -columns : event.key === "ArrowDown" ? columns : moves[event.key];
    const index = board.findIndex((t) => t.id === current.dataset.tile);
    for (let i = index + step; i >= 0 && i < board.length; i += step) {
      if (!gone.includes(board[i].id)) {
        event.preventDefault();
        tileEls.current.get(board[i].id)?.focus();
        return;
      }
    }
  }

  const newBest =
    result !== null && (result.previousBest === null || result.ms < result.previousBest);

  return (
    <section aria-labelledby={titleId}>
      <GamePageHeader
        setId={setId}
        title="Match"
        titleId={titleId}
        description="Pick a term, then its definition. Each wrong pair adds 1 second."
        aside={
          best !== null ? (
            <span>
              Best time:{" "}
              <span className="font-mono font-medium tabular-nums text-ink">{formatSeconds(best)}</span>
            </span>
          ) : null
        }
      />

      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Timer className="size-5 text-ink-3" strokeWidth={1.75} aria-hidden />
          <p className="flex items-baseline gap-1">
            <span className="sr-only">Time: </span>
            <span
              ref={clockRef}
              role="timer"
              className="font-mono text-[1.75rem] leading-none font-semibold tabular-nums text-ink"
            >
              {START_CLOCK}
            </span>
            <span className="text-sm text-ink-2">s</span>
          </p>
          {penaltyFlash ? (
            <span
              key={penaltyFlash}
              aria-hidden
              className="rounded-sm bg-danger-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-danger motion-safe:animate-rise-in"
            >
              +1.0 s
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <p className="mr-1 text-sm text-ink-2 sm:mr-2">
            {phase === "done" ? "Done" : `${pluralize(pairsLeft, "pair")} left`}
          </p>
          <SoundToggle on={sound.on} onToggle={sound.toggle} />
          <Button variant="ghost" size="sm" onClick={newRound} className="h-9">
            <RotateCcw strokeWidth={1.75} aria-hidden />
            <span className="sr-only sm:not-sr-only">New board</span>
          </Button>
        </div>
      </div>

      {phase === "done" && result ? (
        <div
          role="group"
          aria-labelledby={doneId}
          className="max-w-xl rounded-lg border border-line bg-surface p-5 shadow-md motion-safe:animate-pop-in sm:p-8"
        >
          <h3
            id={doneId}
            ref={doneRef}
            tabIndex={-1}
            className="font-display text-xl font-semibold tracking-[-0.012em] text-ink focus-visible:outline-none"
          >
            All matched
          </h3>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <p className="flex items-baseline gap-2">
              <span className="font-mono text-5xl leading-none font-semibold tabular-nums text-ink">
                {formatClock(result.ms)}
              </span>
              <span className="text-ink-2">seconds</span>
            </p>
            {newBest ? (
              <Badge variant="accent" className="mb-1">
                New best time
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-ink-2">
            {result.previousBest !== null ? (
              <>
                {newBest ? "Previous best: " : "Best time: "}
                <span className="font-mono tabular-nums text-ink">
                  {formatSeconds(result.previousBest)}
                </span>
                {". "}
              </>
            ) : null}
            {pluralize(result.pairs, "pair")},{" "}
            {result.mistakes === 0
              ? "no wrong pairs."
              : `${pluralize(result.mistakes, "wrong pair")} (+${result.mistakes} s).`}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={newRound}>
              <RotateCcw strokeWidth={1.75} aria-hidden />
              Play again
            </Button>
            <Button asChild variant="outline">
              <Link href={`/sets/${setId}/games`}>All games</Link>
            </Button>
          </div>
          <p role="status" className="mt-3 min-h-5 text-xs text-ink-2">
            {result.save === "saving"
              ? "Saving your time..."
              : result.save === "saved"
                ? "Time saved."
                : "Couldn't save this time. Check your connection and play again to try once more."}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-2">
            {phase === "ready"
              ? "The timer starts when you pick your first tile."
              : "Tab or arrow keys move between tiles. Enter or Space picks one."}
          </p>
          <div
            ref={gridRef}
            role="group"
            aria-label="Tiles"
            onKeyDown={onGridKeyDown}
            className={cn(
              // Phones: two columns, each row as tall as its text. Wider: equal
              // tiles that fill the space and still grow if a text needs more.
              "grid auto-rows-[minmax(5.5rem,auto)] grid-cols-2 gap-2 sm:auto-rows-fr sm:grid-cols-4 sm:gap-3",
              "sm:min-h-[clamp(24rem,calc(100dvh-var(--header-h)-12rem),32rem)]",
              "scroll-mt-[calc(var(--header-h)+5rem)] scroll-mb-24",
            )}
          >
            {board.map((tile) => {
              const isGone = gone.includes(tile.id);
              const isSelected = selected === tile.id;
              const isWrong = wrong.includes(tile.id);
              return (
                <button
                  key={tile.id}
                  ref={(el) => {
                    if (el) tileEls.current.set(tile.id, el);
                    else tileEls.current.delete(tile.id);
                  }}
                  type="button"
                  data-tile={tile.id}
                  onClick={() => pick(tile)}
                  disabled={isGone}
                  aria-pressed={isSelected}
                  aria-label={`${tile.side === "term" ? "Term" : "Definition"}: ${tile.full}`}
                  aria-describedby={shownInFull?.id === tile.id ? `${uid}-full` : undefined}
                  title={tile.full !== tile.text ? tile.full : undefined}
                  className={cn(
                    "relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-md border px-2 py-2 text-center break-words text-ink select-none sm:px-3",
                    "focus-visible:outline-offset-2",
                    isGone
                      ? "invisible scale-90 border-accent bg-accent-soft opacity-0 transition-[opacity,scale,visibility] delay-[120ms] duration-200 ease-out"
                      : "transition-[border-color,background-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98]",
                    !isGone &&
                      (isWrong
                        ? "border-danger bg-danger-soft"
                        : isSelected
                          ? "border-accent bg-accent-soft shadow-xs ring-2 ring-accent/30"
                          : "border-line bg-surface shadow-xs hover:border-line-strong hover:bg-surface-2"),
                  )}
                >
                  <span
                    lang="en"
                    className={cn(
                      // No automatic hyphens: a split term reads as a misspelling.
                      // break-words only steps in when one word is wider than the tile.
                      "block w-full min-w-0 hyphens-manual",
                      tile.side === "term" && "font-semibold",
                      TEXT_CLASSES[textSize(tile.text)],
                    )}
                  >
                    {tile.text}
                  </span>
                </button>
              );
            })}
          </div>
          {shownInFull ? (
            <p
              id={`${uid}-full`}
              className="mt-3 rounded-md border border-line bg-surface-2/60 px-3.5 py-2.5 text-sm leading-relaxed text-ink"
            >
              <span className="text-ink-2">{shownInFull.side === "term" ? "Term" : "Definition"}: </span>
              {shownInFull.full}
            </p>
          ) : null}
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        <span key={announcement.id}>{announcement.text}</span>
      </p>
    </section>
  );
}
