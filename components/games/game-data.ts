// Shared shapes, rules and formatting for the games. Safe on server and client.
import type { Card, GameName } from "@/lib/types";

/** Games need at least this many usable cards. */
export const MIN_GAME_CARDS = 4;

/** Columns the game pages read from `cards`. */
export const GAME_CARD_COLUMNS = "id, term, definition, topic_id";

export type GameCard = Pick<Card, "id" | "term" | "definition" | "topic_id">;

export type BestScores = {
  /** Highest Meteor score (points), or null before the first game. */
  meteor: number | null;
  /** Fastest Match time (ms), or null before the first game. */
  match: number | null;
};

export const GAME_LABELS: Record<GameName, string> = {
  meteor: "Meteor",
  match: "Match",
};

/** Collapses whitespace so a card reads on one line. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Lowercase, single-spaced: for spotting duplicate terms or definitions. */
export function sameKey(text: string): string {
  return oneLine(text).toLowerCase();
}

/**
 * Cards a game can use: both sides filled in, and no two cards with the
 * same term or the same definition (a duplicate would make two answers
 * right at once).
 */
export function playableCards<T extends Pick<Card, "term" | "definition">>(cards: readonly T[]): T[] {
  const terms = new Set<string>();
  const definitions = new Set<string>();
  const out: T[] = [];
  for (const card of cards) {
    const term = sameKey(card.term ?? "");
    const definition = sameKey(card.definition ?? "");
    if (!term || !definition) continue;
    if (terms.has(term) || definitions.has(definition)) continue;
    terms.add(term);
    definitions.add(definition);
    out.push(card);
  }
  return out;
}

/**
 * Shortens text to about `max` characters at a word boundary, with an
 * ellipsis when it was cut.
 */
export function clip(text: string, max: number): string {
  const s = oneLine(text);
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  const base = space > max * 0.6 ? cut.slice(0, space) : s.slice(0, max);
  return `${base.replace(/[\s,;:.]+$/, "")}…`;
}

/** 12345 -> "12.3 s". Tenths, rounded down so the clock never runs ahead. */
export function formatSeconds(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  return `${(tenths / 10).toFixed(1)} s`;
}

/** 12345 -> "12.3" (no unit), for the running clock. */
export function formatClock(ms: number): string {
  const tenths = Math.max(0, Math.floor(ms / 100));
  return (tenths / 10).toFixed(1);
}

const pointsFormat = new Intl.NumberFormat("en-US");

/** 4350 -> "4,350". */
export function formatPoints(points: number): string {
  return pointsFormat.format(Math.max(0, Math.round(points)));
}

/** mulberry32: a small seeded random source, so server and client shuffle alike. */
export function seededRandom(seed: number): () => number {
  let a = Math.floor(seed) >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh 32-bit seed. Call from the server or an event handler, never in render. */
export function freshSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Fisher-Yates shuffle into a new array. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
