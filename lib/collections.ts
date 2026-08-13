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

export async function shareCollection(
  supabase: SupabaseClient,
  id: number,
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .update({ share_token: crypto.randomUUID() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function unshareCollection(
  supabase: SupabaseClient,
  id: number,
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .update({ share_token: null })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public lookup by share token — used by the unauthenticated /shared/[token]
 * route. Returns null rather than throwing when nothing matches (including
 * malformed tokens, e.g. a mistyped URL), since "not found" is an expected
 * outcome here, not an error. share_token is a uuid column, and Postgres
 * throws a hard error on non-uuid input rather than just "no rows", so the
 * format is validated before it ever reaches the database.
 */
export async function getCollectionByShareToken(
  supabase: SupabaseClient,
  token: string,
): Promise<Collection | null> {
  if (!UUID_PATTERN.test(token)) return null;

  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("share_token", token)
    .maybeSingle();

  if (error) throw error;
  return data;
}
