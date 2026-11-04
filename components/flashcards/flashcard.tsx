"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  type MotionStyle,
  type PanInfo,
  type Variants,
} from "motion/react";
import { Check, Lightbulb, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { faceTextClass, type FlashcardData, type FrontSide, type Mark } from "@/components/flashcards/deck-utils";

/** How the card moves in and out: direction of travel, and a fling after a mark. */
export type CardMotion = {
  dir: 1 | -1;
  /** 1 flies off to the right (got it), -1 to the left (still learning), 0 slides. */
  fling: -1 | 0 | 1;
  reduce: boolean;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export const cardVariants: Variants = {
  enter: (c: CardMotion) => (c.reduce ? { opacity: 0, x: 0 } : { opacity: 0, x: c.dir * 48, scale: 0.98 }),
  center: (c: CardMotion) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: c.reduce ? 0.16 : 0.24, ease: EASE_OUT },
  }),
  exit: (c: CardMotion) => {
    if (c.reduce) return { opacity: 0, transition: { duration: 0.12 } };
    if (c.fling !== 0) {
      return { opacity: 0, x: c.fling * 480, transition: { duration: 0.3, ease: EASE_OUT } };
    }
    return { opacity: 0, x: c.dir * -48, scale: 0.98, transition: { duration: 0.16, ease: "easeIn" } };
  },
};

const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 550;

function Face({
  side,
  text,
  textId,
  isTerm,
  hint,
  hintId,
  hidden,
  opacity,
  style,
}: {
  side: "front" | "back";
  text: string;
  textId: string;
  isTerm: boolean;
  hint: string | null;
  hintId: string;
  hidden: boolean;
  /** Set for the reduced-motion crossfade. */
  opacity?: number;
  style?: MotionStyle;
}) {
  const long = text.length > 160;
  return (
    <motion.div
      aria-hidden={hidden || undefined}
      initial={false}
      animate={opacity === undefined ? undefined : { opacity }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      style={style}
      className={cn(
        "absolute inset-0 flex flex-col rounded-lg border border-line bg-surface shadow-md",
        "[backface-visibility:hidden] [-webkit-backface-visibility:hidden]",
        hidden && "pointer-events-none",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 sm:px-7 sm:pt-5">
        <span className={cn("text-xs font-medium", side === "back" ? "text-accent-strong" : "text-ink-2")}>
          {isTerm ? "Term" : "Definition"}
        </span>
        <span aria-hidden className="inline-flex items-center gap-1 text-xs text-ink-2">
          <RotateCcw className="size-3.5" strokeWidth={1.75} />
          <span className="pointer-coarse:hidden">Click or press Space to flip</span>
          <span className="hidden pointer-coarse:inline">Tap to flip</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 py-4 sm:px-8 sm:py-5">
        <p
          id={textId}
          className={cn(
            "m-auto max-w-[56ch] break-words whitespace-pre-line text-ink",
            long ? "text-left" : "text-center text-balance",
            isTerm ? "font-display font-semibold tracking-[-0.015em]" : "font-normal",
            faceTextClass(text, isTerm),
          )}
        >
          {text}
        </p>
        {hint ? (
          <p
            id={hintId}
            className="mx-auto mt-4 flex max-w-[52ch] items-start gap-2 rounded-md border border-dashed border-line-strong bg-surface-2 px-3 py-2 text-left text-sm leading-relaxed text-ink-2"
          >
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
            <span>
              <span className="sr-only">Hint: </span>
              {hint}
            </span>
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * One flashcard. Click, tap, Space or Enter flips it (a 3D turn, or a
 * crossfade with reduced motion). On touch screens it can be swiped: left
 * for still learning, right for got it.
 */
export function Flashcard({
  card,
  front,
  flipped,
  onFlip,
  showHint,
  swipeEnabled,
  onSwipe,
  autoFocus,
  custom,
  label,
}: {
  card: FlashcardData;
  front: FrontSide;
  flipped: boolean;
  onFlip: () => void;
  showHint: boolean;
  swipeEnabled: boolean;
  onSwipe: (mark: Mark) => void;
  autoFocus: boolean;
  custom: CardMotion;
  /** Accessible position, e.g. "Card 3 of 40". */
  label: string;
}) {
  const isPresent = useIsPresent();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dragged = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 260], [-9, 9]);
  const learningOpacity = useTransform(x, [-SWIPE_DISTANCE, -24], [1, 0]);
  const knownOpacity = useTransform(x, [24, SWIPE_DISTANCE], [0, 1]);
  const reduce = custom.reduce;

  useEffect(() => {
    if (autoFocus) buttonRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const frontIsTerm = front === "term";
  const frontText = frontIsTerm ? card.term : card.definition;
  const backText = frontIsTerm ? card.definition : card.term;
  const hint = showHint && !flipped && card.hint ? card.hint : null;
  const shownIsTerm = flipped ? !frontIsTerm : frontIsTerm;

  const ids = {
    front: `card-${card.id}-front`,
    back: `card-${card.id}-back`,
    hint: `card-${card.id}-hint`,
  };
  const describedBy = [flipped ? ids.back : ids.front, hint ? ids.hint : null].filter(Boolean).join(" ");

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || (velocity.x > SWIPE_VELOCITY && offset.x > 24)) onSwipe("known");
    else if (offset.x < -SWIPE_DISTANCE || (velocity.x < -SWIPE_VELOCITY && offset.x < -24)) onSwipe("learning");
    // A drag is not a tap: ignore the click that may follow it.
    setTimeout(() => {
      dragged.current = false;
    }, 0);
  };

  return (
    <motion.div
      custom={custom}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag={swipeEnabled && isPresent ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      dragMomentum={false}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={handleDragEnd}
      style={{ x, rotate: reduce ? 0 : rotate, touchAction: swipeEnabled ? "pan-y" : "auto" }}
      inert={!isPresent}
      aria-hidden={!isPresent || undefined}
      className={cn("absolute inset-0", !isPresent && "pointer-events-none")}
    >
      <button
        ref={buttonRef}
        type="button"
        data-flashcard
        onClick={() => {
          if (dragged.current) return;
          onFlip();
        }}
        aria-label={`${label}, ${shownIsTerm ? "term" : "definition"} side. Press to flip.`}
        aria-describedby={describedBy}
        className="relative block h-full w-full rounded-lg text-left select-none [-webkit-touch-callout:none]"
        style={{ perspective: reduce ? undefined : 1600 }}
      >
        {reduce ? (
          <>
            <Face
              side="front"
              text={frontText}
              textId={ids.front}
              isTerm={frontIsTerm}
              hint={hint}
              hintId={ids.hint}
              hidden={flipped}
              opacity={flipped ? 0 : 1}
            />
            <Face
              side="back"
              text={backText}
              textId={ids.back}
              isTerm={!frontIsTerm}
              hint={null}
              hintId={ids.hint}
              hidden={!flipped}
              opacity={flipped ? 1 : 0}
            />
          </>
        ) : (
          <motion.div
            className="relative h-full w-full"
            style={{ transformStyle: "preserve-3d" }}
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26, mass: 0.9 }}
          >
            <Face
              side="front"
              text={frontText}
              textId={ids.front}
              isTerm={frontIsTerm}
              hint={hint}
              hintId={ids.hint}
              hidden={flipped}
            />
            <Face
              side="back"
              text={backText}
              textId={ids.back}
              isTerm={!frontIsTerm}
              hint={null}
              hintId={ids.hint}
              hidden={!flipped}
              style={{ rotateY: 180 }}
            />
          </motion.div>
        )}
      </button>

      {/* Swipe feedback sits on the trailing edge, so it stays on screen. */}
      {swipeEnabled ? (
        <>
          <motion.span
            aria-hidden
            style={{ opacity: learningOpacity }}
            className="pointer-events-none absolute top-3 right-3 rounded-sm border border-learning/40 bg-learning-soft px-2.5 py-1 text-sm font-medium text-learning-strong shadow-xs"
          >
            Still learning
          </motion.span>
          <motion.span
            aria-hidden
            style={{ opacity: knownOpacity }}
            className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1 rounded-sm border border-accent/40 bg-accent-soft px-2.5 py-1 text-sm font-medium text-accent-strong shadow-xs"
          >
            <Check className="size-4" strokeWidth={2} aria-hidden />
            Got it
          </motion.span>
        </>
      ) : null}
    </motion.div>
  );
}
