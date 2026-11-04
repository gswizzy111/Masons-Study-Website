import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { Card } from "@/lib/types";
import { PageContainer } from "@/components/app-shell";
import { CardsEditor } from "@/components/sets/cards-editor";
import { fetchAll, getSet } from "@/components/sets/server-data";

type Params = Promise<{ setId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set ? `Cards: ${set.title}` : "Cards" };
}

export default async function SetCardsPage({ params }: { params: Params }) {
  const { setId } = await params;
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const cards = await fetchAll<Card>((from, to) =>
    supabase
      .from("cards")
      .select("*")
      .eq("set_id", set.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  return (
    <PageContainer className="pt-6 sm:pt-8">
      <CardsEditor
        setId={set.id}
        topics={set.topics}
        initialCards={cards}
        building={set.status === "building"}
      />
    </PageContainer>
  );
}
