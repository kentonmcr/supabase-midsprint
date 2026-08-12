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
  note: { title: string; body: string },
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
  updates: { title: string; body: string },
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
