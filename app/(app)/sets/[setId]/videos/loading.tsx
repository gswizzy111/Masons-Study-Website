import { PageContainer } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCardSkeleton } from "@/components/videos/video-card";
import { VIDEO_ITEM_CLASS, VIDEO_ROW_CLASS } from "@/components/videos/video-data";

export default function VideosLoading() {
  return (
    <PageContainer className="pt-6 sm:pt-8">
      <p className="sr-only" role="status">
        Loading videos
      </p>
      <div aria-hidden>
        <div className="mb-6 flex flex-col gap-2 sm:mb-8">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        {[0, 1].map((section) => (
          <div
            key={section}
            className="border-t border-line py-8 first:border-t-0 first:pt-0 sm:py-10"
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-6 w-64 max-w-full" />
            <Skeleton className="mt-3 mb-5 h-4 w-full max-w-xl" />
            <div className={VIDEO_ROW_CLASS}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={VIDEO_ITEM_CLASS}>
                  <VideoCardSkeleton />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
