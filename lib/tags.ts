import type { SupabaseClient } from "@supabase/supabase-js";
import type { NoteTag, Tag } from "@/lib/types";

/**
 * Every query/mutation against `tags` and the `note_tags` join table lives
 * here, mirroring lib/notes.ts and lib/collections.ts.
 */

export async function listTags(supabase: SupabaseClient): Promise<Tag[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTag(
  supabase: SupabaseClient,
  tag: { name: string },
): Promise<Tag> {
  const { data, error } = await supabase
    .from("tags")
    .insert(tag)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function renameTag(
  supabase: SupabaseClient,
  id: number,
  name: string,
): Promise<Tag> {
  const { data, error } = await supabase
    .from("tags")
    .update({ name })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTag(
  supabase: SupabaseClient,
  id: number,
): Promise<void> {
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) throw error;
}

export async function listNoteTags(
  supabase: SupabaseClient,
): Promise<NoteTag[]> {
  const { data, error } = await supabase
    .from("note_tags")
    .select("note_id, tag_id");

  if (error) throw error;
  return data ?? [];
}

/**
 * Replaces the full set of tags assigned to a note: clears its existing
 * note_tags rows, then inserts one row per tag id given.
 */
export async function setNoteTags(
  supabase: SupabaseClient,
  noteId: number,
  tagIds: number[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("note_tags")
    .delete()
    .eq("note_id", noteId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) return;

  const { error: insertError } = await supabase
    .from("note_tags")
    .insert(tagIds.map((tagId) => ({ note_id: noteId, tag_id: tagId })));
  if (insertError) throw insertError;
}
