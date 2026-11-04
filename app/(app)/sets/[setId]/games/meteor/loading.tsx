import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function MeteorLoading() {
  return (
    <PageContainer size="default" className="pt-6 pb-6 sm:pt-8 sm:pb-8">
      <p className="sr-only" role="status">
        Loading Meteor
      </p>
      <div aria-hidden>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-2 h-5 w-full max-w-md" />
        <Skeleton className="mt-5 h-[clamp(24rem,calc(100dvh-var(--header-h)-6.5rem),46rem)] w-full rounded-lg sm:mt-6" />
      </div>
    </PageContainer>
  );
}
