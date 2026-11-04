import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function TestLoading() {
  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading the test
      </p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-64 max-w-full rounded-md" />
      </div>
      <div className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-surface px-5 py-6 sm:px-7">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="mt-2 h-10 w-32" />
      </div>
    </PageContainer>
  );
}
