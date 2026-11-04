import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * notFound() inside the signed-in app (today: a study set that doesn't
 * exist or was deleted). It renders inside AppShell's <main>, so it has no
 * header or <main> of its own. Nested not-found files can't set metadata;
 * the set layout and pages title a missing set "Set not found".
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="max-w-xl">
        <p className="font-mono text-sm font-medium text-ink-2">404</p>
        <h1 className="mt-3 font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[2.25rem]">
          This set isn’t here
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-2">
          It may have been deleted, or the link is out of date. Your other sets are on the
          dashboard.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/sets/new">New set</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
