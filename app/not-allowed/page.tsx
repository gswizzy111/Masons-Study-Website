import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { NOT_ALLOWED_MESSAGE } from "@/lib/access";

export const metadata: Metadata = {
  title: "No access",
};

// Shown to someone signed in with an account that isn't on ALLOWED_EMAILS
// (logins are shared with another app in the same Supabase project).
export default function NotAllowed() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Brand href="/" />
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 pb-24 sm:px-6 lg:px-8"
      >
        <div className="max-w-xl">
          <h1 className="font-display text-4xl leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-5xl">
            No access
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">
            {NOT_ALLOWED_MESSAGE} Sign out and log in with the account it was set up for.
          </p>
          <form method="post" action="/auth/signout" className="mt-8">
            <Button type="submit" size="lg">
              Sign out
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
