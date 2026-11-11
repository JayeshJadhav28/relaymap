import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Private source bucket. Objects live at
 * `{organizationId}/{projectId}/{sourceId}/{filename}`, which is the exact
 * shape the storage policies in migration 202611100002 validate.
 */
export const SOURCE_BUCKET = "relaymap-sources";

export type StoredSourceObject = {
  bucket: string;
  path: string;
  bytes: number;
};

export function safeStorageFilename(filename: string): string {
  const trimmed = filename.trim().replace(/\\/g, "/").split("/").pop() ?? "source";
  const cleaned = trimmed
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return cleaned || "source.txt";
}

export function sourceStoragePath(input: {
  organizationId: string;
  projectId: string;
  sourceId: string;
  filename: string;
}): string {
  return `${input.organizationId}/${input.projectId}/${input.sourceId}/${safeStorageFilename(
    input.filename,
  )}`;
}

export async function uploadSourceObject(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    projectId: string;
    sourceId: string;
    filename: string;
    bytes: Uint8Array;
    contentType: string;
  },
): Promise<StoredSourceObject> {
  const path = sourceStoragePath(input);
  const { error } = await supabase.storage.from(SOURCE_BUCKET).upload(path, input.bytes, {
    contentType: input.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`storage_upload_failed:${error.message}`);
  }
  return { bucket: SOURCE_BUCKET, path, bytes: input.bytes.byteLength };
}

export async function removeSourceObject(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  await supabase.storage.from(SOURCE_BUCKET).remove([path]);
}

export async function createSourceDownloadUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
