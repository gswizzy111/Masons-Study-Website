import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
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
          <p className="font-mono text-sm font-medium text-ink-2">404</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.1] font-semibold tracking-[-0.02em] text-ink sm:text-5xl">
            This page isn’t here
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">
            The link may be out of date, or the page was moved or deleted.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
