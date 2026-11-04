"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FilePlus2, Hammer, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { startJob } from "@/lib/jobs/start-job";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { JobProgress } from "@/components/jobs/job-progress";
import { AddMaterialDialog } from "@/components/sets/add-material-dialog";
import { useSetJob } from "@/components/sets/set-job-context";

/**
 * The set's build state at the top of the overview: live progress while
 * Claude builds, a clear next step for drafts, and the error with Retry when
 * a build stopped. Renders nothing for a ready set with no recent problem.
 */
export function BuildPanel({
  userId,
  materialCount,
  built,
}: {
  userId: string;
  materialCount: number;
  /** The set has topics from an earlier build. */
  built: boolean;
}) {
  const router = useRouter();
  const { setId, setStatus, job, loading, active } = useSetJob();
  const [starting, setStarting] = useState(false);

  async function build() {
    setStarting(true);
    try {
      await startJob(setId, "build_set", built ? { regenerate: true } : undefined);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The build didn't start.");
    } finally {
      setStarting(false);
    }
  }

  // Every branch renders the dialog in the same slot (first child of a
  // fragment), so it stays open across router.refresh() when the set's
  // state moves on, e.g. from "add material" to "ready to build".
  const addMaterial = (
    <AddMaterialDialog
      setId={setId}
      userId={userId}
      built={built}
      trigger={
        <Button variant={materialCount === 0 ? "primary" : "outline"}>
          <FilePlus2 strokeWidth={1.75} aria-hidden />
          Add material
        </Button>
      }
    />
  );

  // A build is queued or running.
  if (active && job) {
    const updating = Boolean((job.options as { regenerate?: unknown } | null)?.regenerate) || built;
    return (
      <Panel
        tone="accent"
        icon={<Sparkles className="size-5" strokeWidth={1.75} />}
        title={updating ? "Updating your study guide" : "Building your set"}
        body="Claude is reading your material and writing the guide and cards topic by topic. You can leave this page; it keeps going."
      >
        <JobProgress job={job} className="mt-4" />
      </Panel>
    );
  }

  // The latest build stopped.
  if (job?.status === "error" && (setStatus === "error" || setStatus === "building" || setStatus === "draft")) {
    return (
      <Panel
        tone="danger"
        icon={<CircleAlert className="size-5" strokeWidth={1.75} />}
        title="The build stopped"
        body="Nothing you made is lost. Retry the build, or add or remove material first if a file couldn't be read."
        actions={<>{addMaterial}{null}</>}
      >
        <JobProgress job={job} className="mt-4" />
      </Panel>
    );
  }
  if (job?.status === "error" && setStatus === "ready") {
    return (
      <Panel
        tone="danger"
        icon={<CircleAlert className="size-5" strokeWidth={1.75} />}
        title="The last update stopped"
        body="Your study guide and cards are still here. Retry to finish adding the new material."
      >
        <JobProgress job={job} className="mt-4" />
      </Panel>
    );
  }

  // Waiting for the first poll on a set the server says is building.
  if (setStatus === "building" && (loading || !job || job.status === "done")) {
    return (
      <Panel
        tone="accent"
        icon={<Sparkles className="size-5" strokeWidth={1.75} />}
        title="Building your set"
        body="Claude is reading your material and writing the guide and cards topic by topic."
      >
        <Progress value={null} size="md" label="Building your set" className="mt-4" />
      </Panel>
    );
  }

  if (setStatus === "error") {
    return (
      <Panel
        tone="danger"
        icon={<CircleAlert className="size-5" strokeWidth={1.75} />}
        title="The build stopped"
        body="Something went wrong while building this set. Try again, or check that your files can be read."
        actions={
          <>
            {addMaterial}
            <Button onClick={build} loading={starting} disabled={materialCount === 0}>
              <Hammer strokeWidth={1.75} aria-hidden />
              Build again
            </Button>
          </>
        }
      />
    );
  }

  if (setStatus === "draft") {
    if (materialCount === 0) {
      return (
        <Panel
          tone="neutral"
          icon={<FilePlus2 className="size-5" strokeWidth={1.75} />}
          title="Add material to build this set"
          body="Upload slides, notes, readings or photos, or paste notes. Claude turns them into a study guide and flashcards. You can also add cards by hand on the Cards tab."
          actions={<>{addMaterial}{null}</>}
        />
      );
    }
    return (
      <Panel
        tone="neutral"
        icon={<Hammer className="size-5" strokeWidth={1.75} />}
        title="Ready to build"
        body={`${pluralize(materialCount, "item")} added. Build the set and Claude writes the study guide and flashcards. It takes a few minutes.`}
        actions={
          <>
            {addMaterial}
            <Button onClick={build} loading={starting}>
              <Sparkles strokeWidth={1.75} aria-hidden />
              Build the set
            </Button>
          </>
        }
      />
    );
  }

  return null;
}

const tones = {
  accent: "bg-accent-soft text-accent-strong",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-2 text-ink-2",
} as const;

function Panel({
  tone,
  icon,
  title,
  body,
  actions,
  children,
}: {
  tone: keyof typeof tones;
  icon: ReactNode;
  title: string;
  body: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card
      role="region"
      aria-label="Build status"
      variant="flat"
      className="p-5 sm:p-6 motion-safe:animate-rise-in"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-md ${tones[tone]}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-semibold tracking-[-0.012em] text-ink">{title}</h2>
          <p className="mt-1 max-w-[64ch] text-[0.9375rem] leading-relaxed text-ink-2">{body}</p>
          {children}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2 sm:self-center">{actions}</div> : null}
      </div>
    </Card>
  );
}
