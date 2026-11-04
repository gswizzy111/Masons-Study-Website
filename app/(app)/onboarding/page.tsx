import type { Metadata } from "next";
import { requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PageContainer } from "@/components/app-shell";
import { completeOnboarding } from "@/components/profile/actions";
import { LearningProfileForm } from "@/components/profile/learning-profile-form";

export const metadata: Metadata = {
  title: "How you learn",
};

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, learning_profile")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "display_name" | "learning_profile">>();

  const firstName = profile?.display_name?.trim().split(/\s+/)[0];

  return (
    <PageContainer size="narrow" className="max-w-2xl">
      <header className="mb-8">
        <p className="text-sm font-medium text-accent-strong">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[2rem]">
          A few questions about how you learn
        </h1>
        <p className="mt-3 max-w-[58ch] text-[0.9375rem] leading-relaxed text-ink-2">
          Your answers shape every study guide, tutor answer, practice question and video pick.
          It takes about two minutes.
        </p>
      </header>

      <LearningProfileForm
        mode="steps"
        initialProfile={profile?.learning_profile ?? {}}
        action={completeOnboarding}
      />
    </PageContainer>
  );
}
