import { cn } from "@/lib/utils";
import { courseDot, type CourseLite } from "@/components/sets/course-colors";

/** A course name with its color dot. Neutral chip so the text keeps AA contrast. */
export function CourseChip({
  course,
  className,
  size = "sm",
}: {
  course: Pick<CourseLite, "name" | "color">;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm bg-surface-2 font-medium text-ink-2",
        size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[0.8125rem]",
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", courseDot(course.color))} />
      <span className="truncate">{course.name}</span>
    </span>
  );
}
