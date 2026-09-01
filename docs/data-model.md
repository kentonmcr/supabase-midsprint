# Data model

Built by hand in the Supabase Dashboard's Table Editor/SQL Editor (not via
CLI migrations), following the course's ER diagram: `collections`
─groups→ `notes` ─labelled via→ `note_tags` ←applied via─ `tags`. IDs are
`int8` (Supabase's default identity column), not UUID — `user_id` is the
one exception, `uuid`, matching `auth.users.id`.

**Every table is scoped to the signed-in user via `user_id`.** This is a
private, per-user notes app — a user only ever sees their own data. This
wasn't the original design: an earlier version of this project
deliberately used a single shared pool with no owner column at all (that
matched an earlier sprint's ER diagram exactly). A later sprint's explicit
requirement — "a user sees only the notes they created" — reversed that
decision. If you're reading old context/commits from before this point,
disregard any mention of a shared/global pool; it no longer applies.

Current tables:

```
notes
  id             int8 pk identity
  user_id        uuid fk -> auth.users.id, not null, default auth.uid(), on delete cascade
  title          text
  body           text
  collection_id  int8 fk -> collections.id, nullable, on delete set null
  image_path     text, nullable — Storage object path, not a public URL
  search_vector  generated tsvector (title weight A, body weight B), gin-indexed
  created_at     timestamptz default now()
  updated_at     timestamptz default now()

collections
  id            int8 pk identity
  user_id       uuid fk -> auth.users.id, not null, default auth.uid(), on delete cascade
  name          text
  share_token   uuid, nullable, no default — null means "not shared"
  created_at    timestamptz default now()

tags
  id          int8 pk identity
  user_id     uuid fk -> auth.users.id, not null, default auth.uid(), on delete cascade
  name        text
  created_at  timestamptz default now()

note_tags
  id          int8 pk identity
  user_id     uuid fk -> auth.users.id, not null, default auth.uid(), on delete cascade
  note_id     int8 fk -> notes.id, not null, on delete cascade
  tag_id      int8 fk -> tags.id, not null, on delete cascade
  created_at  timestamptz default now()
```

**`user_id default auth.uid()` means application code never sets it.**
Every create function in `lib/notes.ts`, `lib/collections.ts`,
`lib/tags.ts` (including the inserts inside `setNoteTags()`) omits
`user_id` from its insert payload entirely — Postgres fills it in from
whoever's authenticated session made the request. Combined with RLS
(below) filtering every read automatically, this is why the entire
per-user migration required **zero query changes** anywhere in `lib/*.ts`
— only `lib/types.ts` needed `user_id` added to stay accurate. Don't
add `.eq("user_id", ...)` filters to reads "to be safe" — RLS already
guarantees it at the database level, and a redundant client-side filter
just adds noise.

**Every foreign key column has an explicit index** — Postgres indexes
primary keys automatically but never foreign keys, so this doesn't happen
for free (flagged by the `supabase-postgres-best-practices` skill's
`schema-foreign-key-indexes` rule):

```sql
create index notes_collection_id_idx on notes (collection_id);
create index note_tags_note_id_idx on note_tags (note_id);
create index note_tags_tag_id_idx on note_tags (tag_id);
create index notes_user_id_idx on notes (user_id);
create index collections_user_id_idx on collections (user_id);
create index tags_user_id_idx on tags (user_id);
create index note_tags_user_id_idx on note_tags (user_id);
```

`user_id` matters most of all of these: every RLS policy (below) checks
it on every single query against every table, not just occasional
cascade/set-null operations. `note_tags.note_id` is next most important
in practice: `setNoteTags()` runs `delete from note_tags where note_id =
...` on every note create/edit.

`notes.collection_id` deletes as `SET NULL`, not `CASCADE` — deleting a
collection should orphan its notes (they become uncategorized), never
delete them. `note_tags` rows delete as `CASCADE` on both sides — a join
row is meaningless once either the note or the tag it links is gone.
`user_id` also deletes as `CASCADE` on all four tables — deleting a user
account should remove all of their data, not orphan it.

**Table and column names must be lowercase/exact.** Postgres/PostgREST is
case-sensitive, and the Supabase Table Editor preserves whatever you type
verbatim — no autocorrect. Hit two variants of this while building:
naming a table `Collections` instead of `collections` caused `PGRST205:
Could not find the table 'public.collections'`; naming `note_tags`
columns `notes_id`/`tags_id` instead of `note_id`/`tag_id` caused `42703:
column note_tags.note_id does not exist`. Both were fixed by renaming in
the Table Editor after the fact. Double-check exact naming (including
singular/plural) any time a new table/column gets added by hand.

**Stale client state after manual DB edits.** If you edit table data
directly in the Supabase dashboard while the app is open in a browser tab,
that tab's React state won't know — it was seeded once from the initial
page load. This showed up as a spurious foreign-key violation when
inserting a `note_tags` row referencing a tag id the browser still had
cached from before the schema was being fiddled with. A hard refresh
resolves it if this comes up again; it's not a code bug.

**Retyping a column in the Table Editor can silently destroy its data.**
While adding `share_token`, an existing text column got its name and type
changed in place (rather than adding a new column alongside it), which
dropped its data instead of casting it — the column came back empty
(`NULL`) for every existing row rather than erroring. If a column's
values look wrong or missing after an edit, re-check the table's full
column list before assuming the data is still there; when adding a new
field, always use "Add column," never repurpose an existing one.

**RLS policy: owner-only, not "any authenticated user."** Every table's
policy checks that the row's `user_id` matches the caller's own id:

```sql
-- FOR ALL, target role: authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id)
```

This replaced an earlier, deliberately-shared-pool policy
(`using (true) with check (true)`, no owner check at all — see the note
at the top of this section) once a later sprint required private,
per-user data. The `(select auth.uid())` wrapping, rather than a bare
`auth.uid() = user_id`, is a Postgres RLS performance pattern — it lets
Postgres evaluate the function once per query instead of once per row.

**`note_tags` needs a stronger check than the other three tables.**
`note_tags.user_id = auth.uid()` alone only proves the *join row* belongs
to the caller — it says nothing about whether the `note_id`/`tag_id` it
references actually belong to that same caller. A security audit
(`security-auditor` subagent) caught that `setNoteTags()` in `lib/tags.ts`
never verified this either, before inserting. Since `note_id`/`tag_id`
are plain sequential integers, a caller could otherwise link their own
tag to another user's note (or vice versa) by guessing an id. Fixed by
adding `not null` to both columns (they were nullable despite being
documented as `not null` — another drift instance) and extending the
`note_tags` policy's `with check` to also require the referenced rows be
owned by the caller:

```sql
with check (
  (select auth.uid()) = user_id
  and exists (select 1 from notes where notes.id = note_id and notes.user_id = (select auth.uid()))
  and exists (select 1 from tags where tags.id = tag_id and tags.user_id = (select auth.uid()))
)
```

`using` is unchanged — this only tightens what values a write is allowed
to set, not which existing rows are visible.

**`drop policy if exists` with a guessed name fails silently — and it did,
for real, on this exact migration.** The migration SQL used `drop policy
if exists "Authenticated users can manage notes" on notes` (and similarly
for the other three tables) before creating the new owner-only policy.
The actual policy names on all four tables turned out to be
`"Enable insert for authenticated users only"` (Supabase's own
auto-suggested template name), not what was guessed — so every `drop`
silently no-opped, and the old `using (true)` policy stayed active
*alongside* the new owner-only one. Since Postgres OR's multiple
permissive policies together for the same operation, the old
all-access policy alone was enough to let every signed-in user see every
other user's notes — confirmed live with two real test accounts, each
seeing the other's data, before this was caught and fixed by manually
deleting the leftover policy on all four tables. **Lesson: after running
any `drop policy` (especially with a guessed name), go check the
table's actual policy list in the dashboard and confirm only the
intended policy remains — don't assume the drop worked just because the
SQL ran without error.**

**`collections.share_token`'s live default drifted from "no default" to
`gen_random_uuid()` — new collections were public from creation.** This
doc and `docs/collection-sharing.md` always documented `share_token` as
nullable with no default (`null` = not shared), but the live column had
somehow picked up `default gen_random_uuid()` — most likely from a "Set
default value" prompt when the column was added via the Table Editor.
The docs were right; the database wasn't. `createCollection()` in
`lib/collections.ts` only ever inserts `{ name }`, relying on the column
defaulting to `null` — so every new collection actually got a working
public share token the instant it was created, with no one ever clicking
"Share." Caught on 2026-08-27 by a live-DB pass of the
`supabase-security-scanner` subagent (`supabase db advisors` plus a
direct `information_schema.columns` query) — not by re-reading this doc,
since the doc never claimed the bad default existed. One real collection
had already picked up a live token by the time this was found. Fixed
live with `alter table collections alter column share_token drop
default;`, and that collection's token was manually nulled. **Lesson:
this is the third hand-authored-schema drift incident in this project
(see the `drop policy` and column-retyping entries above) — periodically
verify live schema against these docs with a real query (`supabase db
advisors`, `information_schema`), since a correct-looking doc doesn't
guarantee the database matches it.**

RLS is enabled on every table, so both anonymous requests (no session)
*and* other authenticated users' requests are rejected for rows they
don't own. The only deliberate exception is the collection-sharing
feature (see `docs/collection-sharing.md`), which punches one narrow,
separate hole in this for public read access — everything else stays
fully private per-user.
