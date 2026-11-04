import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { NewSetForm } from "@/components/sets/new-set-form";
import { getCourses } from "@/components/sets/server-data";

export const metadata: Metadata = { title: "New study set" };

export default async function NewSetPage() {
  const { supabase, user } = await requireUser();
  const courses = await getCourses(supabase);

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="New study set"
        description="Name it, add your material, and Claude builds a study guide and flashcards around how you learn."
      />
      <NewSetForm courses={courses} userId={user.id} />
    </PageContainer>
  );
}
