import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import type { MasteryLevel } from "@/lib/types";
import { fetchAll, getSet } from "@/components/sets/server-data";
import { FlashcardsView } from "@/components/flashcards/flashcards-view";
import {
  ALL_TOPICS,
  FLASHCARD_COLUMNS,
  OTHER_TOPIC_ID,
  type FlashcardData,
} from "@/components/flashcards/deck-utils";

type Props = {
  params: Promise<{ setId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ProgressRow = { card_id: string; level: MasteryLevel };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set ? `Flashcards · ${set.title}` : "Flashcards" };
}

export default async function FlashcardsPage({ params, searchParams }: Props) {
  const [{ setId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, progress] = await Promise.all([
    fetchAll<FlashcardData>((from, to) =>
      supabase
        .from("cards")
        .select(FLASHCARD_COLUMNS)
        .eq("set_id", set.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<ProgressRow>((from, to) =>
      supabase
        .from("card_progress")
        .select("card_id, level")
        .eq("set_id", set.id)
        .order("card_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  // ?topic= picks a topic of this set (or "other"); anything else shows all.
  const rawTopic = Array.isArray(query.topic) ? query.topic[0] : query.topic;
  const topic =
    rawTopic && (rawTopic === OTHER_TOPIC_ID || set.topics.some((t) => t.id === rawTopic))
      ? rawTopic
      : ALL_TOPICS;

  return (
    <FlashcardsView
      key={topic}
      setId={set.id}
      setStatus={set.status}
      topics={set.topics}
      initialCards={cards}
      initialProgress={progress}
      initialTopic={topic}
    />
  );
}
