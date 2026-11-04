import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { getSet } from "@/components/sets/server-data";
import { GuideView } from "@/components/guide/guide-view";
import { GUIDE_SECTION_COLUMNS, type GuideSectionRow } from "@/components/guide/guide-data";

type Props = { params: Promise<{ setId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => null);
  return { title: set ? `Study guide · ${set.title}` : "Study guide" };
}

export default async function GuidePage({ params }: Props) {
  const { setId } = await params;
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const { data, error } = await supabase
    .from("guide_sections")
    .select(GUIDE_SECTION_COLUMNS)
    .eq("set_id", set.id)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);

  return (
    <GuideView
      setId={set.id}
      setTitle={set.title}
      initialStatus={set.status}
      initialTopics={set.topics}
      initialSections={(data ?? []) as GuideSectionRow[]}
    />
  );
}
