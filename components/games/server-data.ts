// Server-side reads for the game pages. Uses the request's Supabase client
// (RLS applies). Import from Server Components only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/components/sets/server-data";
import {
  GAME_CARD_COLUMNS,
  playableCards,
  type BestScores,
  type GameCard,
} from "@/components/games/game-data";

/** The set's cards that a game can use, in the set's order. */
export async function loadGameCards(supabase: SupabaseClient, setId: string): Promise<GameCard[]> {
  const cards = await fetchAll<GameCard>((from, to) =>
    supabase
      .from("cards")
      .select(GAME_CARD_COLUMNS)
      .eq("set_id", setId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return playableCards(cards);
}

/** Best Meteor score (highest) and best Match time (lowest) for the set. */
export async function loadBestScores(supabase: SupabaseClient, setId: string): Promise<BestScores> {
  const [meteor, match] = await Promise.all([
    supabase
      .from("game_scores")
      .select("score")
      .eq("set_id", setId)
      .eq("game", "meteor")
      .order("score", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("game_scores")
      .select("score")
      .eq("set_id", setId)
      .eq("game", "match")
      .order("score", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (meteor.error) throw new Error(meteor.error.message);
  if (match.error) throw new Error(match.error.message);
  return {
    meteor: typeof meteor.data?.score === "number" ? meteor.data.score : null,
    match: typeof match.data?.score === "number" ? match.data.score : null,
  };
}
