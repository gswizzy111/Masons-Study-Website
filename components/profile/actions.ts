"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { text, type FormState } from "@/components/profile/form-state";
import { normalizeLearningProfile } from "@/components/profile/learning-profile-options";
import type { ProfileField } from "@/components/profile/learning-profile-form";
import type { LearningProfile } from "@/lib/types";

const SAVE_ERROR = "We couldn’t save your answers. Check your connection and try again.";

function parseProfile(formData: FormData): LearningProfile | null {
  try {
    return normalizeLearningProfile(JSON.parse(text(formData, "profile") || "{}"));
  } catch {
    return null;
  }
}

/** Onboarding: saves the learning profile, marks the account onboarded, then /dashboard. */
export async function completeOnboarding(
  _prev: FormState<ProfileField>,
  formData: FormData,
): Promise<FormState<ProfileField>> {
  const profile = parseProfile(formData);
  if (!profile) return { status: "error", message: SAVE_ERROR, at: Date.now() };

  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").upsert(
    { id: user.id, learning_profile: profile, onboarded_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  if (error) {
    console.error("[profile] completeOnboarding:", error.message);
    return { status: "error", message: SAVE_ERROR, at: Date.now() };
  }

  redirect("/dashboard");
}

/** Settings: saves the learning profile and returns what was stored. */
export async function saveLearningProfile(
  _prev: FormState<ProfileField>,
  formData: FormData,
): Promise<FormState<ProfileField>> {
  const profile = parseProfile(formData);
  if (!profile) return { status: "error", message: SAVE_ERROR, at: Date.now() };

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, learning_profile: profile }, { onConflict: "id" });
  if (error) {
    console.error("[profile] saveLearningProfile:", error.message);
    return { status: "error", message: SAVE_ERROR, at: Date.now() };
  }

  // Someone who skipped onboarding has now filled the profile in: stop
  // sending them to /onboarding after they log in.
  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  return {
    status: "success",
    values: { profile: JSON.stringify(profile) },
    at: Date.now(),
  };
}
