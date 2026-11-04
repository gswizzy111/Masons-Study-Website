import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { PageContainer } from "@/components/app-shell";
import { getSet } from "@/components/sets/server-data";
import { loadBestScores, loadGameCards } from "@/components/games/server-data";
import { MIN_GAME_CARDS } from "@/components/games/game-data";
import { GamePageHeader } from "@/components/games/game-page-header";
import { NotEnoughCards } from "@/components/games/not-enough-cards";
import { MeteorGame } from "@/components/games/meteor/meteor-game";

type Props = { params: Promise<{ setId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set ? `Meteor · ${set.title}` : "Meteor" };
}

export default async function MeteorPage({ params }: Props) {
  const { setId } = await params;
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, best] = await Promise.all([
    loadGameCards(supabase, set.id),
    loadBestScores(supabase, set.id),
  ]);

  if (cards.length < MIN_GAME_CARDS) {
    return (
      <PageContainer size="default" className="pt-6 sm:pt-8">
        <GamePageHeader setId={set.id} title="Meteor" />
        <NotEnoughCards
          setId={set.id}
          setStatus={set.status}
          cardCount={cards.length}
          headingLevel="h3"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="default" className="pt-6 pb-6 sm:pt-8 sm:pb-8">
      <MeteorGame
        setId={set.id}
        cards={cards.map((c) => ({ id: c.id, term: c.term, definition: c.definition }))}
        initialBest={best.meteor}
      />
    </PageContainer>
  );
}
