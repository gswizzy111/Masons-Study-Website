import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function GuideLoading() {
  return (
    <PageContainer className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading the study guide
      </p>
      <div className="@container">
        <div className="grid gap-x-12 @4xl:grid-cols-[15rem_minmax(0,1fr)] @6xl:grid-cols-[16.5rem_minmax(0,1fr)] @6xl:gap-x-16">
          <div className="hidden flex-col gap-3 @4xl:flex" aria-hidden>
            <Skeleton className="mb-1 h-4 w-20" />
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-5" style={{ width: `${70 + ((i * 37) % 30)}%` }} />
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-3" aria-hidden>
            <Skeleton className="mb-4 h-12 w-full @4xl:hidden" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-2/3" />
            <div className="mt-4 flex max-w-[68ch] flex-col gap-2.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[94%]" />
              <Skeleton className="h-4 w-[88%]" />
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="mt-4 h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[72%]" />
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
