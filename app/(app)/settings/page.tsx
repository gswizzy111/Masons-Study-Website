import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveLearningProfile } from "@/components/profile/actions";
import { LearningProfileForm } from "@/components/profile/learning-profile-form";
import { DisplayNameForm } from "./display-name-form";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, learning_profile")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "display_name" | "learning_profile">>();

  const email = user.email ?? null;

  return (
    <PageContainer size="default">
      <PageHeader title="Settings" description="Your name, how you learn, and your account." />

      <div className="flex flex-col">
        <SettingsSection
          id="profile"
          title="Profile"
          description="How the site greets you."
        >
          <Card variant="flat">
            <CardContent className="pt-5 sm:pt-6">
              <DisplayNameForm initialName={profile?.display_name ?? ""} />
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection
          id="learning"
          title="Learning profile"
          description="Every study guide, tutor answer, practice question and video pick is shaped by these answers. Changes apply to anything new you make."
        >
          <Card variant="flat">
            <CardContent className="pt-6 pb-0 sm:pt-7 sm:pb-0">
              <LearningProfileForm
                mode="single"
                initialProfile={profile?.learning_profile ?? {}}
                action={saveLearningProfile}
              />
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection
          id="account"
          title="Account"
          description="The email you log in with, and your password."
        >
          <Card variant="flat">
            <CardContent className="flex flex-col gap-7 pt-5 sm:pt-6">
              <Field label="Email" hint="This is how you log in. It can’t be changed here.">
                <Input
                  type="email"
                  value={email ?? "No email on this account"}
                  readOnly
                  className="bg-surface-2 text-ink-2 hover:border-line"
                />
              </Field>
              <div className="border-t border-line pt-6">
                <h3 className="mb-4 text-[0.9375rem] font-medium text-ink">Change password</h3>
                <PasswordForm email={email} />
              </div>
            </CardContent>
          </Card>
        </SettingsSection>

        <SettingsSection
          id="sign-out"
          title="Sign out"
          description="Signing out keeps everything you made. Log back in any time."
        >
          <Card variant="flat">
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:pt-6">
              <form method="post" action="/auth/signout">
                <Button type="submit" variant="outline" className="w-full sm:w-auto">
                  <LogOut strokeWidth={1.75} aria-hidden />
                  Sign out
                </Button>
              </form>
              <form method="post" action="/auth/signout">
                <input type="hidden" name="scope" value="global" />
                <Button type="submit" variant="ghost" className="w-full sm:w-auto">
                  Sign out on all devices
                </Button>
              </form>
            </CardContent>
          </Card>
        </SettingsSection>
      </div>
    </PageContainer>
  );
}

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="grid scroll-mt-24 gap-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10 lg:py-10"
    >
      <div className="min-w-0">
        <h2
          id={headingId}
          className="font-display text-xl font-semibold tracking-[-0.01em] text-ink"
        >
          {title}
        </h2>
        <p className="mt-1.5 max-w-[48ch] text-sm leading-relaxed text-ink-2">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
