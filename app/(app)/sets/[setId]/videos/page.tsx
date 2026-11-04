import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { aiConfigured, youtubeConfigured } from "@/lib/env";
import type { VideoSuggestion } from "@/lib/types";
import { PageContainer } from "@/components/app-shell";
import { getSet } from "@/components/sets/server-data";
import { VideosView } from "@/components/videos/videos-view";
import {
  VIDEO_SUGGESTION_COLUMNS,
  normalizeTopics,
  orderedSuggestions,
} from "@/components/videos/video-data";

type Props = { params: Promise<{ setId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { setId } = await params;
  const set = await getSet(setId).catch(() => undefined);
  if (set === null) return { title: "Set not found" };
  return { title: set ? `Videos · ${set.title}` : "Videos" };
}

export default async function VideosPage({ params }: Props) {
  const { setId } = await params;
  const { supabase } = await requireUser();
  const set = await getSet(setId);
  if (!set) notFound();

  const { data, error } = await supabase
    .from("video_suggestions")
    .select(VIDEO_SUGGESTION_COLUMNS)
    .eq("set_id", set.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const topics = normalizeTopics(set.topics);

  return (
    <PageContainer className="pt-6 sm:pt-8">
      <VideosView
        key={topics.map((t) => t.id).join(",")}
        setId={set.id}
        setStatus={set.status}
        topics={topics}
        initialSuggestions={orderedSuggestions(topics, (data ?? []) as VideoSuggestion[])}
        youtubeConfigured={youtubeConfigured()}
        aiConfigured={aiConfigured()}
      />
    </PageContainer>
  );
}
