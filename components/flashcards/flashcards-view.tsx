"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GalleryVerticalEnd,
  Lightbulb,
  PencilLine,
  RotateCcw,
  Shuffle,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordAnswer } from "@/lib/learn/progress";
import { cn, pluralize } from "@/lib/utils";
import type { MasteryLevel, SetStatus, Topic } from "@/lib/types";
import { PageContainer } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_TOPICS,
  OTHER_TOPIC_ID,
  isLearning,
  matchesFilters,
  shuffled,
  topicKey,
  topicOptions,
  type DeckFilter,
  type FlashcardData,
  type FrontSide,
  type Mark,
} from "@/components/flashcards/deck-utils";
import { Flashcard, type CardMotion } from "@/components/flashcards/flashcard";
import { DeckSummary } from "@/components/flashcards/deck-summary";
import { ShortcutsLegend } from "@/components/flashcards/shortcuts-legend";

type Session = {
  /** Card ids in study order. */
  order: string[];
  /** Position in `order`; equal to its length on the summary. */
  index: number;
  /** What was marked this pass. */
  results: Record<string, Mark>;
};

type FlashcardsViewProps = {
  setId: string;
  setStatus: SetStatus;
  topics: Topic[];
  initialCards: FlashcardData[];
  initialProgress: Array<{ card_id: string; level: MasteryLevel }>;
  /** "all", a topic id, or "other". */
  initialTopic: string;
};

const COARSE_QUERY = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void): () => void {
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/** True on touch-first screens (swipe to mark). False on the server. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_QUERY).matches,
    () => false,
  );
}

const FILTER_EMPTY: Record<DeckFilter, { title: string; body: string }> = {
  all: { title: "No cards in this topic", body: "Pick another topic, or add cards on the Cards tab." },
  starred: {
    title: "No starred cards here",
    body: "Star cards you want to come back to with the star button or the S key.",
  },
  learning: {
    title: "Nothing marked still learning",
    body: "Cards you mark still learning, here or in Learn, show up in this pile.",
  },
};

/** The flashcards deck: filters, the card, marking, and the end-of-deck summary. */
export function FlashcardsView({
  setId,
  setStatus,
  topics,
  initialCards,
  initialProgress,
  initialTopic,
}: FlashcardsViewProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const coarse = useCoarsePointer();
  const rootRef = useRef<HTMLDivElement>(null);
  const frontLabelId = useId();
  const topicLabelId = useId();

  const [cards, setCards] = useState(initialCards);
  const [levels, setLevels] = useState<Map<string, MasteryLevel>>(
    () => new Map(initialProgress.map((p) => [p.card_id, p.level])),
  );
  const topicIds = useMemo(() => new Set(topics.map((t) => t.id)), [topics]);
  const topicTitles = useMemo(() => new Map(topics.map((t) => [t.id, t.title])), [topics]);
  const topicChoices = useMemo(() => topicOptions(topics, initialCards), [topics, initialCards]);

  const [filter, setFilter] = useState<DeckFilter>("all");
  const [topic, setTopic] = useState(initialTopic);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [front, setFront] = useState<FrontSide>("term");
  const [session, setSession] = useState<Session>(() => ({
    order: initialCards
      .filter((c) => matchesFilters(c, "all", initialTopic, levels, topicIds))
      .map((c) => c.id),
    index: 0,
    results: {},
  }));
  const [flipped, setFlipped] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [cardMotion, setCardMotion] = useState<Omit<CardMotion, "reduce">>({ dir: 1, fling: 0 });
  const [focusCard, setFocusCard] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const total = session.order.length;
  const atEnd = total > 0 && session.index >= total;
  const current = atEnd ? undefined : byId.get(session.order[session.index] ?? "");

  const counts = useMemo(() => {
    let starred = 0;
    let learning = 0;
    for (const card of cards) {
      if (topic !== ALL_TOPICS && topicKey(card, topicIds) !== topic) continue;
      if (card.starred) starred += 1;
      if (isLearning(levels.get(card.id))) learning += 1;
    }
    return { starred, learning };
  }, [cards, levels, topic, topicIds]);

  const marks = Object.values(session.results);
  const knownCount = marks.filter((m) => m === "known").length;
  const learningCount = marks.length - knownCount;

  // --- actions -------------------------------------------------------------

  const announce = (text: string) => setAnnouncement(text);

  const cardHasFocus = () =>
    typeof document !== "undefined" && !!document.activeElement?.closest?.("[data-flashcard]");

  const resetCardState = () => {
    setFlipped(false);
    setHintShown(false);
  };

  const startDeck = (next: { filter?: DeckFilter; topic?: string; shuffle?: boolean }) => {
    const f = next.filter ?? filter;
    const t = next.topic ?? topic;
    const s = next.shuffle ?? shuffleOn;
    const ids = cards.filter((c) => matchesFilters(c, f, t, levels, topicIds)).map((c) => c.id);
    const order = s ? shuffled(ids) : ids;
    setSession({ order, index: 0, results: {} });
    setCardMotion({ dir: 1, fling: 0 });
    setFocusCard(false);
    resetCardState();
    announce(order.length > 0 ? `${pluralize(order.length, "card")}. Card 1 of ${order.length}.` : "No cards match.");
  };

  const changeFilter = (value: DeckFilter) => {
    setFilter(value);
    startDeck({ filter: value });
  };

  const syncTopicParam = (value: string) => {
    try {
      const url = new URL(window.location.href);
      if (value === ALL_TOPICS) url.searchParams.delete("topic");
      else url.searchParams.set("topic", value);
      window.history.replaceState(null, "", url);
    } catch {
      // The address bar just won't reflect the topic.
    }
  };

  const changeTopic = (value: string) => {
    setTopic(value);
    startDeck({ topic: value });
    syncTopicParam(value);
  };

  const showAllCards = () => {
    setFilter("all");
    setTopic(ALL_TOPICS);
    startDeck({ filter: "all", topic: ALL_TOPICS });
    syncTopicParam(ALL_TOPICS);
  };

  const toggleShuffle = () => {
    const next = !shuffleOn;
    setShuffleOn(next);
    startDeck({ shuffle: next });
    toast(next ? "Shuffled. Starting from the first card." : "Back in order. Starting from the first card.", {
      id: "flashcards-shuffle",
    });
  };

  const changeFront = (value: FrontSide) => {
    setFront(value);
    resetCardState();
    announce(value === "term" ? "Cards show the term first." : "Cards show the definition first.");
  };

  const go = (step: 1 | -1) => {
    if (total === 0) return;
    const nextIndex = Math.min(total, Math.max(0, session.index + step));
    if (nextIndex === session.index) return;
    setFocusCard(cardHasFocus());
    setSession((s) => ({ ...s, index: nextIndex }));
    setCardMotion({ dir: step, fling: 0 });
    resetCardState();
    if (nextIndex < total) announce(`Card ${nextIndex + 1} of ${total}.`);
  };

  const flip = () => {
    if (!current) return;
    const nowFlipped = !flipped;
    setFlipped(nowFlipped);
    const showsTerm = nowFlipped ? front !== "term" : front === "term";
    announce(`${showsTerm ? "Term" : "Definition"}: ${showsTerm ? current.term : current.definition}`);
  };

  const mark = (value: Mark, via: "button" | "key" | "swipe") => {
    const card = current;
    if (!card) return;
    const correct = value === "known";
    const nextIndex = session.index + 1;

    setFocusCard(via !== "button" && cardHasFocus());
    setSession((s) => ({ ...s, results: { ...s.results, [card.id]: value }, index: nextIndex }));
    setCardMotion({ dir: 1, fling: correct ? 1 : -1 });
    resetCardState();
    setLevels((prev) => {
      const next = new Map(prev);
      const level = prev.get(card.id) ?? 0;
      next.set(card.id, (correct ? Math.min(3, Math.max(1, level + 1)) : 1) as MasteryLevel);
      return next;
    });
    announce(
      `${correct ? "Got it" : "Still learning"}.${nextIndex < total ? ` Card ${nextIndex + 1} of ${total}.` : " End of the deck."}`,
    );

    void (async () => {
      try {
        const saved = await recordAnswer(createClient(), {
          cardId: card.id,
          setId,
          correct,
          mode: "flashcard",
        });
        if (!saved) throw new Error("not saved");
        setLevels((prev) => new Map(prev).set(card.id, saved.level));
      } catch {
        toast.error("Couldn't save that answer. Check your connection and try again.", {
          id: "flashcards-save",
        });
      }
    })();
  };

  const toggleStar = () => {
    const card = current;
    if (!card) return;
    const starred = !card.starred;
    const apply = (value: boolean) =>
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, starred: value } : c)));
    apply(starred);
    announce(starred ? "Starred." : "Star removed.");

    void (async () => {
      try {
        const { error } = await createClient().from("cards").update({ starred }).eq("id", card.id);
        if (error) throw new Error(error.message);
      } catch {
        apply(!starred);
        toast.error(starred ? "Couldn't star that card. Try again." : "Couldn't remove the star. Try again.", {
          id: "flashcards-star",
        });
      }
    })();
  };

  const retryLearning = () => {
    const ids = session.order.filter((id) => session.results[id] === "learning");
    const order = shuffleOn ? shuffled(ids) : ids;
    setSession({ order, index: 0, results: {} });
    setCardMotion({ dir: 1, fling: 0 });
    setFocusCard(false);
    resetCardState();
    announce(`${pluralize(order.length, "card")} still learning. Card 1 of ${order.length}.`);
  };

  // --- keyboard ------------------------------------------------------------

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const root = rootRef.current;
    if (!root) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const onPage =
      !target || target === document.body || target === document.documentElement || target.id === "main";
    if (!onPage && !(target && root.contains(target))) return;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="dialog"]',
      )
    ) {
      return;
    }

    const onCard = !!target?.closest("[data-flashcard]");
    const onControl = !onCard && !!target?.closest('button, a, [role="radio"], [role="switch"]');
    const key = event.key;

    if (key === "ArrowLeft" || key === "ArrowRight") {
      if (target?.closest('[role="radiogroup"], [role="slider"]')) return;
      event.preventDefault();
      go(key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (!current || event.repeat) return;

    if (key === " " || key === "Enter") {
      // A focused button (including the card itself) handles these natively.
      if (onCard || onControl) return;
      event.preventDefault();
      flip();
    } else if (key === "1") {
      event.preventDefault();
      mark("learning", "key");
    } else if (key === "2") {
      event.preventDefault();
      mark("known", "key");
    } else if (key === "s" || key === "S") {
      event.preventDefault();
      toggleStar();
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // --- render --------------------------------------------------------------

  if (initialCards.length === 0) {
    return (
      <PageContainer size="default" className="pt-6 sm:pt-8">
        <EmptyState
          icon={<GalleryVerticalEnd />}
          title="No flashcards yet"
          body={
            setStatus === "building"
              ? "Claude is writing the cards topic by topic. Check again in a minute."
              : "Build the set from the overview and Claude will write cards for every topic. You can also add your own."
          }
          action={
            setStatus === "building" ? (
              <Button onClick={() => router.refresh()}>
                <RotateCcw strokeWidth={1.75} aria-hidden />
                Check again
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link href={`/sets/${setId}`}>Go to the overview</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/sets/${setId}/cards`}>
                    <PencilLine strokeWidth={1.75} aria-hidden />
                    Add cards by hand
                  </Link>
                </Button>
              </>
            )
          }
        />
      </PageContainer>
    );
  }

  const learnParams = new URLSearchParams();
  if (topic !== ALL_TOPICS && topic !== OTHER_TOPIC_ID) learnParams.set("topic", topic);
  if (filter === "starred") learnParams.set("starred", "1");
  const learnQuery = learnParams.toString();
  const learnHref = `/sets/${setId}/learn${learnQuery ? `?${learnQuery}` : ""}`;

  const filterOptions = [
    { value: "all" as const, label: "All" },
    {
      value: "starred" as const,
      label: (
        <>
          Starred
          <span className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline">{counts.starred}</span>
        </>
      ),
    },
    {
      value: "learning" as const,
      label: (
        <>
          Still learning
          <span className="hidden font-mono text-xs text-ink-2 tabular-nums sm:inline">{counts.learning}</span>
        </>
      ),
    },
  ];

  const topicTitle = current
    ? (current.topic_id && topicTitles.get(current.topic_id)) || (topicIds.size > 0 ? "Other" : null)
    : null;
  const position = atEnd ? total : Math.min(session.index + 1, total);
  const cardCustom: CardMotion = { ...cardMotion, reduce: reduceMotion };

  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <div ref={rootRef} className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Segmented
            aria-label="Which cards"
            value={filter}
            onValueChange={changeFilter}
            options={filterOptions}
            className="flex w-full sm:inline-flex sm:w-auto max-sm:[&>button]:flex-1"
          />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span id={topicLabelId} className="sr-only">
              Topic
            </span>
            <Select value={topic} onValueChange={changeTopic}>
              <SelectTrigger aria-labelledby={topicLabelId} className="min-w-0 flex-1 sm:max-w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TOPICS}>All topics</SelectItem>
                {topicChoices.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title} ({t.count})
                  </SelectItem>
                ))}
                {topic !== ALL_TOPICS && !topicChoices.some((t) => t.id === topic) ? (
                  <SelectItem value={topic}>{topicTitles.get(topic) ?? "This topic"} (0)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            <Button
              variant={shuffleOn ? "secondary" : "outline"}
              aria-pressed={shuffleOn}
              onClick={toggleShuffle}
              className={cn(shuffleOn && "text-accent-strong")}
            >
              <Shuffle strokeWidth={1.75} aria-hidden />
              Shuffle
            </Button>
          </div>
        </div>

        {total === 0 ? (
          <EmptyState
            icon={filter === "starred" ? <Star /> : <GalleryVerticalEnd />}
            title={FILTER_EMPTY[filter].title}
            body={FILTER_EMPTY[filter].body}
            size="sm"
            action={
              <Button variant="outline" onClick={showAllCards}>
                Show all cards
              </Button>
            }
          />
        ) : (
          <>
            {/* Position, tallies and which side is the front */}
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="flex items-baseline gap-3 text-sm text-ink-2">
                  <span className="font-mono text-base font-medium text-ink tabular-nums">
                    <span className="sr-only">Card </span>
                    {position} / {total}
                  </span>
                  {marks.length > 0 ? (
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full bg-mastered" />
                        <span className="tabular-nums">{knownCount}</span> got it
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden className="size-2 rounded-full bg-learning" />
                        <span className="tabular-nums">{learningCount}</span> still learning
                      </span>
                    </span>
                  ) : null}
                </p>
                <div className="flex items-center gap-2">
                  <span id={frontLabelId} className="text-sm text-ink-2">
                    Front
                  </span>
                  <Segmented
                    aria-labelledby={frontLabelId}
                    value={front}
                    onValueChange={changeFront}
                    size="sm"
                    options={[
                      { value: "term", label: "Term" },
                      { value: "definition", label: "Definition" },
                    ]}
                  />
                </div>
              </div>
              <Progress
                value={position}
                max={total}
                size="xs"
                label="Position in the deck"
                valueText={`Card ${position} of ${total}`}
              />
            </div>

            {atEnd ? (
              <DeckSummary
                total={total}
                known={knownCount}
                learning={learningCount}
                learnHref={learnHref}
                shuffleOn={shuffleOn}
                onRetryLearning={retryLearning}
                onRestart={() => startDeck({})}
                onBack={() => go(-1)}
              />
            ) : current ? (
              <section aria-label="Flashcard" className="flex flex-col gap-3">
                {/* Topic, hint and star for this card */}
                <div className="flex min-h-9 items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm text-ink-2">{topicTitle}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {current.hint && !flipped ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={hintShown}
                        onClick={() => setHintShown((v) => !v)}
                        className="h-9"
                      >
                        <Lightbulb strokeWidth={1.75} aria-hidden className={cn(hintShown && "fill-surface-2 text-ink")} />
                        {hintShown ? "Hide hint" : "Show hint"}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-pressed={current.starred}
                      aria-label="Star this card"
                      onClick={toggleStar}
                      className="size-9"
                    >
                      <Star
                        strokeWidth={1.75}
                        aria-hidden
                        className={cn(current.starred ? "fill-ink text-ink" : "text-ink-2")}
                      />
                    </Button>
                  </div>
                </div>

                {/* The card */}
                <div className="relative h-[clamp(17rem,50dvh,25rem)] sm:h-[22rem] lg:h-[24rem]">
                  <AnimatePresence initial={false} custom={cardCustom}>
                    <Flashcard
                      key={`${session.index}-${current.id}`}
                      card={current}
                      front={front}
                      flipped={flipped}
                      onFlip={flip}
                      showHint={hintShown}
                      swipeEnabled={coarse}
                      onSwipe={(m) => mark(m, "swipe")}
                      autoFocus={focusCard}
                      custom={cardCustom}
                      label={`Card ${position} of ${total}`}
                    />
                  </AnimatePresence>
                </div>

                {/* Marking and moving */}
                <div className="mt-1 flex items-stretch gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Previous card"
                    onClick={() => go(-1)}
                    disabled={session.index === 0}
                    className="h-12 w-11 shrink-0 sm:w-12"
                  >
                    <ChevronLeft strokeWidth={1.75} aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => mark("learning", "button")}
                    className="h-12 min-w-0 flex-1 px-3 max-sm:[&>svg]:hidden sm:px-4 border-learning/35 bg-learning-soft text-learning-strong hover:border-learning/60 hover:bg-[color-mix(in_oklab,var(--learning-soft),var(--learning)_10%)]"
                  >
                    <RotateCcw strokeWidth={1.75} aria-hidden />
                    Still learning
                    <Kbd aria-hidden className="ml-1 hidden border-learning/30 bg-transparent text-learning-strong pointer-fine:inline-flex">
                      1
                    </Kbd>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => mark("known", "button")}
                    className="h-12 min-w-0 flex-1 px-3 max-sm:[&>svg]:hidden sm:px-4 border-accent/35 bg-accent-soft text-accent-strong hover:border-accent/60 hover:bg-[color-mix(in_oklab,var(--accent-soft),var(--accent)_10%)]"
                  >
                    <Check strokeWidth={2} aria-hidden />
                    Got it
                    <Kbd aria-hidden className="ml-1 hidden border-accent/30 bg-transparent text-accent-strong pointer-fine:inline-flex">
                      2
                    </Kbd>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Next card"
                    onClick={() => go(1)}
                    className="h-12 w-11 shrink-0 sm:w-12"
                  >
                    <ChevronRight strokeWidth={1.75} aria-hidden />
                  </Button>
                </div>
              </section>
            ) : null}

            <ShortcutsLegend className="mt-2" />
          </>
        )}

        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
      </div>
    </PageContainer>
  );
}
