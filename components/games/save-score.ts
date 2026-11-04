"use client";

import { createClient } from "@/lib/supabase/client";
import type { GameName } from "@/lib/types";

/**
 * Saves one finished game to `game_scores` as the signed-in user.
 * Resolves true when saved, false when it failed (the caller tells the
 * player; the score still shows on screen).
 */
export async function saveGameScore(input: {
  setId: string;
  game: GameName;
  score: number;
  meta: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("game_scores").insert({
      set_id: input.setId,
      game: input.game,
      score: Math.max(0, Math.round(input.score)),
      meta: input.meta,
    });
    return !error;
  } catch {
    return false;
  }
}
