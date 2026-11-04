import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function LearnLoading() {
  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading Learn
      </p>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mt-5 h-[84px] w-full rounded-lg" />
      <Skeleton className="mt-6 mb-3 h-4 w-full" />
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-3 px-5 py-6 sm:px-7">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
        </div>
        <div className="grid gap-2.5 border-t border-line px-4 py-5 sm:grid-cols-2 sm:px-7">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
