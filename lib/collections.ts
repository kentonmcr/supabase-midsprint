import type { SupabaseClient } from "@supabase/supabase-js";
import type { Collection } from "@/lib/types";

/**
 * Every query/mutation against the `collections` table lives here, mirroring
 * the pattern in lib/notes.ts — callers pass in a Supabase client (server or
 * browser) rather than this module creating its own.
 */

// Explicit column list rather than select("*") — user_id is never read
// anywhere in the app, so there's no reason to ship it to the client.
const COLLECTION_COLUMNS = "id, name, share_token, created_at";

export async function listCollections(
  supabase: SupabaseClient,
): Promise<Collection[]> {
  const { data, error } = await supabase
    .from("collections")
    .select(COLLECTION_COLUMNS)
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
    .select(COLLECTION_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function renameCollection(
  supabase: SupabaseClient,
  id: number,
  userId: string,
  name: string,
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .update({ name })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLLECTION_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCollection(
  supabase: SupabaseClient,
  id: number,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

async function setCollectionShareToken(
  supabase: SupabaseClient,
  id: number,
  userId: string,
  shareToken: string | null,
): Promise<Collection> {
  const { data, error } = await supabase
    .from("collections")
    .update({ share_token: shareToken })
    .eq("id", id)
    .eq("user_id", userId)
    .select(COLLECTION_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export function shareCollection(
  supabase: SupabaseClient,
  id: number,
  userId: string,
): Promise<Collection> {
  return setCollectionShareToken(supabase, id, userId, crypto.randomUUID());
}

export function unshareCollection(
  supabase: SupabaseClient,
  id: number,
  userId: string,
): Promise<Collection> {
  return setCollectionShareToken(supabase, id, userId, null);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SharedCollection = Pick<Collection, "id" | "name" | "created_at">;

/**
 * Public lookup by share token — used by the unauthenticated /shared/[token]
 * route. Goes through the get_shared_collection() Postgres function (see
 * CLAUDE.md) rather than a table-level RLS policy: a policy can only
 * express "this row has *a* token", not "this row matches *the* token this
 * request presented", so a direct anon SELECT against the table would leak
 * every shared collection's name and token, not just the one this caller
 * asked for. The function runs SECURITY DEFINER and does the token match
 * itself, returning at most one row and never the token column.
 *
 * Returns null rather than throwing when nothing matches (including
 * malformed tokens, e.g. a mistyped URL), since "not found" is an expected
 * outcome here, not an error. share_token is a uuid column, and Postgres
 * throws a hard error on non-uuid input rather than just "no rows", so the
 * format is validated before it ever reaches the database.
 */
export async function getCollectionByShareToken(
  supabase: SupabaseClient,
  token: string,
): Promise<SharedCollection | null> {
  if (!UUID_PATTERN.test(token)) return null;

  const { data, error } = await supabase.rpc("get_shared_collection", {
    p_token: token,
  });

  if (error) throw error;
  return data?.[0] ?? null;
}
