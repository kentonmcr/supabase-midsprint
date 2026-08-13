import type { SupabaseClient } from "@supabase/supabase-js";
import type { Note } from "@/lib/types";

/**
 * Every query/mutation against the `notes` table lives here. Callers pass
 * in a Supabase client (server or browser) rather than this module creating
 * its own, so the same functions work from Server Components and Client
 * Components alike.
 */

export async function listNotes(supabase: SupabaseClient): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createNote(
  supabase: SupabaseClient,
  note: { title: string; body: string; collection_id: number | null },
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert(note)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateNote(
  supabase: SupabaseClient,
  id: number,
  updates: { title: string; body: string; collection_id: number | null },
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNote(
  supabase: SupabaseClient,
  id: number,
): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Notes for a single collection — used by the public /shared/[token]
 * page, which only ever needs one collection's notes, not the full table.
 */
export async function listNotesByCollection(
  supabase: SupabaseClient,
  collectionId: number,
): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Full-text search against the generated `search_vector` column (title +
 * body, GIN-indexed). Runs in Postgres, not the browser — only the
 * matching ids come back, so the caller intersects them with whatever
 * notes it already has rather than re-fetching everything.
 */
export async function searchNoteIds(
  supabase: SupabaseClient,
  query: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id")
    .textSearch("search_vector", query, {
      type: "websearch",
      config: "english",
    });

  if (error) throw error;
  return (data ?? []).map((row: { id: number }) => row.id);
}
