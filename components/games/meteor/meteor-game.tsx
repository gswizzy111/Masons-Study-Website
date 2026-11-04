"use client";

import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw, Shield, ShieldOff } from "lucide-react";
import { gradeAnswer } from "@/lib/learn/grade";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import { GamePageHeader } from "@/components/games/game-page-header";
import { formatPoints, clip } from "@/components/games/game-data";
import { saveGameScore } from "@/components/games/save-score";
import { SoundToggle, useGameSound } from "@/components/games/use-game-sound";
import {
  PLANET_HEIGHT,
  Planet,
  SHIELD_GAP,
  SPACE,
  SpaceSky,
  shieldDrop,
} from "@/components/games/meteor/backdrop";
import { burst, scorePop, shake } from "@/components/games/meteor/effects";
import {
  clearLanded,
  createMeteorGame,
  HITS_PER_LEVEL,
  lowestMeteor,
  START_SHIELDS,
  stepMeteors,
  submitAnswer,
  type AnswerWith,
  type Meteor,
  type MeteorCard,
  type MeteorState,
  type MissedCard,
  type StepEvent,
} from "@/components/games/meteor/engine";
import { cn } from "@/lib/utils";

type Phase = "intro" | "playing" | "paused" | "recover" | "over";

type SpriteView = { key: number; label: string };
type SpriteEntry = { el: HTMLDivElement; height: number };
type Size = { width: number; height: number };

type Hud = { score: number; level: number; hits: number; shields: number };

type Result = {
  gameId: number;
  score: number;
  level: number;
  hits: number;
  misses: number;
  shieldsLeft: number;
  missed: MissedCard[];
  previousBest: number | null;
  save: "saving" | "saved" | "failed" | "skipped";
};

type Feedback = { tone: "close" | "wrong"; text: string } | null;

const START_HUD: Hud = { score: 0, level: 1, hits: 0, shields: START_SHIELDS };

/** Fields narrower than this get at most 2 meteors at once. */
const NARROW_FIELD = 520;

// --- drawing helpers (refs and DOM only, never called during render) -------

/** Where a meteor's bottom edge touches the shield, in px from the top. */
function groundAt(size: Size, x: number): number {
  return size.height - PLANET_HEIGHT - SHIELD_GAP + shieldDrop(x);
}

function bottomOf(m: Meteor, size: Size): number {
  return m.progress * groundAt(size, m.x);
}

function placeSprite(m: Meteor, entry: SpriteEntry, size: Size): void {
  const top = bottomOf(m, size) - entry.height;
  entry.el.style.transform = `translate3d(${(m.x * size.width).toFixed(1)}px, ${top.toFixed(1)}px, 0)`;
}

function placeAll(engine: MeteorState | null, sprites: Map<number, SpriteEntry>, size: Size): void {
  if (!engine) return;
  for (const m of engine.meteors) {
    const entry = sprites.get(m.key);
    if (entry) placeSprite(m, entry, size);
  }
}

function plateWidth(fieldWidth: number): number {
  return Math.round(Math.max(150, Math.min(256, fieldWidth * 0.62)));
}

/** Half a meteor plus a margin, as a share of the field width. */
function edgeFor(fieldWidth: number): number {
  if (fieldWidth <= 0) return 0.25;
  return Math.min(0.5, (plateWidth(fieldWidth) / 2 + 10) / fieldWidth);
}

function viewsOf(engine: MeteorState): SpriteView[] {
  return engine.meteors.map((m) => ({ key: m.key, label: m.label }));
}

function hudOf(engine: MeteorState): Hud {
  return { score: engine.score, level: engine.level, hits: engine.hits, shields: engine.shields };
}

// --- component -------------------------------------------------------------

export function MeteorGame({
  setId,
  cards,
  initialBest,
}: {
  setId: string;
  cards: MeteorCard[];
  /** Highest saved score for this set, or null. */
  initialBest: number | null;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const sound = useGameSound();
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    answerWith: `${uid}-answer-with`,
    input: `${uid}-answer`,
    target: `${uid}-target`,
    feedback: `${uid}-feedback`,
    overTitle: `${uid}-over`,
  };

  const [phase, setPhase] = useState<Phase>("intro");
  const [answerWith, setAnswerWith] = useState<AnswerWith>("term");
  const [sprites, setSprites] = useState<SpriteView[]>([]);
  const [hud, setHud] = useState<Hud>(START_HUD);
  const [target, setTarget] = useState<{ key: number; prompt: string } | null>(null);
  const [landed, setLanded] = useState<Meteor | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [impact, setImpact] = useState(false);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string }>({ id: 0, text: "" });
  const [result, setResult] = useState<Result | null>(null);
  const [best, setBest] = useState<number | null>(initialBest);

  const engineRef = useRef<MeteorState | null>(null);
  const spritesRef = useRef(new Map<number, SpriteEntry>());
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const targetKeyRef = useRef<number | null>(null);
  const gameIdRef = useRef(0);
  const timersRef = useRef<{ banner?: number; alert?: number }>({});

  const panelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const overTitleRef = useRef<HTMLHeadingElement>(null);

  // Sprites register on mount so the loop can move them without re-rendering.
  const registerSprite = useCallback((key: number, el: HTMLDivElement | null) => {
    if (!el) {
      spritesRef.current.delete(key);
      return;
    }
    const entry = { el, height: el.offsetHeight };
    spritesRef.current.set(key, entry);
    const m = engineRef.current?.meteors.find((x) => x.key === key);
    if (m) placeSprite(m, entry, sizeRef.current);
  }, []);

  // Field size: drives meteor width, where meteors may appear and where they land.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const apply = () => {
      const size = { width: scene.clientWidth, height: scene.clientHeight };
      sizeRef.current = size;
      scene.style.setProperty("--plate-w", `${plateWidth(size.width)}px`);
      const engine = engineRef.current;
      if (engine) {
        engine.edge = edgeFor(size.width);
        engine.widthCap = size.width < NARROW_FIELD ? 2 : 3;
      }
      for (const entry of spritesRef.current.values()) entry.height = entry.el.offsetHeight;
      placeAll(engine, spritesRef.current, size);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      window.clearTimeout(timers.banner);
      window.clearTimeout(timers.alert);
    };
  }, []);

  // --- small state helpers (event handlers and the loop only) --------------

  const say = (text: string) => setAnnouncement((prev) => ({ id: prev.id + 1, text }));

  const syncTarget = (engine: MeteorState) => {
    const lowest = lowestMeteor(engine);
    const key = lowest?.key ?? null;
    if (key === targetKeyRef.current) return;
    targetKeyRef.current = key;
    setTarget(lowest ? { key: lowest.key, prompt: lowest.prompt } : null);
  };

  const showBanner = (text: string) => {
    window.clearTimeout(timersRef.current.banner);
    setBanner((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
    timersRef.current.banner = window.setTimeout(() => setBanner(null), 1500);
  };

  const flashAlert = () => {
    window.clearTimeout(timersRef.current.alert);
    setImpact(true);
    timersRef.current.alert = window.setTimeout(() => setImpact(false), 900);
  };

  // --- game flow -------------------------------------------------------------

  function startGame() {
    const width = sizeRef.current.width || sceneRef.current?.clientWidth || 0;
    gameIdRef.current += 1;
    engineRef.current = createMeteorGame({
      cards,
      answerWith,
      reducedMotion: reduceMotion,
      random: Math.random,
      widthCap: width > 0 && width < NARROW_FIELD ? 2 : 3,
      edge: edgeFor(width),
    });
    targetKeyRef.current = null;
    setSprites([]);
    setHud(START_HUD);
    setTarget(null);
    setLanded(null);
    setAnswer("");
    setFeedback(null);
    setBanner(null);
    setImpact(false);
    setResult(null);
    setPhase("playing");
    say("Game started. Type an answer and press Enter. Press Escape to pause.");
    panelRef.current?.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function endGame() {
    const engine = engineRef.current;
    if (!engine) return;
    const gameId = gameIdRef.current;
    const played = engine.hits + engine.misses > 0;
    const previousBest = best;
    setResult({
      gameId,
      score: engine.score,
      level: engine.level,
      hits: engine.hits,
      misses: engine.misses,
      shieldsLeft: engine.shields,
      missed: engine.missed.map((m) => ({ ...m })),
      previousBest,
      save: played ? "saving" : "skipped",
    });
    if (played && (previousBest === null || engine.score > previousBest)) setBest(engine.score);
    setSprites([]);
    setTarget(null);
    targetKeyRef.current = null;
    setLanded(null);
    setFeedback(null);
    setBanner(null);
    setPhase("over");
    say(`Game over. You scored ${formatPoints(engine.score)} points and reached level ${engine.level}.`);

    if (!played) return;
    void saveGameScore({
      setId,
      game: "meteor",
      score: engine.score,
      meta: {
        level: engine.level,
        hits: engine.hits,
        misses: engine.misses,
        answer_with: engine.answerWith,
      },
    }).then((ok) => {
      setResult((prev) =>
        prev && prev.gameId === gameId ? { ...prev, save: ok ? "saved" : "failed" } : prev,
      );
    });
  }

  function pause() {
    if (phase !== "playing") return;
    setPhase("paused");
    say("Paused.");
  }

  function resume() {
    if (phase !== "paused") return;
    setPhase(landed ? "recover" : "playing");
  }

  // Each frame: new meteors, the lowest one, and landings.
  const onFrame = useEffectEvent((events: StepEvent[]): boolean => {
    const engine = engineRef.current;
    if (!engine) return true;
    if (events.some((e) => e.type === "spawn")) setSprites(viewsOf(engine));
    syncTarget(engine);

    const land = events.find((e) => e.type === "land");
    if (!land) return false;

    const meteor = land.meteor;
    setHud(hudOf(engine));
    flashAlert();
    sound.play("land");
    if (sceneRef.current) shake(sceneRef.current, reduceMotion);

    if (engine.shields <= 0) {
      endGame();
      return true;
    }
    setLanded(meteor);
    setAnswer("");
    setFeedback(null);
    setPhase("recover");
    const left = engine.shields === 1 ? "1 shield left" : `${engine.shields} shields left`;
    say(`A meteor landed. ${left}. Type the answer shown to keep going.`);
    return true;
  });

  // The game loop: runs only while playing, so pausing or hiding the tab stops drawing.
  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const events = stepMeteors(engine, dt);
      placeAll(engine, spritesRef.current, sizeRef.current);
      if (onFrame(events)) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Focus follows the game: answer box while playing, the next action otherwise.
  useEffect(() => {
    if (phase === "playing" || phase === "recover") inputRef.current?.focus({ preventScroll: true });
    else if (phase === "paused") resumeRef.current?.focus();
    else if (phase === "over") overTitleRef.current?.focus();
  }, [phase]);

  // Escape pauses and resumes; leaving the tab or window pauses.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (phase === "playing") {
      event.preventDefault();
      pause();
    } else if (phase === "paused") {
      event.preventDefault();
      resume();
    }
  });
  const onAway = useEffectEvent(() => {
    if (phase === "playing") pause();
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => onKey(e);
    const blur = () => onAway();
    const visibility = () => {
      if (document.visibilityState === "hidden") onAway();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  // --- input -----------------------------------------------------------------

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const engine = engineRef.current;
    if (!engine) return;

    if (phase === "recover" && landed) {
      const grade = gradeAnswer(answer, landed.answer);
      if (grade.correct) {
        clearLanded(engine, landed.key);
        setSprites(viewsOf(engine));
        setLanded(null);
        setAnswer("");
        setFeedback(null);
        setPhase("playing");
        say("Got it. Back to the game.");
      } else {
        setFeedback(
          grade.close
            ? { tone: "close", text: "Close. Check the spelling." }
            : { tone: "wrong", text: "Not quite. Type the answer shown above." },
        );
        sound.play("wrong");
        inputRef.current?.select();
      }
      return;
    }

    if (phase !== "playing") return;
    const outcome = submitAnswer(engine, answer);
    if (outcome.kind === "empty") return;
    if (outcome.kind === "miss") {
      setFeedback(
        outcome.close
          ? { tone: "close", text: "Close. Check the spelling." }
          : { tone: "wrong", text: "No meteor matches that answer." },
      );
      sound.play("wrong");
      inputRef.current?.select();
      return;
    }

    // A hit: burst where the meteor was, then update the board.
    const size = sizeRef.current;
    const entry = spritesRef.current.get(outcome.meteor.key);
    const x = outcome.meteor.x * size.width;
    const bottom = bottomOf(outcome.meteor, size);
    const middle = bottom - (entry ? entry.height / 2 : 24);
    if (fxRef.current) {
      burst(fxRef.current, x, bottom - 8, reduceMotion);
      scorePop(fxRef.current, x, middle, `+${formatPoints(outcome.points)}`, reduceMotion);
    }
    setSprites(viewsOf(engine));
    syncTarget(engine);
    setHud(hudOf(engine));
    setAnswer("");
    setFeedback(null);
    if (outcome.leveledUp) {
      sound.play("level");
      showBanner(`Level ${engine.level}`);
      say(`Hit, plus ${outcome.points} points. Level ${engine.level}: meteors fall faster.`);
    } else {
      sound.play("hit");
      say(`Hit, plus ${outcome.points} points.`);
    }
  }

  // Clicking the sky keeps the answer box focused (and the phone keyboard up).
  function keepFocus(event: MouseEvent) {
    if (phase === "playing" || phase === "recover") {
      const el = event.target as HTMLElement;
      if (!el.closest("button, a, input")) event.preventDefault();
    }
  }

  // Focus leaving the game (clicking elsewhere on the page) pauses it.
  function onPanelBlur(event: FocusEvent<HTMLDivElement>) {
    if (phase !== "playing") return;
    const next = event.relatedTarget as Node | null;
    if (next && panelRef.current?.contains(next)) return;
    pause();
  }

  // --- render ----------------------------------------------------------------

  const inGame = phase === "playing" || phase === "paused" || phase === "recover";
  const prompts =
    answerWith === "term"
      ? { carries: "a definition", type: "its term" }
      : { carries: "a term", type: "its definition" };
  const hitsToNext = HITS_PER_LEVEL - (hud.hits % HITS_PER_LEVEL);

  return (
    <section aria-labelledby={ids.title}>
      <GamePageHeader
        setId={setId}
        title="Meteor"
        titleId={ids.title}
        description={`Type the answer before each meteor reaches the planet. ${cards.length} cards in the mix.`}
        aside={
          best !== null ? (
            <span>
              Your best:{" "}
              <span className="font-mono font-medium tabular-nums text-ink">{formatPoints(best)}</span>
            </span>
          ) : null
        }
      />

      <div
        ref={panelRef}
        onBlur={onPanelBlur}
        className={cn(
          "dark relative isolate flex flex-col overflow-hidden rounded-lg border border-line text-ink shadow-md",
          "h-[clamp(24rem,calc(100dvh-var(--header-h)-6.5rem),46rem)]",
          "scroll-mt-[calc(var(--header-h)+0.75rem)] scroll-mb-24",
        )}
        style={{ backgroundColor: SPACE.top }}
      >
        {/* The field */}
        <div
          ref={sceneRef}
          onMouseDown={keepFocus}
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ ["--plate-w" as string]: "240px" }}
        >
          <SpaceSky />
          <Planet shields={inGame ? hud.shields : START_SHIELDS} alert={impact} />

          <div aria-hidden className={cn("absolute inset-0", phase === "paused" && "invisible")}>
            {sprites.map((s) => (
              <MeteorSprite
                key={s.key}
                spriteKey={s.key}
                label={s.label}
                state={landed?.key === s.key ? "landed" : target?.key === s.key ? "target" : "falling"}
                register={registerSprite}
              />
            ))}
          </div>
          <div ref={fxRef} aria-hidden className="pointer-events-none absolute inset-0" />

          {inGame ? (
            <HudBar
              hud={hud}
              hitsToNext={hitsToNext}
              soundOn={sound.on}
              onToggleSound={sound.toggle}
              onPause={pause}
              canPause={phase === "playing"}
            />
          ) : null}

          {banner ? (
            <div
              key={banner.id}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center motion-safe:animate-rise-in"
            >
              <p
                className="font-display text-4xl font-semibold tracking-[-0.02em] text-white sm:text-5xl"
                style={{ textShadow: `0 0 28px ${SPACE.teal}` }}
              >
                {banner.text}
              </p>
            </div>
          ) : null}

          {phase === "intro" ? (
            <Overlay>
              <h3 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">
                How to play
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                Each meteor carries {prompts.carries}. Type {prompts.type} and press Enter to break
                it apart before it reaches the planet.
              </p>
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2 marker:text-ink-3">
                <li>A meteor that lands costs one of your 3 shields. Lose all 3 and the game ends.</li>
                <li>Every {HITS_PER_LEVEL} hits is a new level: faster meteors, and more at once.</li>
                <li>The lowest meteor&apos;s full text shows above the answer box.</li>
              </ul>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex flex-col gap-1.5">
                  <span id={ids.answerWith} className="text-sm font-medium text-ink">
                    Answer with
                  </span>
                  <Segmented
                    aria-labelledby={ids.answerWith}
                    value={answerWith}
                    onValueChange={setAnswerWith}
                    options={[
                      { value: "term", label: "Term" },
                      { value: "definition", label: "Definition" },
                    ]}
                  />
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <span className="text-sm font-medium text-ink">Sound</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={sound.on}
                    onClick={sound.toggle}
                    className="h-[2.375rem]"
                  >
                    {sound.on ? "On" : "Off"}
                  </Button>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
                <Button size="lg" onClick={startGame}>
                  <Play strokeWidth={1.75} aria-hidden />
                  Start game
                </Button>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>Enter</Kbd> fire
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Kbd>Esc</Kbd> pause
                  </span>
                </p>
              </div>
            </Overlay>
          ) : null}

          {phase === "paused" ? (
            <Overlay>
              <h3 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">Paused</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                The meteors are frozen. Score so far:{" "}
                <span className="font-mono font-medium tabular-nums text-ink">
                  {formatPoints(hud.score)}
                </span>
                .
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button ref={resumeRef} onClick={resume}>
                  <Play strokeWidth={1.75} aria-hidden />
                  Resume
                </Button>
                <Button variant="outline" onClick={endGame}>
                  End game
                </Button>
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                  <Kbd>Esc</Kbd> resume
                </span>
              </div>
            </Overlay>
          ) : null}

          {phase === "over" && result ? (
            <Overlay wide>
              <GameOver
                result={result}
                titleId={ids.overTitle}
                titleRef={overTitleRef}
                setId={setId}
                onPlayAgain={startGame}
              />
            </Overlay>
          ) : null}
        </div>

        {/* Answer bar */}
        {inGame ? (
          <form
            onSubmit={onSubmit}
            className="relative z-10 border-t border-white/10 px-3 pt-2.5 pb-3 sm:px-4 sm:pt-3"
            style={{ backgroundColor: "rgb(6 12 30 / 0.96)" }}
          >
            <div
              id={ids.target}
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "mb-2 min-h-[2.75rem] overflow-y-auto text-sm leading-snug",
                phase === "recover" ? "max-h-[7.5rem]" : "max-h-[5.25rem]",
              )}
            >
              {phase === "recover" && landed ? (
                <div>
                  <p className="font-medium text-danger">
                    Shield lost. Type the correct answer to keep going.
                  </p>
                  <p className="mt-1 text-ink">
                    Answer: <strong className="font-semibold text-accent-strong">{landed.answer}</strong>
                  </p>
                  <p className="mt-0.5 text-ink-2">
                    <span className="sr-only">Question: </span>
                    {clip(landed.prompt, 160)}
                  </p>
                </div>
              ) : target ? (
                <div>
                  <p className="text-xs font-medium tracking-[0.04em] text-ink-2 uppercase">
                    Lowest meteor
                  </p>
                  <p className="mt-0.5 text-ink">{target.prompt}</p>
                </div>
              ) : (
                <p className="pt-2.5 text-ink-2">
                  {phase === "paused" ? "Paused." : "The next meteor is on its way."}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label
                htmlFor={ids.input}
                className="sr-only shrink-0 text-sm font-medium text-ink-2 sm:not-sr-only"
              >
                {phase === "recover" ? "Type it" : "Answer"}
              </label>
              <Input
                ref={inputRef}
                id={ids.input}
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  if (feedback) setFeedback(null);
                }}
                disabled={phase === "paused"}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={4000}
                placeholder={
                  phase === "recover"
                    ? "Type the answer shown"
                    : answerWith === "term"
                      ? "Type a term"
                      : "Type a definition"
                }
                aria-describedby={`${ids.target} ${ids.feedback}`}
                aria-invalid={feedback ? true : undefined}
                className="h-11 border-white/15 bg-[rgb(255_255_255/0.06)] text-base"
              />
              <Button
                type="submit"
                disabled={phase === "paused"}
                onMouseDown={(e) => e.preventDefault()}
                className="h-11"
              >
                {phase === "recover" ? "Keep going" : "Fire"}
              </Button>
            </div>
            <p
              id={ids.feedback}
              aria-live="polite"
              className={cn(
                "mt-1.5 min-h-5 text-sm",
                feedback?.tone === "close" ? "text-learning-strong" : "text-danger",
              )}
            >
              {feedback?.text ?? ""}
            </p>
          </form>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        <span key={announcement.id}>{announcement.text}</span>
      </p>
    </section>
  );
}

// --- pieces ------------------------------------------------------------------

const MeteorSprite = memo(function MeteorSprite({
  spriteKey,
  label,
  state,
  register,
}: {
  spriteKey: number;
  label: string;
  state: "falling" | "target" | "landed";
  register: (key: number, el: HTMLDivElement | null) => void;
}) {
  const ref = useCallback((el: HTMLDivElement | null) => register(spriteKey, el), [register, spriteKey]);
  const edge =
    state === "landed" ? SPACE.danger : state === "target" ? SPACE.teal : `color-mix(in oklab, ${SPACE.fire} 45%, transparent)`;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute top-0 left-0 will-change-transform"
      style={{ zIndex: state === "falling" ? 1 : 2 }}
    >
      <div className="flex -translate-x-1/2 flex-col items-center">
        <span
          className="h-10 w-[3px] rounded-full opacity-80"
          style={{ background: `linear-gradient(to top, ${SPACE.fire}, transparent)` }}
        />
        <div
          className="w-max max-w-[var(--plate-w)] rounded-[12px] border px-3 py-2 text-center text-[0.8125rem] leading-snug font-medium break-words sm:text-sm"
          style={{
            background: SPACE.plate,
            color: SPACE.text,
            borderColor: edge,
            boxShadow:
              state === "target"
                ? `0 0 0 1px ${SPACE.teal}, 0 0 26px -6px ${SPACE.teal}`
                : `0 0 24px -8px ${state === "landed" ? SPACE.danger : SPACE.fire}`,
          }}
        >
          {label}
        </div>
        <span
          className="-mt-2 size-4 rounded-full"
          style={{
            background: `radial-gradient(circle at 40% 35%, ${SPACE.fireCore}, ${SPACE.fire} 58%, #b4502a)`,
            boxShadow: `0 0 14px 4px color-mix(in oklab, ${SPACE.fire} 55%, transparent)`,
          }}
        />
      </div>
    </div>
  );
});

function HudBar({
  hud,
  hitsToNext,
  soundOn,
  onToggleSound,
  onPause,
  canPause,
}: {
  hud: Hud;
  hitsToNext: number;
  soundOn: boolean;
  onToggleSound: () => void;
  onPause: () => void;
  canPause: boolean;
}) {
  const lost = START_SHIELDS - hud.shields;
  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-3 pt-2.5 pb-6 sm:px-4 sm:pt-3"
      style={{
        background: `linear-gradient(to bottom, ${SPACE.top} 0%, color-mix(in oklab, ${SPACE.top} 82%, transparent) 55%, transparent 100%)`,
      }}
    >
      <dl className="flex items-start gap-4 sm:gap-6">
        <div>
          <dt className="text-[0.6875rem] font-medium tracking-[0.06em] text-ink-2 uppercase">Score</dt>
          <dd className="font-mono text-lg leading-tight font-semibold tabular-nums text-ink sm:text-xl">
            {formatPoints(hud.score)}
          </dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] font-medium tracking-[0.06em] text-ink-2 uppercase">Level</dt>
          <dd className="font-mono text-lg leading-tight font-semibold tabular-nums text-ink sm:text-xl">
            {hud.level}
            <span className="sr-only">, {hitsToNext} hits to the next level</span>
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-1">
        <div
          role="img"
          aria-label={`${hud.shields} of ${START_SHIELDS} shields left${lost > 0 ? `, ${lost} lost` : ""}`}
          className="mr-1 flex items-center gap-0.5"
        >
          {Array.from({ length: START_SHIELDS }, (_, i) =>
            i < hud.shields ? (
              <Shield
                key={i}
                className="size-[18px]"
                strokeWidth={1.75}
                style={{ color: SPACE.teal, fill: `color-mix(in oklab, ${SPACE.teal} 30%, transparent)` }}
                aria-hidden
              />
            ) : (
              <ShieldOff key={i} className="size-[18px] text-ink-3" strokeWidth={1.75} aria-hidden />
            ),
          )}
        </div>
        <SoundToggle on={soundOn} onToggle={onToggleSound} keepFocus />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Pause"
          title="Pause (Esc)"
          disabled={!canPause}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onPause}
          className="size-9"
        >
          <Pause strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** A centered card over the field for the intro, pause and results. */
function Overlay({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-[rgb(3_7_18/0.55)] p-3 sm:p-6">
      <div className="flex min-h-full items-center justify-center">
        <div
          className={cn(
            "w-full rounded-lg border border-white/10 p-5 shadow-lg motion-safe:animate-pop-in sm:p-6",
            wide ? "max-w-xl" : "max-w-md",
          )}
          style={{ backgroundColor: "rgb(10 18 42)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function GameOver({
  result,
  titleId,
  titleRef,
  setId,
  onPlayAgain,
}: {
  result: Result;
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  setId: string;
  onPlayAgain: () => void;
}) {
  const newBest =
    result.save !== "skipped" &&
    result.score > 0 &&
    (result.previousBest === null || result.score > result.previousBest);
  const missed = result.missed;
  return (
    <div aria-labelledby={titleId} role="group">
      <h3
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className="font-display text-xl font-semibold tracking-[-0.012em] text-ink focus-visible:outline-none"
      >
        {result.shieldsLeft <= 0 ? "Game over" : "Game ended"}
      </h3>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-5xl leading-none font-semibold tabular-nums text-ink">
            {formatPoints(result.score)}
          </span>
          <span className="text-ink-2">points</span>
        </p>
        {newBest ? (
          <Badge variant="accent" className="mb-1">
            New personal best
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-ink-2">
        {newBest && result.previousBest !== null ? (
          <>
            Previous best:{" "}
            <span className="font-mono tabular-nums text-ink">{formatPoints(result.previousBest)}</span>
          </>
        ) : !newBest && result.previousBest !== null ? (
          <>
            Your best:{" "}
            <span className="font-mono tabular-nums text-ink">{formatPoints(result.previousBest)}</span>
          </>
        ) : null}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Level", value: result.level },
          { label: "Hits", value: result.hits },
          { label: "Landed", value: result.misses },
        ].map((stat) => (
          <div key={stat.label} className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-2.5">
            <dt className="text-xs text-ink-2">{stat.label}</dt>
            <dd className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-ink">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {missed.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-ink">Review these</h4>
          <ul className="mt-2 flex flex-col divide-y divide-white/10 rounded-md border border-white/10">
            {missed.map((m) => (
              <li key={m.cardId} className="px-3 py-2.5 text-sm leading-snug">
                <p className="font-semibold text-accent-strong">{m.answer}</p>
                <p className="mt-0.5 text-ink-2">{clip(m.prompt, 200)}</p>
                {m.times > 1 ? <p className="mt-0.5 text-xs text-ink-2">Landed {m.times} times</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : result.hits > 0 ? (
        <p className="mt-5 text-sm text-ink-2">No meteors landed. Clean round.</p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={onPlayAgain}>
          <RotateCcw strokeWidth={1.75} aria-hidden />
          Play again
        </Button>
        <Button asChild variant="outline">
          <Link href={`/sets/${setId}/games`}>All games</Link>
        </Button>
      </div>
      <p role="status" className="mt-3 min-h-5 text-xs text-ink-2">
        {result.save === "saving"
          ? "Saving your score..."
          : result.save === "saved"
            ? "Score saved."
            : result.save === "failed"
              ? "Couldn't save this score. Check your connection and play again to try once more."
              : ""}
      </p>
    </div>
  );
}
