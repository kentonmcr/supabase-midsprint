# Collection sharing (optional task)

Any collection can be made publicly viewable, read-only, via a link —
`collections.share_token` (nullable `uuid`) is `null` by default; setting
it (via the Share button, `shareCollection()` in `lib/collections.ts`,
which generates the token client-side with `crypto.randomUUID()`) makes
the collection and its notes visible at `/shared/[token]` to anyone with
the link, signed in or not. Unsharing sets it back to `null`.

This is unaffected by `collections`/`notes` now having `user_id` — a user
can only ever share/unshare their *own* collection (RLS still governs the
authenticated Share/Unshare actions), and the public read path below
bypasses RLS entirely via `SECURITY DEFINER`, so it never needed to know
about ownership in the first place.

**Not implemented as RLS policies on the tables** — an earlier version of
this did `to anon using (share_token is not null)`, but that's the wrong
shape: RLS can express "this row has *a* token," not "this row matches
*the* token this specific request presented." A direct anon call to
`supabase.from('collections').select('*')` would satisfy that policy for
every shared collection at once, handing out every collection's name and
live share token in one request — turning "share via unguessable link"
into "query the anon REST API and get every token." Caught via
`/code-review` on the PR diff (see `docs/reflections-midsprint.md`).

Fixed by routing the public read path through two `SECURITY DEFINER`
Postgres functions instead, added via SQL Editor — no direct anon grants
on `collections`/`notes` at all. Each function does the token match
itself (with elevated privileges, bypassing RLS internally) and returns
at most the one row/set matching the exact token passed in, never the
`share_token` column itself:

```sql
create or replace function get_shared_collection(p_token uuid)
returns table (id bigint, name text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select id, name, created_at
  from collections
  where share_token = p_token
  limit 1;
$$;

create or replace function get_shared_collection_notes(p_token uuid)
returns table (id bigint, title text, body text, created_at timestamptz, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select n.id, n.title, n.body, n.created_at, n.updated_at
  from notes n
  join collections c on c.id = n.collection_id
  where c.share_token = p_token
  order by n.created_at desc;
$$;

grant execute on function get_shared_collection(uuid) to anon;
grant execute on function get_shared_collection_notes(uuid) to anon;
```

`lib/collections.ts`'s `getCollectionByShareToken()` and
`lib/notes.ts`'s `listSharedCollectionNotes()` call these via
`supabase.rpc(...)` rather than `.from(...).select(...)`. The existing
owner-scoped table policies (see `docs/data-model.md`) are untouched by
any of this — signed-in users' access is unaffected.

**`lib/supabase/proxy.ts` had to be updated too** — the starter's session
middleware redirects any unauthenticated request to `/auth/login` unless
the path starts with `/auth` or is `/`. Without excluding `/shared`, the
public route would bounce every logged-out visitor straight to login,
defeating the whole feature. The middleware's redirect condition now also
excludes `/shared` and `/shared/*` — checked as an exact match plus a
`/shared/`-prefix match (not a bare `startsWith("/shared")`), so a future
route like `/shared-admin` won't accidentally inherit the same exemption.

`app/shared/[token]/page.tsx` is a Server Component with **no auth gate**
(that's the point) — it looks up the collection by token via
`getCollectionByShareToken()` (returns `null`, not an error, for
not-found *or* malformed tokens — `share_token` is a `uuid` column and
Postgres throws a hard error on non-uuid input rather than "no rows", so
the token is regex-validated before it ever reaches the database), then
calls `notFound()` if nothing matched. It only shows note title/body — no
tag badges, no edit/delete controls, and no broader anon RLS grants on
`tags`/`note_tags` were added, to keep the public read surface minimal.
