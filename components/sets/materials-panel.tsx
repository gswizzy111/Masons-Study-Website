"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, FilePlus2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Material } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { cn, pluralize } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { WithTooltip } from "@/components/ui/tooltip";
import { AddMaterialDialog } from "@/components/sets/add-material-dialog";
import {
  MATERIAL_TYPE_LABEL,
  formatBytes,
  materialType,
} from "@/components/sets/material-files";
import { MaterialIcon } from "@/components/sets/material-icon";
import { useSetJob } from "@/components/sets/set-job-context";
import { MATERIALS_BUCKET } from "@/components/sets/upload-material";

export type MaterialRow = Pick<
  Material,
  | "id"
  | "kind"
  | "file_name"
  | "mime_type"
  | "size_bytes"
  | "storage_path"
  | "char_count"
  | "status"
  | "error"
  | "created_at"
>;

/** The set's materials: what was added, whether Claude could read it, add and delete. */
export function MaterialsPanel({
  materials,
  userId,
  built,
}: {
  materials: MaterialRow[];
  userId: string;
  built: boolean;
}) {
  const router = useRouter();
  const { setId, active } = useSetJob();
  const [toDelete, setToDelete] = useState<MaterialRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const errored = materials.filter((m) => m.status === "error").length;

  async function onDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const supabase = createClient();
    try {
      if (toDelete.storage_path) {
        const { error } = await supabase.storage.from(MATERIALS_BUCKET).remove([toDelete.storage_path]);
        if (error) throw new Error("Couldn't delete the file. Try again in a moment.");
      }
      const { error } = await supabase.from("materials").delete().eq("id", toDelete.id);
      if (error) throw new Error("Couldn't remove it from the set. Try again in a moment.");
      toast.success(`Removed “${toDelete.file_name}”`);
      setDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete that.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card variant="flat" role="region" aria-labelledby="materials-title">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <h2 id="materials-title" className="font-display text-lg font-semibold text-ink">
            Material
          </h2>
          <p className="text-sm text-ink-2">
            {materials.length === 0
              ? "Nothing added yet"
              : errored > 0
                ? `${pluralize(materials.length, "item")}, ${errored} couldn't be read`
                : pluralize(materials.length, "item")}
          </p>
        </div>
        <AddMaterialDialog
          setId={setId}
          userId={userId}
          built={built}
          trigger={
            <Button variant="outline" size="sm">
              <FilePlus2 strokeWidth={1.75} aria-hidden />
              Add material
            </Button>
          }
        />
      </div>

      {materials.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {materials.map((m) => {
            const type = materialType(m);
            const meta = [
              MATERIAL_TYPE_LABEL[type],
              m.kind === "file" ? formatBytes(m.size_bytes) : null,
              m.status === "ready" && m.char_count
                ? `${m.char_count.toLocaleString("en-US")} characters`
                : null,
            ].filter(Boolean);
            return (
              <li key={m.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm",
                    m.status === "error" ? "bg-danger-soft text-danger" : "bg-surface-2 text-ink-2",
                  )}
                >
                  <MaterialIcon type={type} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={m.file_name}>
                    {m.file_name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-2">
                    <span className="tabular-nums">{meta.join(" · ")}</span>
                    <MaterialStatus status={m.status} />
                  </p>
                  {m.status === "error" ? (
                    <p className="mt-1 flex items-start gap-1.5 text-sm leading-snug text-danger">
                      <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {m.error || "Claude couldn't read this file. Try another format, or remove it."}
                    </p>
                  ) : null}
                </div>
                <WithTooltip label={active ? "Wait for the build to finish" : "Delete"}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="-my-1 -mr-2 size-9 shrink-0"
                    aria-label={`Delete ${m.file_name}`}
                    aria-disabled={active || undefined}
                    onClick={() => {
                      if (active) return;
                      setToDelete(m);
                      setDeleteOpen(true);
                    }}
                  >
                    <Trash2 strokeWidth={1.75} aria-hidden />
                  </Button>
                </WithTooltip>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-2 sm:px-6">
          Add slides, notes or photos and Claude builds the guide and cards from them.
        </p>
      )}

      <Dialog open={deleteOpen} onOpenChange={(open) => !deleting && setDeleteOpen(open)}>
        <DialogContent
          size="sm"
          title="Delete this material?"
          description={
            <>
              <span className="font-medium text-ink">{toDelete?.file_name}</span> will be removed
              from the set. Guide sections and cards already made from it stay. Update the study
              guide afterwards to rebuild from what&apos;s left.
            </>
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button" disabled={deleting}>
                Keep it
              </Button>
            </DialogClose>
            <Button variant="danger" type="button" onClick={onDelete} loading={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MaterialStatus({ status }: { status: Material["status"] }) {
  switch (status) {
    case "pending":
      return (
        <Badge variant="neutral" className="h-5 px-1.5">
          Waiting
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="accent" className="h-5 px-1.5">
          <Spinner size="xs" />
          Reading
        </Badge>
      );
    case "error":
      return (
        <Badge variant="danger" className="h-5 px-1.5">
          Couldn&apos;t read
        </Badge>
      );
    default:
      return (
        <Badge variant="accent" className="h-5 px-1.5">
          Ready
        </Badge>
      );
  }
}
