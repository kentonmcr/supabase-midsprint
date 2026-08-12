import type { SupabaseClient } from "@supabase/supabase-js";
import type { Collection } from "@/lib/types";

/**
 * Every query/mutation against the `collections` table lives here, mirroring
 * the pattern in lib/notes.ts — callers pass in a Supabase client (server or
 * browser) rather than this module creating its own.
 */

export async function listCollections(
  supabase: SupabaseClient,
): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createCollection(
  supabase: SupabaseClient,
  collection: { name: string },
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .insert(collection)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function renameCollection(
  supabase: SupabaseClient,
  id: number,
  name: string,
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCollection(
  supabase: SupabaseClient,
  id: number,
): Promise<void> {
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) throw error;
}
