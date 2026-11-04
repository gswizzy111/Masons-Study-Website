"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <div className="rounded-lg border border-line bg-surface p-6 shadow-md sm:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-ink">
          This page didn’t load
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          Something went wrong while loading it. Try again, and if it keeps happening, go back to
          your dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => (retry ?? reset)?.()}>
            <RotateCw aria-hidden strokeWidth={1.75} />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
        {digest ? (
          <p className="mt-6 text-xs text-ink-2">
            Error reference: <span className="font-mono">{digest}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
