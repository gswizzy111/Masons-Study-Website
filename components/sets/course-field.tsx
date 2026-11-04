"use client";

import { useId } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseColor } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COURSE_COLORS, courseDot, type CourseLite } from "@/components/sets/course-colors";

export type CourseChoice =
  | { mode: "none" }
  | { mode: "existing"; id: string }
  | { mode: "new"; name: string; color: CourseColor };

const NONE = "__none";
const NEW = "__new";

export function initialCourseChoice(courseId: string | null | undefined): CourseChoice {
  return courseId ? { mode: "existing", id: courseId } : { mode: "none" };
}

/** A readable problem with the choice, or null. */
export function courseChoiceError(choice: CourseChoice): string | null {
  if (choice.mode !== "new") return null;
  const name = choice.name.trim();
  if (!name) return "Name the course, or pick “No course”.";
  if (name.length > 120) return "Keep the course name under 120 characters.";
  return null;
}

/**
 * The course id to save. Creates the course when the choice is a new one
 * (reusing an existing course with the same name). Throws Error(message).
 */
export async function resolveCourseId(
  supabase: SupabaseClient,
  choice: CourseChoice,
  existing: CourseLite[],
): Promise<{ courseId: string | null; created: CourseLite | null }> {
  if (choice.mode === "none") return { courseId: null, created: null };
  if (choice.mode === "existing") return { courseId: choice.id, created: null };

  const name = choice.name.trim();
  const same = existing.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  if (same) return { courseId: same.id, created: null };

  const { data, error } = await supabase
    .from("courses")
    .insert({ name, color: choice.color })
    .select("id, name, color")
    .single();
  if (error || !data) throw new Error("Couldn't create the course. Try again in a moment.");
  const created = data as CourseLite;
  return { courseId: created.id, created };
}

/**
 * Course picker: no course, one of the user's courses, or a new course made
 * inline (name and color).
 */
export function CourseField({
  courses,
  value,
  onChange,
  error,
  disabled,
}: {
  courses: CourseLite[];
  value: CourseChoice;
  onChange: (value: CourseChoice) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  const selectValue = value.mode === "none" ? NONE : value.mode === "new" ? NEW : value.id;

  return (
    <div className="flex flex-col gap-4">
      <Select
        value={selectValue}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === NONE) onChange({ mode: "none" });
          else if (v === NEW) onChange({ mode: "new", name: "", color: "teal" });
          else onChange({ mode: "existing", id: v });
        }}
      >
        <Field
          label="Course"
          optional
          hint={courses.length ? "Group sets by class, like BIO 301." : "Group sets by class, like BIO 301. Pick “New course” to add one."}
          id={`${id}-course`}
        >
          {(p) => (
            <SelectTrigger id={p.id} aria-describedby={p["aria-describedby"]}>
              {/* Explicit text so the server HTML shows the choice before hydration. */}
              <SelectValue placeholder="No course">
                {value.mode === "none" ? (
                  "No course"
                ) : value.mode === "new" ? (
                  "New course"
                ) : (
                  <SelectedCourse course={courses.find((c) => c.id === value.id)} />
                )}
              </SelectValue>
            </SelectTrigger>
          )}
        </Field>
        <SelectContent>
          <SelectItem value={NONE}>No course</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", courseDot(c.color))} />
                {c.name}
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={NEW}>New course</SelectItem>
        </SelectContent>
      </Select>

      {value.mode === "new" ? (
        <div className="flex flex-col gap-4 rounded-md border border-line bg-surface-2 p-4">
          <Field label="Course name" error={error ?? undefined} required>
            <Input
              value={value.name}
              maxLength={120}
              autoComplete="off"
              placeholder="BIO 301"
              disabled={disabled}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </Field>
          <fieldset disabled={disabled}>
            <legend className="mb-2 text-sm font-medium text-ink">Color</legend>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((c) => (
                <label key={c.value} className="relative">
                  <input
                    type="radio"
                    name={`${id}-color`}
                    value={c.value}
                    checked={value.color === c.value}
                    onChange={() => onChange({ ...value, color: c.value })}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-surface",
                      "transition-[border-color,box-shadow] duration-150 ease-out hover:border-line-strong",
                      "peer-checked:border-ink peer-checked:shadow-[0_0_0_1px_var(--ink)]",
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                    )}
                  >
                    <span aria-hidden className={cn("size-5 rounded-full", c.dot)} />
                  </span>
                  <span className="sr-only">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

function SelectedCourse({ course }: { course: CourseLite | undefined }) {
  if (!course) return <>No course</>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", courseDot(course.color))} />
      <span className="truncate">{course.name}</span>
    </span>
  );
}
