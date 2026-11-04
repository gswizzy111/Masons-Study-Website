import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { KeyRound, LinkIcon, Settings } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { isRecoveryFor, RECOVERY_COOKIE } from "@/app/auth/recovery-cookie";
import { AuthCard } from "../auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  const user = await getUser();

  if (!user) {
    return (
      <AuthCard
        icon={<LinkIcon strokeWidth={1.75} aria-hidden />}
        title="This link has expired"
        description="Reset links work once and only for a while. Ask for a new one and open it in this browser."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Get a new reset link</Link>
        </Button>
      </AuthCard>
    );
  }

  const cookieStore = await cookies();
  if (!isRecoveryFor(cookieStore.get(RECOVERY_COOKIE)?.value, user.id)) {
    // Signed in, but not from a reset link: change it in Settings instead,
    // which asks for the current password.
    return (
      <AuthCard
        icon={<Settings strokeWidth={1.75} aria-hidden />}
        title="Change your password in Settings"
        description="You’re already logged in. Settings asks for your current password, then lets you pick a new one."
      >
        <Button asChild size="lg" className="w-full">
          <Link href="/settings#account">Go to Settings</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={<KeyRound strokeWidth={1.75} aria-hidden />}
      title="Choose a new password"
      description={
        user.email ? (
          <>
            For <span className="font-medium break-all text-ink">{user.email}</span>. You’ll stay
            logged in on this device.
          </>
        ) : (
          "You’ll stay logged in on this device."
        )
      }
    >
      <ResetPasswordForm email={user.email ?? null} />
    </AuthCard>
  );
}
