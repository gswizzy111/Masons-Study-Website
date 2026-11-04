// Client helpers that add material to a set: files go straight from the
// browser to the private "materials" Storage bucket (never through our
// server: Netlify caps request bodies at 6 MB), then a `materials` row is
// inserted for the build job to read.
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { slugifyFileName } from "@/lib/utils";
import type { Material } from "@/lib/types";
import { mimeTypeFor } from "@/components/sets/material-files";

export const MATERIALS_BUCKET = "materials";

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload cancelled.");
    this.name = "UploadAbortedError";
  }
}

function storageErrorMessage(status: number, body: string): string {
  let message = "";
  try {
    const data = JSON.parse(body) as { message?: unknown; error?: unknown };
    message = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "";
  } catch {
    // Not JSON.
  }
  if (status === 413 || /exceeded the maximum allowed size|too large/i.test(message)) {
    return "This file is over the 50 MB limit.";
  }
  if (status === 401 || status === 403) {
    return "Your session ended. Log in again, then retry.";
  }
  if (status === 0) return "The upload was interrupted. Check your connection and retry.";
  if (status >= 500) return "Storage had a problem saving this file. Retry in a moment.";
  return message ? `Couldn't upload: ${message}` : "Couldn't upload this file. Retry in a moment.";
}

/** PUTs one file to Storage with progress (0-1). Uses XHR because fetch has no upload progress. */
function putObject(opts: {
  path: string;
  file: File;
  contentType: string;
  accessToken: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { path, file, contentType, accessToken, onProgress, signal } = opts;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${publicEnv.supabaseUrl}/storage/v1/object/${MATERIALS_BUCKET}/${encodedPath}`;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadAbortedError());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", publicEnv.supabaseAnonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", contentType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(storageErrorMessage(xhr.status, xhr.responseText)));
      }
    };
    xhr.onerror = () => reject(new Error(storageErrorMessage(0, "")));
    xhr.onabort = () => reject(new UploadAbortedError());

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", onAbort);

    xhr.send(file);
  });
}

/**
 * Uploads one file to `<userId>/<setId>/<uuid>-<safe name>` and inserts its
 * `materials` row (kind 'file', status 'pending'). If the row can't be
 * saved, the uploaded object is removed again. Throws Error(message).
 */
export async function uploadFileMaterial(opts: {
  supabase: SupabaseClient;
  userId: string;
  setId: string;
  file: File;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<Material> {
  const { supabase, userId, setId, file, onProgress, signal } = opts;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session ended. Log in again, then retry.");

  const path = `${userId}/${setId}/${crypto.randomUUID()}-${slugifyFileName(file.name)}`;
  const contentType = mimeTypeFor(file);

  await putObject({ path, file, contentType, accessToken, onProgress, signal });

  const { data, error } = await supabase
    .from("materials")
    .insert({
      set_id: setId,
      kind: "file",
      file_name: file.name.slice(0, 255) || "Untitled file",
      mime_type: contentType,
      size_bytes: file.size,
      storage_path: path,
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) {
    await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
    throw new Error("The file uploaded, but it couldn't be added to the set. Retry in a moment.");
  }
  return data as Material;
}

/** Saves pasted notes as a ready-to-read text material. Throws Error(message). */
export async function insertNotesMaterial(opts: {
  supabase: SupabaseClient;
  setId: string;
  text: string;
  name?: string;
}): Promise<Material> {
  const { supabase, setId, text } = opts;
  const content = text.trim();
  const name = (opts.name?.trim() || "Pasted notes").slice(0, 255);
  const { data, error } = await supabase
    .from("materials")
    .insert({
      set_id: setId,
      kind: "text",
      file_name: name,
      mime_type: "text/plain",
      size_bytes: new TextEncoder().encode(content).length,
      content_text: content,
      char_count: content.length,
      status: "ready",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error("Couldn't save your pasted notes. Retry in a moment.");
  return data as Material;
}

/**
 * Removes every stored file of a set: everything under `<userId>/<setId>/`
 * plus any listed paths. Throws Error(message) if Storage refuses.
 */
export async function removeSetFiles(opts: {
  supabase: SupabaseClient;
  userId: string;
  setId: string;
  extraPaths?: string[];
}): Promise<void> {
  const { supabase, userId, setId, extraPaths = [] } = opts;
  const bucket = supabase.storage.from(MATERIALS_BUCKET);
  const folder = `${userId}/${setId}`;
  const paths = new Set(extraPaths.filter(Boolean));

  for (let offset = 0; offset < 10_000; offset += 100) {
    const { data, error } = await bucket.list(folder, { limit: 100, offset });
    if (error) throw new Error("Couldn't reach your uploaded files. Try again in a moment.");
    for (const item of data ?? []) {
      // Folders come back with a null id; materials are stored flat.
      if (item.id) paths.add(`${folder}/${item.name}`);
    }
    if (!data || data.length < 100) break;
  }

  const all = [...paths];
  for (let i = 0; i < all.length; i += 100) {
    const { error } = await bucket.remove(all.slice(i, i + 100));
    if (error) throw new Error("Couldn't delete the uploaded files. Try again in a moment.");
  }
}
