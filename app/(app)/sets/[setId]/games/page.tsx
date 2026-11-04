import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app-shell";
import { getSet } from "@/components/sets/server-data";
import { loadBestScores, loadGameCards } from "@/components/games/server-data";
import {
  formatPoints,
  formatSeconds,
  MIN_GAME_CARDS,
} from "@/components/games/game-data";
import { GameTile, MatchPreview, MeteorPreview } from "@/components/games/game-tile";
import { NotEnoughCards } from "@/components/games/not-enough-cards";
import { MATCH_PAIRS } from "@/components/games/match/match-engine";
import { pluralize } from "@/lib/utils";

type Props = { params: Promise<{ setId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => undefined);
  if (set === null) return { title: "Set not found" };
  return { title: set ? `Games · ${set.title}` : "Games" };
}

export default async function GamesPage({ params }: Props) {
  const { setId } = await params;
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, best] = await Promise.all([
    loadGameCards(supabase, set.id),
    loadBestScores(supabase, set.id),
  ]);
  const enough = cards.length >= MIN_GAME_CARDS;
  const pairs = Math.min(MATCH_PAIRS, cards.length);

  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <div className="mb-6 sm:mb-8">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">Games</h2>
        <p className="mt-1 max-w-[60ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Quick rounds with this set&apos;s cards. Your scores are only visible to you.
        </p>
      </div>

      {enough ? (
        <ul className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <li>
            <GameTile
              href={`/sets/${set.id}/games/meteor`}
              name="Meteor"
              description="Definitions fall toward your planet. Type each term before it lands."
              best={best.meteor !== null ? `${formatPoints(best.meteor)} points` : null}
              meta={`Uses all ${pluralize(cards.length, "card")}`}
              preview={<MeteorPreview />}
            />
          </li>
          <li>
            <GameTile
              href={`/sets/${set.id}/games/match`}
              name="Match"
              description="Pair each term with its definition as fast as you can."
              best={best.match !== null ? formatSeconds(best.match) : null}
              meta={`${pluralize(pairs, "pair")} a round`}
              preview={<MatchPreview />}
            />
          </li>
        </ul>
      ) : (
        <NotEnoughCards
          setId={set.id}
          setStatus={set.status}
          cardCount={cards.length}
          headingLevel="h3"
        />
      )}
    </PageContainer>
  );
}
