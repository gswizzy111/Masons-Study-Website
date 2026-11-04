// Meteor game rules. Pure and framework-free: the component owns the clock
// and the drawing, this file owns what happens. State is mutated in place
// because it changes every frame.
import { gradeAnswer } from "@/lib/learn/grade";
import { clip, oneLine, sameKey, shuffled } from "@/components/games/game-data";

export type AnswerWith = "term" | "definition";

export type MeteorCard = { id: string; term: string; definition: string };

export type Meteor = {
  key: number;
  cardId: string;
  /** The full question text (definition or term). */
  prompt: string;
  /** What rides on the meteor: the prompt, cut to about 140 characters. */
  label: string;
  /** What the player types. */
  answer: string;
  /** Center of the meteor, 0-1 across the field. */
  x: number;
  /** 0 when it appears, 1 when it lands. */
  progress: number;
  /** Seconds from appearing to landing. */
  duration: number;
  landed: boolean;
};

export type MissedCard = { cardId: string; prompt: string; answer: string; times: number };

export type MeteorState = {
  cards: MeteorCard[];
  answerWith: AnswerWith;
  reducedMotion: boolean;
  random: () => number;
  /** Most meteors at once the field width allows (2 on phones, 3 wider). */
  widthCap: number;
  /** Half a meteor's width as a share of the field, so meteors stay inside it. */
  edge: number;
  queue: string[];
  meteors: Meteor[];
  nextKey: number;
  /** Seconds until the next meteor may appear. */
  spawnIn: number;
  level: number;
  hits: number;
  misses: number;
  score: number;
  shields: number;
  /** Seconds of play, not counting pauses. */
  elapsed: number;
  missed: MissedCard[];
};

export type StepEvent = { type: "spawn"; meteor: Meteor } | { type: "land"; meteor: Meteor };

export type SubmitResult =
  | { kind: "hit"; meteor: Meteor; points: number; bonus: number; leveledUp: boolean }
  | { kind: "miss"; close: boolean }
  | { kind: "empty" };

export const START_SHIELDS = 3;
export const HITS_PER_LEVEL = 5;
export const MAX_METEORS = 3;
/** Characters of the prompt that ride on a meteor. */
export const LABEL_CHARS = 140;

const FIRST_SPAWN_SECONDS = 1;
const EMPTY_SCREEN_SPAWN_SECONDS = 0.7;

/** Seconds a meteor takes to fall at this level. Long prompts fall slower. */
export function fallSeconds(level: number, reducedMotion: boolean, promptLength: number): number {
  const base = reducedMotion ? 19 : 15;
  const floor = reducedMotion ? 7.5 : 5.5;
  const levelSeconds = Math.max(floor, base * Math.pow(0.87, level - 1));
  const extra = Math.min(0.5, Math.max(0, (promptLength - 40) / 260));
  return levelSeconds * (1 + extra);
}

/** Seconds between meteors at this level. */
export function spawnGap(level: number): number {
  return Math.max(1.4, 4.2 - 0.4 * (level - 1));
}

/** How many meteors may be on screen at once. */
export function maxOnScreen(state: Pick<MeteorState, "level" | "widthCap">): number {
  return Math.max(1, Math.min(state.level, MAX_METEORS, state.widthCap));
}

/** The level for a hit count. */
export function levelFor(hits: number): number {
  return 1 + Math.floor(hits / HITS_PER_LEVEL);
}

/** Points for a hit: 100 x level, plus up to half again for hitting it early. */
export function pointsFor(level: number, progress: number): { points: number; bonus: number } {
  const base = 100 * level;
  const bonus = Math.round(base * 0.5 * Math.max(0, Math.min(1, 1 - progress)));
  return { points: base + bonus, bonus };
}

export function createMeteorGame(input: {
  cards: MeteorCard[];
  answerWith: AnswerWith;
  reducedMotion: boolean;
  random: () => number;
  widthCap: number;
  edge: number;
}): MeteorState {
  return {
    cards: input.cards,
    answerWith: input.answerWith,
    reducedMotion: input.reducedMotion,
    random: input.random,
    widthCap: input.widthCap,
    edge: input.edge,
    queue: shuffled(
      input.cards.map((c) => c.id),
      input.random,
    ),
    meteors: [],
    nextKey: 1,
    spawnIn: FIRST_SPAWN_SECONDS,
    level: 1,
    hits: 0,
    misses: 0,
    score: 0,
    shields: START_SHIELDS,
    elapsed: 0,
    missed: [],
  };
}

function promptOf(card: MeteorCard, answerWith: AnswerWith): string {
  return oneLine(answerWith === "term" ? card.definition : card.term);
}

function answerOf(card: MeteorCard, answerWith: AnswerWith): string {
  return oneLine(answerWith === "term" ? card.term : card.definition);
}

/** Takes the next card from the queue that isn't already falling. */
function drawCard(state: MeteorState): MeteorCard | null {
  const onScreen = new Set(state.meteors.map((m) => m.cardId));
  const answersOnScreen = new Set(state.meteors.map((m) => sameKey(m.answer)));
  const eligible = (id: string) => {
    if (onScreen.has(id)) return false;
    const card = state.cards.find((c) => c.id === id);
    return Boolean(card) && !answersOnScreen.has(sameKey(answerOf(card!, state.answerWith)));
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const index = state.queue.findIndex(eligible);
    if (index >= 0) {
      const [id] = state.queue.splice(index, 1);
      return state.cards.find((c) => c.id === id) ?? null;
    }
    // Deck used up: shuffle every card back in.
    const queued = new Set(state.queue);
    state.queue.push(
      ...shuffled(
        state.cards.map((c) => c.id).filter((id) => !queued.has(id)),
        state.random,
      ),
    );
  }
  return null;
}

/** A spot across the field that keeps clear of meteors near the top. */
function pickX(state: MeteorState): number {
  const min = Math.min(0.5, state.edge);
  const max = Math.max(0.5, 1 - state.edge);
  let best = min + (max - min) * state.random();
  let bestScore = -Infinity;
  for (let i = 0; i < 7; i += 1) {
    const x = min + (max - min) * state.random();
    let score = 2;
    for (const m of state.meteors) {
      // Meteors far down the screen won't overlap a new one at the top.
      score = Math.min(score, Math.abs(x - m.x) + m.progress * 0.8);
    }
    if (score > bestScore) {
      bestScore = score;
      best = x;
    }
  }
  return best;
}

function spawn(state: MeteorState): Meteor | null {
  const card = drawCard(state);
  if (!card) return null;
  const prompt = promptOf(card, state.answerWith);
  const meteor: Meteor = {
    key: state.nextKey,
    cardId: card.id,
    prompt,
    label: clip(prompt, LABEL_CHARS),
    answer: answerOf(card, state.answerWith),
    x: pickX(state),
    progress: 0,
    duration: fallSeconds(state.level, state.reducedMotion, prompt.length),
    landed: false,
  };
  state.nextKey += 1;
  state.meteors.push(meteor);
  return meteor;
}

/**
 * Advances the game by `dt` seconds. Stops at the first landing, which the
 * caller handles (a shield is already gone) before stepping again.
 */
export function stepMeteors(state: MeteorState, dt: number): StepEvent[] {
  const events: StepEvent[] = [];
  if (state.shields <= 0) return events;
  state.elapsed += dt;

  state.spawnIn -= dt;
  if (state.spawnIn <= 0 && state.meteors.length < maxOnScreen(state)) {
    const meteor = spawn(state);
    if (meteor) events.push({ type: "spawn", meteor });
    state.spawnIn = spawnGap(state.level);
  }

  for (const m of state.meteors) {
    if (m.landed) continue;
    m.progress = Math.min(1, m.progress + dt / m.duration);
  }

  // The lowest meteor lands first.
  let landing: Meteor | null = null;
  for (const m of state.meteors) {
    if (!m.landed && m.progress >= 1 && (!landing || m.key < landing.key)) landing = m;
  }
  if (landing) {
    landing.landed = true;
    state.shields = Math.max(0, state.shields - 1);
    state.misses += 1;
    const seen = state.missed.find((x) => x.cardId === landing.cardId);
    if (seen) seen.times += 1;
    else
      state.missed.push({
        cardId: landing.cardId,
        prompt: landing.prompt,
        answer: landing.answer,
        times: 1,
      });
    // Missed cards come back soon, so the player meets them again.
    state.queue.splice(Math.min(2, state.queue.length), 0, landing.cardId);
    events.push({ type: "land", meteor: landing });
  }
  return events;
}

/** The meteor closest to the planet (the one to answer first), or null. */
export function lowestMeteor(state: MeteorState): Meteor | null {
  let lowest: Meteor | null = null;
  for (const m of state.meteors) {
    if (m.landed) continue;
    if (!lowest || m.progress > lowest.progress) lowest = m;
  }
  return lowest;
}

/** Checks a typed answer against every falling meteor and breaks the lowest match. */
export function submitAnswer(state: MeteorState, text: string): SubmitResult {
  if (!text.trim()) return { kind: "empty" };
  let target: Meteor | null = null;
  let close = false;
  // Every card's answer: typing another card's answer is a mix-up, not a typo.
  const answers = state.cards.map((c) => ({ id: c.id, text: answerOf(c, state.answerWith) }));
  for (const m of state.meteors) {
    if (m.landed) continue;
    const others = answers.filter((a) => a.id !== m.cardId).map((a) => a.text);
    const grade = gradeAnswer(text, m.answer, { others, side: state.answerWith });
    if (grade.correct) {
      if (!target || m.progress > target.progress) target = m;
    } else if (grade.close) {
      close = true;
    }
  }
  if (!target) return { kind: "miss", close };

  const { points, bonus } = pointsFor(state.level, target.progress);
  state.score += points;
  state.hits += 1;
  const level = levelFor(state.hits);
  const leveledUp = level > state.level;
  state.level = level;
  state.meteors = state.meteors.filter((m) => m !== target);
  if (state.meteors.length === 0) state.spawnIn = Math.min(state.spawnIn, EMPTY_SCREEN_SPAWN_SECONDS);
  return { kind: "hit", meteor: target, points, bonus, leveledUp };
}

/** Removes a landed meteor once the player has typed its answer. */
export function clearLanded(state: MeteorState, key: number): void {
  state.meteors = state.meteors.filter((m) => m.key !== key);
  if (state.meteors.length === 0) state.spawnIn = Math.min(state.spawnIn, EMPTY_SCREEN_SPAWN_SECONDS);
}
