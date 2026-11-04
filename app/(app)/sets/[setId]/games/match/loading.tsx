import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function MatchLoading() {
  return (
    <PageContainer size="default" className="pt-6 pb-6 sm:pt-8 sm:pb-8">
      <p className="sr-only" role="status">
        Loading Match
      </p>
      <div aria-hidden>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-3 h-8 w-28" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
        <div className="mt-5 mb-3 flex items-center justify-between sm:mt-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="mb-3 h-4 w-64" />
        <div className="grid h-[clamp(22rem,calc(100dvh-var(--header-h)-9rem),34rem)] auto-rows-fr grid-cols-3 gap-2 sm:h-[clamp(24rem,calc(100dvh-var(--header-h)-12rem),32rem)] sm:grid-cols-4 sm:gap-3">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-full" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
