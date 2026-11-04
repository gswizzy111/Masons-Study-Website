import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SkipLink } from "@/components/app-shell";

/** Calm, centered frame for log in, sign up and password pages. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      {/* A faint notebook grid that fades out toward the edges. */}
      <div
        aria-hidden
        className="graph-paper pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] opacity-70 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
      />
      <SkipLink />
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Brand href="/" />
        <ThemeToggle />
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center px-4 pt-6 pb-16 focus:outline-none sm:justify-center sm:px-6 sm:pt-4 sm:pb-24"
      >
        <div className="w-full max-w-[26.5rem]">{children}</div>
      </main>

      <footer className="px-4 pb-6 text-center text-sm text-ink-2 sm:px-6">
        Everything you make here is private to your account.
      </footer>
    </div>
  );
}
