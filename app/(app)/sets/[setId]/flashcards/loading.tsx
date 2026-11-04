import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

export default function FlashcardsLoading() {
  return (
    <PageContainer size="default" className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading flashcards
      </p>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5" aria-hidden>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-10 w-full sm:w-80" />
          <Skeleton className="h-10 w-full sm:w-64" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-8 w-44" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
        <Skeleton className="mt-12 h-[clamp(17rem,50dvh,25rem)] w-full rounded-lg sm:h-[22rem] lg:h-[24rem]" />
        <div className="flex gap-2">
          <Skeleton className="h-12 w-11 sm:w-12" />
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="h-12 w-11 sm:w-12" />
        </div>
      </div>
    </PageContainer>
  );
}
