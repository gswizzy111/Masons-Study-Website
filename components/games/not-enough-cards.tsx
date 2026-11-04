import Link from "next/link";
import { Gamepad2, PencilLine } from "lucide-react";
import type { SetStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MIN_GAME_CARDS } from "@/components/games/game-data";
import { pluralize } from "@/lib/utils";

/** Shown instead of a game when the set has fewer than 4 usable cards. */
export function NotEnoughCards({
  setId,
  setStatus,
  cardCount,
  headingLevel = "h2",
}: {
  setId: string;
  setStatus: SetStatus;
  cardCount: number;
  headingLevel?: "h2" | "h3";
}) {
  const building = setStatus === "building";
  const body = building
    ? "Claude is still writing cards for this set. The games open once there are a few to play with."
    : cardCount === 0
      ? `Games use the set's flashcards, and this set has none yet. Build the set or add at least ${MIN_GAME_CARDS} cards by hand.`
      : `Games need at least ${MIN_GAME_CARDS} cards with a term and a definition. This set has ${pluralize(cardCount, "usable card")}.`;

  return (
    <EmptyState
      icon={<Gamepad2 />}
      headingLevel={headingLevel}
      title={`Games need at least ${MIN_GAME_CARDS} cards`}
      body={body}
      action={
        <>
          <Button asChild>
            <Link href={`/sets/${setId}/cards`}>
              <PencilLine strokeWidth={1.75} aria-hidden />
              Add cards
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/sets/${setId}`}>Go to the overview</Link>
          </Button>
        </>
      }
    />
  );
}
