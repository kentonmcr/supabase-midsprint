-- get_shared_collection_notes() joined notes to collections purely on
-- collection_id, with no check that the note's owner matched the
-- collection's owner. Neither app code nor RLS on `notes` validated that
-- either (createNote()/updateNote() now do, app-side — see lib/notes.ts).
-- Since this function is SECURITY DEFINER and bypasses RLS, a user could
-- point their own note's collection_id at another user's already-shared
-- collection and have their note appear on that collection's public
-- /shared/[token] page. Adding `c.user_id = n.user_id` to the join makes
-- this function independently correct regardless of what collection_id
-- values happen to exist, as a DB-level backstop to the app-level fix.

create or replace function public.get_shared_collection_notes(p_token uuid)
returns table (id bigint, title text, body text, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select n.id, n.title, n.body, n.created_at, n.updated_at
  from notes n
  join collections c on c.id = n.collection_id and c.user_id = n.user_id
  where c.share_token = p_token
  order by n.created_at desc;
$$;
