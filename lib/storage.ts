import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "note-images";

/**
 * Every Supabase Storage operation for note images lives here, mirroring
 * the pattern in lib/notes.ts. The bucket is private — files are only
 * reachable via a signed URL (getNoteImageSignedUrl), never a public one.
 * Storage RLS policies restrict each user to their own folder
 * (`{user_id}/...`), so uploads/reads/deletes are already scoped by
 * ownership at the database level; this module doesn't re-check it.
 */

export async function uploadNoteImage(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;

  return path;
}

export async function getNoteImageSignedUrl(
  supabase: SupabaseClient,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function deleteNoteImage(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
