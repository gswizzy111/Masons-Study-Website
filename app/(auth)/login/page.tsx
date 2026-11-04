import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/supabase/server";
import { FormAlert } from "@/components/profile/form-alert";
import { AuthCard } from "../auth-card";
import { linkErrorMessage } from "../link-errors";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));
  const linkError = linkErrorMessage(first(params.error));

  return (
    <AuthCard
      title="Welcome back"
      description="Log in to pick up where you left off."
      footer={
        <>
          New here?{" "}
          <Link
            href="/signup"
            className="rounded-xs font-medium text-accent-strong underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {linkError ? (
        <FormAlert tone="info" className="mb-6">
          {linkError}
        </FormAlert>
      ) : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
