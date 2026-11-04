"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { startJob } from "@/lib/jobs/start-job";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { MAX_NOTES_CHARS } from "@/components/sets/material-files";
import { MaterialUploader, useUploadQueue } from "@/components/sets/material-uploader";
import { insertNotesMaterial } from "@/components/sets/upload-material";

type Props = {
  setId: string;
  userId: string;
  /** The set has a study guide from an earlier build, so a new build updates it. */
  built: boolean;
  /** Claude is configured. Without it the material is saved but no build is offered. */
  aiReady?: boolean;
  /** The button that opens the dialog. */
  trigger: ReactNode;
};

/**
 * "Add material" for an existing set: upload files and/or paste notes, then
 * offer to update the study guide with them.
 */
export function AddMaterialDialog({ setId, userId, built, aiReady = true, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep it open while files are uploading.
        if (!next && busy) return;
        if (next) setSession((n) => n + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <AddMaterialBody
        key={session}
        setId={setId}
        userId={userId}
        built={built}
        aiReady={aiReady}
        onBusyChange={setBusy}
        onClose={() => setOpen(false)}
      />
    </Dialog>
  );
}

function AddMaterialBody({
  setId,
  userId,
  built,
  aiReady,
  onBusyChange,
  onClose,
}: {
  setId: string;
  userId: string;
  built: boolean;
  aiReady: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const queue = useUploadQueue();
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  const failed = queue.items.filter((it) => it.status === "error").length;
  const hasNotes = notes.trim().length > 0 && !notesSaved;
  const toUpload = queue.items.filter((it) => it.status !== "done").length;
  const canSubmit = (hasNotes || toUpload > 0) && !working;

  async function onAdd() {
    setError(null);
    if (notes.trim().length > MAX_NOTES_CHARS) {
      setError("Those notes are more than 500,000 characters. Save them as a .txt file and upload that instead.");
      return;
    }
    setWorking(true);
    onBusyChange(true);
    const supabase = createClient();
    let count = queue.items.filter((it) => it.status === "done").length + (notesSaved ? 1 : 0);
    try {
      if (hasNotes) {
        await insertNotesMaterial({ supabase, setId, text: notes });
        setNotesSaved(true);
        count += 1;
      }
      const result = await queue.uploadPending({ supabase, userId, setId });
      count += result.uploaded;
      router.refresh();
      if (result.failed > 0) {
        setError(
          `${pluralize(result.failed, "file")} didn't upload. Retry, or remove ${result.failed === 1 ? "it" : "them"} and continue.`,
        );
      } else {
        setAdded(count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that. Try again.");
    } finally {
      setWorking(false);
      onBusyChange(false);
    }
  }

  async function onBuild() {
    setStarting(true);
    try {
      await startJob(setId, "build_set", built ? { regenerate: true } : undefined);
      toast.success(built ? "Updating your study guide" : "Building your set");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The build didn't start.");
    } finally {
      setStarting(false);
    }
  }

  if (added !== null) {
    return (
      <DialogContent
        title="Material added"
        description={`${pluralize(added, "item")} added to the set.`}
        size="md"
      >
        <div className="flex items-start gap-3 rounded-md bg-accent-soft p-4 text-sm leading-relaxed text-ink">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent-strong" strokeWidth={1.75} aria-hidden />
          <p>
            {!aiReady
              ? "It's saved. Claude isn't connected to this site yet, so the study guide can be built or updated once it is."
              : built
                ? "Update the study guide so Claude reads the new material. Your cards and progress stay; new cards are added for anything new."
                : "Build the set so Claude can write the study guide and flashcards."}
          </p>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant={aiReady ? "ghost" : "primary"} type="button">
              {aiReady ? "Later" : "Done"}
            </Button>
          </DialogClose>
          {aiReady ? (
            <Button type="button" onClick={onBuild} loading={starting}>
              {built ? "Update study guide" : "Build the set"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      title="Add material"
      description="Slides, notes, readings or photos. Claude reads them when you update the study guide."
      size="lg"
      onInteractOutside={(e) => {
        if (working) e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-5">
        <MaterialUploader queue={queue} disabled={working} label="Files" />
        <Field
          label="Paste notes"
          optional
          hint={notesSaved ? "Your notes are saved to the set." : "Typed notes or text copied from a document."}
        >
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Paste or type notes here"
            disabled={working || notesSaved}
          />
        </Field>
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm leading-snug text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button" disabled={working}>
            Cancel
          </Button>
        </DialogClose>
        {failed > 0 &&
        !working &&
        toUpload === failed &&
        (notesSaved || queue.items.some((it) => it.status === "done")) ? (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setAdded(queue.items.filter((it) => it.status === "done").length + (notesSaved ? 1 : 0))
            }
          >
            Continue without them
          </Button>
        ) : null}
        <Button type="button" onClick={onAdd} loading={working} disabled={!canSubmit}>
          {working ? "Adding" : failed > 0 ? "Retry failed uploads" : "Add to set"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
