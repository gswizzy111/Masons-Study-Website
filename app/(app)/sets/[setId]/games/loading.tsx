import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function GamesLoading() {
  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading games
      </p>
      <div aria-hidden>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
        <div className="mt-6 grid gap-5 sm:mt-8 sm:grid-cols-2 sm:gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
              <Skeleton className="h-40 rounded-none sm:h-44" />
              <div className="flex flex-col gap-3 p-5 sm:p-6">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-1 h-12 w-full sm:w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
