"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CourseField,
  courseChoiceError,
  initialCourseChoice,
  resolveCourseId,
  type CourseChoice,
} from "@/components/sets/course-field";
import type { CourseLite } from "@/components/sets/course-colors";
import { removeSetFiles } from "@/components/sets/upload-material";

export type SetActionsSet = {
  id: string;
  title: string;
  description: string | null;
  exam_date: string | null;
  course_id: string | null;
};

/** The set's "more" menu: edit details, delete. */
export function SetActions({
  set,
  courses,
  userId,
}: {
  set: SetActionsSet;
  courses: CourseLite[];
  userId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // A fresh key per opening resets the form, while the closing animation still plays.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Set options">
            <Ellipsis strokeWidth={1.75} aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              setOpenCount((n) => n + 1);
              setEditOpen(true);
            }}
          >
            <Pencil strokeWidth={1.75} aria-hidden />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="danger"
            onSelect={() => {
              setOpenCount((n) => n + 1);
              setDeleteOpen(true);
            }}
          >
            <Trash2 strokeWidth={1.75} aria-hidden />
            Delete set
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <EditSetDialogContent
          key={`edit-${openCount}`}
          set={set}
          courses={courses}
          onDone={() => setEditOpen(false)}
        />
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DeleteSetDialogContent key={`delete-${openCount}`} set={set} userId={userId} />
      </Dialog>
    </>
  );
}

function EditSetDialogContent({
  set,
  courses: initialCourses,
  onDone,
}: {
  set: SetActionsSet;
  courses: CourseLite[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [courses] = useState(initialCourses);
  const [title, setTitle] = useState(set.title);
  const [course, setCourse] = useState<CourseChoice>(initialCourseChoice(set.course_id));
  const [examDate, setExamDate] = useState(set.exam_date ?? "");
  const [description, setDescription] = useState(set.description ?? "");
  const [errors, setErrors] = useState<{ title?: string; course?: string; description?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    const t = title.trim();
    if (!t) next.title = "Give the set a name.";
    else if (t.length > 200) next.title = "Keep the name under 200 characters.";
    if (description.trim().length > 2000) next.description = "Keep the description under 2,000 characters.";
    const courseError = courseChoiceError(course);
    if (courseError) next.course = courseError;
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    const supabase = createClient();
    try {
      const { courseId } = await resolveCourseId(supabase, course, courses);
      const { error } = await supabase
        .from("study_sets")
        .update({
          title: t,
          description: description.trim() || null,
          exam_date: examDate || null,
          course_id: courseId,
        })
        .eq("id", set.id);
      if (error) throw new Error("Couldn't save the changes. Try again in a moment.");
      toast.success("Set details saved");
      onDone();
      router.refresh();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : "Couldn't save the changes." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent title="Edit details" description="Name, course, exam date and description." size="md">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Field label="Name" required error={errors.title}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoComplete="off" />
        </Field>
        <CourseField courses={courses} value={course} onChange={setCourse} error={errors.course} disabled={saving} />
        <Field label="Exam date" optional>
          <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="sm:max-w-56" />
        </Field>
        <Field label="Description" optional error={errors.description}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} />
        </Field>
        {errors.form ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {errors.form}
          </p>
        ) : null}
        <DialogFooter className="mt-1">
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DeleteSetDialogContent({ set, userId }: { set: SetActionsSet; userId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    try {
      const { data: materials, error: listError } = await supabase
        .from("materials")
        .select("storage_path")
        .eq("set_id", set.id);
      if (listError) throw new Error("Couldn't reach your files. Try again in a moment.");
      await removeSetFiles({
        supabase,
        userId,
        setId: set.id,
        extraPaths: (materials ?? [])
          .map((m) => (m as { storage_path: string | null }).storage_path)
          .filter((p): p is string => Boolean(p)),
      });
      const { error: deleteError } = await supabase.from("study_sets").delete().eq("id", set.id);
      if (deleteError) throw new Error("Couldn't delete the set. Try again in a moment.");
      toast.success(`Deleted “${set.title}”`);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the set.");
      setDeleting(false);
    }
  }

  return (
    <DialogContent
      title="Delete this set?"
      description={
        <>
          <span className="font-medium text-ink">{set.title}</span> will be deleted with its study
          guide, cards, progress, test results, chat and uploaded files. This can&apos;t be undone.
        </>
      }
      size="sm"
    >
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button" disabled={deleting}>
            Keep it
          </Button>
        </DialogClose>
        <Button variant="danger" type="button" onClick={onDelete} loading={deleting}>
          Delete set
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
