// Match game rules. Pure: building a board and checking a pair.
import { clip, oneLine, shuffled } from "@/components/games/game-data";

/** Pairs per round (fewer when the set has fewer cards). */
export const MATCH_PAIRS = 6;
/** Added to the clock for each wrong pair, in ms. */
export const MISS_PENALTY_MS = 1000;
/** Characters of a definition shown on a tile. */
const TILE_CHARS = 220;

export type MatchCard = { id: string; term: string; definition: string };

export type Tile = {
  /** Unique on the board: "<cardId>:term" or "<cardId>:def". */
  id: string;
  cardId: string;
  side: "term" | "def";
  /** What the tile shows (long definitions are shortened). */
  text: string;
  /** The full text, for screen readers and the tooltip. */
  full: string;
};

/** Picks up to 6 random cards and shuffles their 12 sides together. */
export function buildBoard(cards: readonly MatchCard[], random: () => number): Tile[] {
  const picked = shuffled(cards, random).slice(0, MATCH_PAIRS);
  const tiles: Tile[] = [];
  for (const card of picked) {
    const term = oneLine(card.term);
    const definition = oneLine(card.definition);
    tiles.push({ id: `${card.id}:term`, cardId: card.id, side: "term", text: clip(term, TILE_CHARS), full: term });
    tiles.push({
      id: `${card.id}:def`,
      cardId: card.id,
      side: "def",
      text: clip(definition, TILE_CHARS),
      full: definition,
    });
  }
  return shuffled(tiles, random);
}

/** True when the two tiles are the two sides of one card. */
export function isPair(a: Tile, b: Tile): boolean {
  return a.cardId === b.cardId && a.side !== b.side;
}

/** Type size step for a tile's text: longer text gets smaller type. */
export function textSize(text: string): "lg" | "md" | "sm" | "xs" {
  const n = text.length;
  // One long word ("gluconeogenesis") needs a smaller size to fit a phone tile.
  const longestWord = text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  if (n <= 24 && longestWord <= 11) return "lg";
  if (n <= 70) return "md";
  if (n <= 130) return "sm";
  return "xs";
}
