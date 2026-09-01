import type { SupabaseClient } from "@supabase/supabase-js";
import type { Note } from "@/lib/types";

/**
 * Every query/mutation against the `notes` table lives here. Callers pass
 * in a Supabase client (server or browser) rather than this module creating
 * its own, so the same functions work from Server Components and Client
 * Components alike.
 */

// Explicit column list rather than select("*") — the client should only
// ever receive the fields the UI actually renders, not internal columns
// like user_id (never read anywhere in the app) or the generated
// search_vector tsvector (used only server-side by searchNoteIds()).
const NOTE_COLUMNS =
  "id, title, body, collection_id, image_path, created_at, updated_at";

export async function listNotes(supabase: SupabaseClient): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createNote(
  supabase: SupabaseClient,
  note: {
    title: string;
    body: string;
    collection_id: number | null;
    image_path: string | null;
  },
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert(note)
    .select(NOTE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateNote(
  supabase: SupabaseClient,
  id: number,
  userId: string,
  updates: {
    title: string;
    body: string;
    collection_id: number | null;
    image_path: string | null;
  },
): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select(NOTE_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNote(
  supabase: SupabaseClient,
  id: number,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export type SharedNote = Pick<
  Note,
  "id" | "title" | "body" | "created_at" | "updated_at"
>;

/**
 * Notes for a shared collection — used by the public /shared/[token] page.
 * Goes through the get_shared_collection_notes() Postgres function rather
 * than a table-level RLS policy, for the same reason as
 * getCollectionByShareToken() in lib/collections.ts: a policy can only say
 * "this note's collection has *a* token", not "...has *this* token", so a
 * direct anon SELECT would leak every shared collection's notes at once.
 * The token is assumed already validated by a prior
 * getCollectionByShareToken() call — this is only ever reached once that's
 * confirmed a real collection.
 */
export async function listSharedCollectionNotes(
  supabase: SupabaseClient,
  token: string,
): Promise<SharedNote[]> {
  const { data, error } = await supabase.rpc("get_shared_collection_notes", {
    p_token: token,
  });

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
