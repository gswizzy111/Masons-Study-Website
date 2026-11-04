import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/env";
import { newSeed } from "@/lib/learn/random";
import { getSet, fetchAll } from "@/components/sets/server-data";
import { LearnSession } from "@/components/learn/learn-session";
import {
  LEARN_CARD_COLUMNS,
  LEARN_PROGRESS_COLUMNS,
  parseLearnParams,
  type LearnCardRow,
  type LearnProgressRow,
} from "@/components/learn/learn-data";

type Props = {
  params: Promise<{ setId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => undefined);
  if (set === null) return { title: "Set not found" };
  return { title: set ? `Learn · ${set.title}` : "Learn" };
}

export default async function LearnPage({ params, searchParams }: Props) {
  const [{ setId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, progress] = await Promise.all([
    fetchAll<LearnCardRow>((from, to) =>
      supabase
        .from("cards")
        .select(LEARN_CARD_COLUMNS)
        .eq("set_id", set.id)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<LearnProgressRow>((from, to) =>
      supabase
        .from("card_progress")
        .select(LEARN_PROGRESS_COLUMNS)
        .eq("set_id", set.id)
        .order("card_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const topicIds = new Set(set.topics.map((t) => t.id));
  const initial = parseLearnParams(query, topicIds);

  return (
    <LearnSession
      setId={set.id}
      setStatus={set.status}
      topics={set.topics}
      cards={cards}
      progress={progress}
      initialOptions={initial}
      aiReady={aiConfigured()}
      seed={newSeed()}
      nowIso={new Date().toISOString()}
      examDate={set.exam_date}
    />
  );
}
