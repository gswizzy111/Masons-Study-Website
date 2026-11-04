"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import { CircleAlert, CircleCheck, CloudUpload, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ACCEPT_ATTRIBUTE,
  formatBytes,
  materialType,
  mimeTypeFor,
  rejectReason,
} from "@/components/sets/material-files";
import { MaterialIcon } from "@/components/sets/material-icon";
import { UploadAbortedError, uploadFileMaterial } from "@/components/sets/upload-material";

/** Files waiting in one upload batch. */
export const MAX_QUEUED_FILES = 40;
const CONCURRENCY = 3;

export type UploadItem = {
  key: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  /** 0-1 while uploading. */
  progress: number;
  error?: string;
};

export type RejectedFile = { key: string; name: string; reason: string };

export type UploadQueue = {
  items: UploadItem[];
  rejected: RejectedFile[];
  /** True while files are uploading. */
  busy: boolean;
  addFiles: (files: Iterable<File>) => void;
  remove: (key: string) => void;
  dismissRejected: (key?: string) => void;
  reset: () => void;
  /**
   * Uploads every file that isn't uploaded yet (failed ones are retried) to
   * the set, inserting a `materials` row for each. Never throws; failures
   * stay on their item with a readable error.
   */
  uploadPending: (ctx: {
    supabase: SupabaseClient;
    userId: string;
    setId: string;
  }) => Promise<{ uploaded: number; failed: number }>;
};

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

/** State and actions for a batch of files to upload. Pair with <MaterialUploader queue={...} />. */
export function useUploadQueue(): UploadQueue {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  // Latest items for async work; only written from event handlers.
  const itemsRef = useRef<UploadItem[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const update = useCallback((fn: (prev: UploadItem[]) => UploadItem[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  }, []);

  const patch = useCallback(
    (key: string, changes: Partial<UploadItem>) =>
      update((prev) => prev.map((it) => (it.key === key ? { ...it, ...changes } : it))),
    [update],
  );

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const nextRejected: RejectedFile[] = [];
      const added: UploadItem[] = [];
      const known = new Set(itemsRef.current.map((it) => fileKey(it.file)));
      let room = MAX_QUEUED_FILES - itemsRef.current.length;

      for (const file of files) {
        const key = fileKey(file);
        const reason = known.has(key) ? "Already added." : rejectReason(file);
        if (reason) {
          nextRejected.push({ key: `${key}:${crypto.randomUUID()}`, name: file.name, reason });
          continue;
        }
        if (room <= 0) {
          nextRejected.push({
            key: `${key}:${crypto.randomUUID()}`,
            name: file.name,
            reason: `You can add up to ${MAX_QUEUED_FILES} files at a time. Add the rest afterwards.`,
          });
          continue;
        }
        known.add(key);
        room -= 1;
        added.push({ key, file, status: "queued", progress: 0 });
      }

      if (added.length) update((prev) => [...prev, ...added]);
      setRejected(nextRejected);
    },
    [update],
  );

  const remove = useCallback(
    (key: string) => update((prev) => prev.filter((it) => it.key !== key || it.status === "uploading")),
    [update],
  );

  const dismissRejected = useCallback((key?: string) => {
    setRejected((prev) => (key ? prev.filter((r) => r.key !== key) : []));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    update(() => []);
    setRejected([]);
  }, [update]);

  const uploadPending = useCallback<UploadQueue["uploadPending"]>(
    async ({ supabase, userId, setId }) => {
      const pending = itemsRef.current.filter((it) => it.status === "queued" || it.status === "error");
      if (pending.length === 0) return { uploaded: 0, failed: 0 };

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      for (const it of pending) patch(it.key, { status: "queued", progress: 0, error: undefined });

      let uploaded = 0;
      let failed = 0;
      let next = 0;

      const worker = async () => {
        while (next < pending.length && !controller.signal.aborted) {
          const item = pending[next++];
          // Removed while waiting in line.
          if (!itemsRef.current.some((it) => it.key === item.key)) continue;
          patch(item.key, { status: "uploading", progress: 0 });
          let lastPct = -1;
          try {
            await uploadFileMaterial({
              supabase,
              userId,
              setId,
              file: item.file,
              signal: controller.signal,
              onProgress: (fraction) => {
                const pct = Math.floor(fraction * 100);
                if (pct !== lastPct) {
                  lastPct = pct;
                  patch(item.key, { progress: fraction });
                }
              },
            });
            uploaded += 1;
            patch(item.key, { status: "done", progress: 1 });
          } catch (err) {
            failed += 1;
            const message =
              err instanceof UploadAbortedError
                ? "Upload cancelled."
                : err instanceof Error
                  ? err.message
                  : "Couldn't upload this file.";
            patch(item.key, { status: "error", progress: 0, error: message });
          }
        }
      };

      try {
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
      return { uploaded, failed };
    },
    [patch],
  );

  // Cancel in-flight uploads if the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { items, rejected, busy, addFiles, remove, dismissRejected, reset, uploadPending };
}

type MaterialUploaderProps = {
  queue: UploadQueue;
  disabled?: boolean;
  /** Visible label above the drop zone. */
  label?: string;
  className?: string;
};

/**
 * Drag-and-drop (or pick) files for a study set, with per-file progress and
 * remove. Pair with `useUploadQueue()`; call `queue.uploadPending(...)` to
 * upload.
 */
export function MaterialUploader({ queue, disabled, label = "Files", className }: MaterialUploaderProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const { items, rejected, addFiles, remove, dismissRejected } = queue;

  // A file dropped just outside the zone would otherwise open in the tab.
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = (e: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent<HTMLLabelElement>) => {
    if (disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const done = items.filter((it) => it.status === "done").length;
  const uploading = items.some((it) => it.status === "uploading");
  const summary = useMemo(() => {
    if (!items.length) return "";
    if (uploading) return `Uploading. ${done} of ${items.length} uploaded.`;
    return "";
  }, [items.length, uploading, done]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <span className="text-sm font-medium text-ink" id={`${inputId}-label`}>
        {label}
      </span>
      <label
        htmlFor={inputId}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-dragging={dragging || undefined}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-5 py-8 text-center",
          "border-line-strong bg-surface transition-[border-color,background-color] duration-150 ease-out",
          "hover:border-accent/60 hover:bg-accent-soft/40",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-accent",
          "data-[dragging]:border-accent data-[dragging]:bg-accent-soft/60",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          aria-labelledby={`${inputId}-label ${inputId}-cta`}
          aria-describedby={hintId}
          className="sr-only"
          onChange={(e) => {
            const files = e.currentTarget.files;
            if (files?.length) addFiles(Array.from(files));
            // Let the same file be picked again after removing it.
            e.currentTarget.value = "";
          }}
        />
        <span
          aria-hidden
          className="grid size-11 place-items-center rounded-md bg-surface-2 text-accent-strong"
        >
          <CloudUpload className="size-5" strokeWidth={1.75} />
        </span>
        <span id={`${inputId}-cta`} className="text-[0.9375rem] font-medium text-ink">
          {dragging ? (
            "Drop to add"
          ) : (
            <>
              Drop files here or{" "}
              <span className="text-accent-strong underline decoration-1 underline-offset-4">
                choose files
              </span>
            </>
          )}
        </span>
        <span id={hintId} className="max-w-[46ch] text-sm leading-snug text-ink-2">
          PDF, Word (.docx), PowerPoint (.pptx), TXT, Markdown, or photos (PNG, JPG, WEBP,
          GIF). Up to 50 MB each.
        </span>
      </label>

      {rejected.length > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm text-ink"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 font-medium text-danger">
              <CircleAlert className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {rejected.length === 1 ? "1 file wasn't added" : `${rejected.length} files weren't added`}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-my-1 h-7 px-2 text-ink-2"
              onClick={() => dismissRejected()}
            >
              Dismiss
            </Button>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {rejected.map((r) => (
              <li key={r.key} className="leading-snug">
                <span className="font-medium break-all">{r.name}</span>
                <span className="text-ink-2">: {r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul aria-label="Files to add" className="flex flex-col gap-2">
          {items.map((it) => (
            <UploadRow key={it.key} item={it} onRemove={() => remove(it.key)} disabled={disabled} />
          ))}
        </ul>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {summary}
      </p>
    </div>
  );
}

function UploadRow({
  item,
  onRemove,
  disabled,
}: {
  item: UploadItem;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const type = materialType({ kind: "file", file_name: item.file.name, mime_type: mimeTypeFor(item.file) });
  const pct = Math.round(item.progress * 100);

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border bg-surface px-3 py-2.5",
        item.status === "error" ? "border-danger/40" : "border-line",
      )}
    >
      <span
        aria-hidden
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-2"
      >
        <MaterialIcon type={type} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={item.file.name}>
          {item.file.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] text-ink-2">
          <span className="tabular-nums">{formatBytes(item.file.size)}</span>
          {item.status === "uploading" ? (
            <span className="tabular-nums">Uploading {pct}%</span>
          ) : item.status === "done" ? (
            <span className="inline-flex items-center gap-1 text-accent-strong">
              <CircleCheck className="size-3.5" strokeWidth={1.75} aria-hidden />
              Uploaded
            </span>
          ) : item.status === "error" ? (
            <span className="text-danger">Didn&apos;t upload</span>
          ) : (
            <span>Ready to upload</span>
          )}
        </p>
        {item.status === "uploading" ? (
          <Progress
            className="mt-2"
            size="xs"
            value={pct}
            label={`Uploading ${item.file.name}`}
            valueText={`${pct}%`}
          />
        ) : null}
        {item.status === "error" && item.error ? (
          <p className="mt-1 text-sm leading-snug text-danger">{item.error}</p>
        ) : null}
      </div>
      {item.status !== "done" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-my-1 -mr-1.5 size-9 shrink-0"
          onClick={onRemove}
          disabled={disabled || item.status === "uploading"}
          aria-label={`Remove ${item.file.name}`}
        >
          <X strokeWidth={1.75} aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}
