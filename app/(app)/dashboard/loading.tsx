import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <PageContainer>
      <p className="sr-only" role="status">
        Loading your dashboard
      </p>
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        <Skeleton className="h-52 rounded-lg lg:col-span-2" />
        <Skeleton className="h-52 rounded-lg" />
      </div>
      <Skeleton className="mt-12 mb-5 h-8 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-lg" />
        ))}
      </div>
    </PageContainer>
  );
}
