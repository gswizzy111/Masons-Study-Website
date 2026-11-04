import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown under the set header and tabs while a set tab loads. Tabs with their
 * own loading.tsx show that instead; this covers the overview.
 */
export default function SetLoading() {
  return (
    <PageContainer className="flex flex-col gap-6 pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading the set
      </p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-6 rounded-lg border border-line bg-surface p-6">
            <Skeleton className="size-[120px] shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </PageContainer>
  );
}
