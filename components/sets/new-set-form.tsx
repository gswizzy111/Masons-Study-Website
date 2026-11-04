"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startJob } from "@/lib/jobs/start-job";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CourseField,
  courseChoiceError,
  resolveCourseId,
  type CourseChoice,
} from "@/components/sets/course-field";
import type { CourseLite } from "@/components/sets/course-colors";
import { MAX_NOTES_CHARS } from "@/components/sets/material-files";
import { MaterialUploader, useUploadQueue } from "@/components/sets/material-uploader";
import { insertNotesMaterial } from "@/components/sets/upload-material";

type Phase =
  | { name: "editing" }
  | { name: "working"; step: string }
  | { name: "partial"; failed: number; total: number }
  | { name: "start-failed"; message: string }
  | { name: "error"; message: string };

type Errors = Partial<Record<"title" | "description" | "course" | "notes", string>>;

/**
 * New study set: details, files and pasted notes. Creates the set, uploads
 * each file straight to Storage, saves the material rows, starts the build
 * and opens the set. Failures along the way keep what was saved and offer a
 * retry.
 */
export function NewSetForm({
  courses: initialCourses,
  userId,
  aiReady = true,
}: {
  courses: CourseLite[];
  userId: string;
  /** Claude is configured. Without it the set is saved with its material but not built. */
  aiReady?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const queue = useUploadQueue();

  const [courses, setCourses] = useState(initialCourses);
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<CourseChoice>({ mode: "none" });
  const [examDate, setExamDate] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<Phase>({ name: "editing" });

  // What has been saved so far, so a retry never makes a second set or course.
  const [setId, setSetId] = useState<string | null>(null);
  const [createdCourseId, setCreatedCourseId] = useState<string | null>(null);
  const [notesSaved, setNotesSaved] = useState(false);

  const working = phase.name === "working";
  const locked = setId !== null;
  const fileCount = queue.items.length;
  const hasNotes = notes.trim().length > 0;
  const hasMaterial = fileCount > 0 || hasNotes;

  // Warn before leaving mid-upload.
  useEffect(() => {
    if (!working) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [working]);

  function validate(): Errors {
    const next: Errors = {};
    const t = title.trim();
    if (!t) next.title = "Give the set a name.";
    else if (t.length > 200) next.title = "Keep the name under 200 characters.";
    if (description.trim().length > 2000) next.description = "Keep the description under 2,000 characters.";
    const courseError = courseChoiceError(course);
    if (courseError) next.course = courseError;
    if (notes.trim().length > MAX_NOTES_CHARS) {
      next.notes = "That's more than 500,000 characters. Save it as a .txt file and upload that instead.";
    }
    return next;
  }

  async function startBuild(id: string) {
    setPhase({ name: "working", step: "Starting the build" });
    try {
      await startJob(id, "build_set");
    } catch (err) {
      setPhase({
        name: "start-failed",
        message: err instanceof Error ? err.message : "The build didn't start.",
      });
      return;
    }
    router.push(`/sets/${id}`);
  }

  async function finish(id: string, materialCount: number) {
    // Without Claude a build would only fail: save the set and its material,
    // and the overview says how to build it later.
    if (materialCount > 0 && aiReady) await startBuild(id);
    else router.push(`/sets/${id}`);
  }

  async function uploadAndFinish(id: string) {
    const supabase = createClient();
    let saved = queue.items.filter((it) => it.status === "done").length;

    if (hasNotes && !notesSaved) {
      setPhase({ name: "working", step: "Saving your notes" });
      try {
        await insertNotesMaterial({ supabase, setId: id, text: notes });
        setNotesSaved(true);
      } catch (err) {
        setPhase({ name: "error", message: err instanceof Error ? err.message : "Couldn't save your notes." });
        return;
      }
    }
    const notesCount = hasNotes ? 1 : 0;

    const toUpload = queue.items.filter((it) => it.status !== "done").length;
    if (toUpload > 0) {
      setPhase({ name: "working", step: `Uploading ${pluralize(toUpload, "file")}` });
      const result = await queue.uploadPending({ supabase, userId, setId: id });
      saved += result.uploaded;
      if (result.failed > 0) {
        setPhase({ name: "partial", failed: result.failed, total: queue.items.length });
        return;
      }
    }

    await finish(id, saved + notesCount);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (working) return;

    if (setId) {
      await uploadAndFinish(setId);
      return;
    }

    const found = validate();
    setErrors(found);
    const firstInvalid = (["title", "course", "description", "notes"] as const).find((k) => found[k]);
    if (firstInvalid) {
      const target =
        firstInvalid === "course"
          ? document.getElementById(`${formId}-course-name`)?.querySelector("input")
          : document.getElementById(`${formId}-${firstInvalid}`);
      (target as HTMLElement | null | undefined)?.focus();
      return;
    }

    const supabase = createClient();
    setPhase({ name: "working", step: "Creating the set" });

    let courseId: string | null = null;
    try {
      if (course.mode === "new" && createdCourseId) {
        courseId = createdCourseId;
      } else {
        const resolved = await resolveCourseId(supabase, course, courses);
        courseId = resolved.courseId;
        if (resolved.created) {
          const created = resolved.created;
          setCreatedCourseId(created.id);
          setCourses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
          setCourse({ mode: "existing", id: created.id });
        }
      }
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Couldn't create the course." });
      return;
    }

    const { data, error } = await supabase
      .from("study_sets")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        exam_date: examDate || null,
        course_id: courseId,
      })
      .select("id")
      .single();

    if (error || !data) {
      setPhase({ name: "error", message: "Couldn't create the set. Check your connection and try again." });
      return;
    }

    const id = (data as { id: string }).id;
    setSetId(id);
    await uploadAndFinish(id);
  }

  const submitLabel = locked
    ? queue.items.some((it) => it.status === "error")
      ? "Retry failed uploads"
      : "Continue"
    : hasMaterial && aiReady
      ? "Create and build"
      : "Create set";

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-6" aria-busy={working}>
      <Card variant="flat" className="gap-5 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">Details</h2>
          {locked ? (
            <p className="mt-1 text-sm text-ink-2">
              The set is saved. You can change these details later from the set&apos;s menu.
            </p>
          ) : null}
        </div>

        <Field
          label="Name"
          required
          id={`${formId}-title`}
          error={errors.title}
          hint="One exam or unit works best."
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Exam 2: Metabolism"
            maxLength={200}
            autoComplete="off"
            disabled={locked || working}
          />
        </Field>

        <div id={`${formId}-course-name`}>
          <CourseField
            courses={courses}
            value={course}
            onChange={(v) => {
              setCourse(v);
              if (errors.course) setErrors((prev) => ({ ...prev, course: undefined }));
            }}
            error={errors.course}
            disabled={locked || working}
          />
        </div>

        <Field label="Exam date" optional hint="Adds a countdown to the set and your dashboard.">
          <Input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            disabled={locked || working}
            className="sm:max-w-56"
          />
        </Field>

        <Field
          label="Description"
          optional
          id={`${formId}-description`}
          error={errors.description}
          hint="What the exam covers, or a note for yourself."
        >
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Chapters 9 to 12: glycolysis, the TCA cycle, oxidative phosphorylation"
            disabled={locked || working}
          />
        </Field>
      </Card>

      <Card variant="flat" className="gap-5 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">Material</h2>
          <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink-2">
            Add everything the exam covers: slides, notes, readings, photos of handwritten pages.
            Claude reads all of it. You can add more later.
          </p>
        </div>

        <MaterialUploader queue={queue} disabled={working} label="Files" />

        <Field
          label="Paste notes"
          optional
          id={`${formId}-notes`}
          error={errors.notes}
          hint={
            notesSaved
              ? "Your notes are saved to the set."
              : "Typed notes, a reading or anything copied from a document."
          }
        >
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Paste or type notes here"
            disabled={working || notesSaved}
            className="font-[inherit]"
          />
        </Field>
        {notes.length > 0 ? (
          <p className="-mt-3 text-right font-mono text-xs text-ink-2 tabular-nums">
            {notes.trim().length.toLocaleString("en-US")} characters
          </p>
        ) : null}
      </Card>

      <PhaseMessage
        phase={phase}
        setId={setId}
        onStartBuild={startBuild}
        onContinue={finish}
        queueSaved={queue.items.filter((it) => it.status === "done").length + (notesSaved ? 1 : 0)}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-[52ch] items-start gap-2 text-sm leading-relaxed text-ink-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-strong" strokeWidth={1.75} aria-hidden />
          {!aiReady
            ? "Claude isn't connected to this site yet, so the set is saved with your material and built once Claude is connected."
            : hasMaterial
              ? "Claude writes a study guide and flashcards from your material. It takes a few minutes, and you can leave while it works."
              : "No material yet? You can create the set now and add files later."}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {!locked ? (
            <Button asChild variant="ghost">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          ) : null}
          {phase.name !== "start-failed" && phase.name !== "partial" ? (
            <Button type="submit" size="lg" loading={working}>
              {working ? (phase.name === "working" ? phase.step : "Working") : submitLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function PhaseMessage({
  phase,
  setId,
  onStartBuild,
  onContinue,
  queueSaved,
}: {
  phase: Phase;
  setId: string | null;
  onStartBuild: (id: string) => void;
  onContinue: (id: string, materialCount: number) => void;
  queueSaved: number;
}) {
  if (phase.name === "working") {
    return (
      <p role="status" className="sr-only">
        {phase.step}
      </p>
    );
  }

  if (phase.name === "partial" && setId) {
    return (
      <Alert title={`${phase.failed} of ${pluralize(phase.total, "file")} didn't upload`}>
        <p>
          The set is saved{queueSaved > 0 ? ", along with everything else" : ""}. Retry the failed
          files, remove them, or continue without them.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Retry failed uploads
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onContinue(setId, queueSaved)}>
            Continue without them
          </Button>
        </div>
      </Alert>
    );
  }

  if (phase.name === "start-failed" && setId) {
    return (
      <Alert title="Your set is saved, but the build didn't start">
        <p>{phase.message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onStartBuild(setId)}>
            Try again
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/sets/${setId}`}>Open the set</Link>
          </Button>
        </div>
      </Alert>
    );
  }

  if (phase.name === "error") {
    return (
      <Alert title="Something went wrong">
        <p>{phase.message}</p>
      </Alert>
    );
  }

  return null;
}

function Alert({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm leading-relaxed text-ink">
      <p className="mb-1 flex items-center gap-2 font-medium text-danger">
        <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {title}
      </p>
      {children}
    </div>
  );
}
