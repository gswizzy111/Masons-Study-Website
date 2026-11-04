import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function CardsLoading() {
  return (
    <PageContainer className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading cards
      </p>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Skeleton className="mb-6 h-10 w-full" />
      <Skeleton className="mb-3 h-5 w-40" />
      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-line">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-none" />
        ))}
      </div>
    </PageContainer>
  );
}
