import type { Course, CourseColor } from "@/lib/types";

/** Course colors, in picker order. Dots only: course names stay in ink for contrast. */
export const COURSE_COLORS: ReadonlyArray<{ value: CourseColor; label: string; dot: string }> = [
  { value: "teal", label: "Teal", dot: "bg-teal-600 dark:bg-teal-400" },
  { value: "blue", label: "Blue", dot: "bg-blue-600 dark:bg-blue-400" },
  { value: "green", label: "Green", dot: "bg-green-600 dark:bg-green-400" },
  { value: "amber", label: "Amber", dot: "bg-amber-500 dark:bg-amber-400" },
  { value: "rose", label: "Rose", dot: "bg-rose-600 dark:bg-rose-400" },
  { value: "violet", label: "Violet", dot: "bg-violet-600 dark:bg-violet-400" },
  { value: "slate", label: "Slate", dot: "bg-slate-500 dark:bg-slate-400" },
];

const DOTS = new Map(COURSE_COLORS.map((c) => [c.value, c.dot]));

/** The dot class for a course color (falls back to teal for unknown values). */
export function courseDot(color: string | null | undefined): string {
  return DOTS.get(color as CourseColor) ?? DOTS.get("teal")!;
}

export type CourseLite = Pick<Course, "id" | "name" | "color">;
