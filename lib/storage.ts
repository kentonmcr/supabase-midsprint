import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "note-images";

// Mirrors the note-images bucket's file_size_limit/allowed_mime_types
// (supabase/migrations/20260901130000_limit_note_images_bucket.sql) —
// the bucket itself is the real enforcement point, this just gives an
// instant error instead of a round trip.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * Every Supabase Storage operation for note images lives here, mirroring
 * the pattern in lib/notes.ts. The bucket is private — files are only
 * reachable via a signed URL (getNoteImageSignedUrl), never a public one.
 * Storage RLS policies restrict each user to their own folder
 * (`{user_id}/...`), so uploads/reads/deletes are already scoped by
 * ownership at the database level. assertOwnedPath() below is an
 * app-level backstop on top of that — same reasoning as the user_id
 * checks added to lib/notes.ts, lib/collections.ts, and lib/tags.ts's
 * mutation functions after the RLS-policy-drift incidents documented in
 * docs/data-model.md.
 */

function assertOwnedPath(userId: string, path: string): void {
  if (!path.startsWith(`${userId}/`)) {
    throw new Error("Not authorized to access this image.");
  }
}

export async function uploadNoteImage(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Image must be 5MB or smaller.");
  }

  const dotIndex = file.name.lastIndexOf(".");
  const ext = dotIndex === -1 ? "bin" : file.name.slice(dotIndex + 1);
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;

  return path;
}

export async function getNoteImageSignedUrl(
  supabase: SupabaseClient,
  userId: string,
  path: string,
): Promise<string> {
  assertOwnedPath(userId, path);

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteNoteImage(
  supabase: SupabaseClient,
  userId: string,
  path: string,
): Promise<void> {
  assertOwnedPath(userId, path);

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
