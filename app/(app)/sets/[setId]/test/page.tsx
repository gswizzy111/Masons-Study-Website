import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { aiConfigured } from "@/lib/env";
import { fetchAll, getSet } from "@/components/sets/server-data";
import { LEARN_CARD_COLUMNS, type LearnCardRow } from "@/components/learn/learn-data";
import {
  EXAM_ATTEMPT_COLUMNS,
  EXAM_QUESTION_COLUMNS,
  cleanQuestions,
  type AttemptRow,
} from "@/components/test/test-data";
import { TestPage } from "@/components/test/test-page";

type Props = {
  params: Promise<{ setId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set ? `Test · ${set.title}` : "Test" };
}

export default async function SetTestPage({ params, searchParams }: Props) {
  const [{ setId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const [cards, questions, attempts] = await Promise.all([
    fetchAll<LearnCardRow>((from, to) =>
      supabase
        .from("cards")
        .select(LEARN_CARD_COLUMNS)
        .eq("set_id", set.id)
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<unknown>((from, to) =>
      supabase
        .from("exam_questions")
        .select(EXAM_QUESTION_COLUMNS)
        .eq("set_id", set.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAll<AttemptRow>((from, to) =>
      supabase
        .from("test_attempts")
        .select(EXAM_ATTEMPT_COLUMNS)
        .eq("set_id", set.id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const tab = (Array.isArray(query.tab) ? query.tab[0] : query.tab) === "exam" ? "exam" : "cards";

  return (
    <TestPage
      setId={set.id}
      setStatus={set.status}
      topics={set.topics}
      cards={cards}
      questions={cleanQuestions(questions)}
      attempts={attempts}
      initialTab={tab}
      aiReady={aiConfigured()}
    />
  );
}
