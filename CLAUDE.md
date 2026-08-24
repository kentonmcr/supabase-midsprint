# Notes App — Turing College "Building with AI Agents"

A private, per-user notes app backed by Supabase, built on the official
`with-supabase` Next.js starter. This is a course exercise (spanning a
midsprint and a follow-on sprint) — keep changes scoped, readable, and
easy to explain in a walkthrough. See `REFLECTION.md` for the reasoning
behind key decisions, including the shared-pool → per-user schema pivot.

## Stack

- Next.js (App Router, TypeScript, React 19)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for auth, Postgres,
  and Storage (note images — see "Image uploads" below)
- Tailwind CSS + shadcn/ui components (`components/ui/*`, configured via
  `components.json`)
- next-themes for light/dark mode

## Structure

- `app/` — routes. `app/auth/*` is the existing login/sign-up/password flow,
  `app/protected/*` is an example authenticated page.
- `app/auth/confirm/route.ts` vs `app/auth/callback/route.ts` — two
  different auth completion routes, don't conflate them. `confirm` handles
  the OTP/magic-link flow (`token_hash` + `type` query params,
  `supabase.auth.verifyOtp()`) used by email confirmation and password
  reset. `callback` handles the OAuth PKCE flow (`code` query param,
  `supabase.auth.exchangeCodeForSession()`) used by Google sign-in — add
  any future OAuth provider's redirect here too, not a new route.
- `lib/supabase/client.ts` — browser Supabase client (Client Components).
- `lib/supabase/server.ts` — server Supabase client (Server Components,
  Route Handlers, Server Actions). Always create a fresh client per request —
  never hoist it into a module-level singleton.
- `lib/supabase/proxy.ts` + `proxy.ts` — session refresh middleware, runs on
  every request per the matcher in `proxy.ts`.
- `components/` — shared UI; `components/ui/` is shadcn-generated, prefer
  adding new primitives via `npx shadcn@latest add <component>` over
  hand-rolling them.
- `.agents/skills/` + `.claude/skills/` — two Supabase agent skills
  (`supabase`, `supabase-postgres-best-practices`) installed via
  `npx skills add supabase/agent-skills`, symlinked so Claude Code
  registers them. Consult these — especially
  `supabase-postgres-best-practices` — before schema/RLS/index changes;
  the missing foreign-key indexes (see Data model) were only caught after
  the fact because this wasn't properly wired in until partway through
  the project.

## Environment

`.env.local` holds the real project credentials (gitignored, never commit
it). Required vars, from the Supabase project dashboard (Settings > API):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Run `npm run dev` to start locally.

## Data model

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

RLS is enabled on every table, so both anonymous requests (no session)
*and* other authenticated users' requests are rejected for rows they
don't own. The only deliberate exception is the collection-sharing
feature below, which punches one narrow, separate hole in this for
public read access — everything else stays fully private per-user.

## Search

Server-side full-text search (upgraded from an earlier client-side
substring filter — this is the "server-side full-text search" optional
task). `notes.search_vector` is a generated `tsvector` column (`title`
weighted 'A', `body` weighted 'B'), GIN-indexed, added via SQL Editor
(not Table Editor — generated columns and GIN indexes aren't exposed in
its point-and-click UI):

```sql
alter table notes add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;

create index notes_search_vector_idx on notes using gin (search_vector);
```

`lib/notes.ts`'s `searchNoteIds()` runs `.textSearch("search_vector", query,
{ type: "websearch" })` and returns only matching ids — the actual
matching/ranking happens in Postgres, not the browser. `NotesManager`
debounces the search box (~300ms), stores the result as a
`Set<number> | null` (`null` = no active search), and ANDs it with the
collection/tag filters the same way those already combine with each
other. Search only matches `title`/`body` text — it does not match tag or
collection names, by design (confirmed with user, not a bug).

## Loading states (optional task)

`app/protected/notes/loading.tsx` — Next.js App Router's built-in
convention: any route segment with a `loading.tsx` file automatically
wraps the page in a Suspense boundary and shows that file as the
fallback while the page's async Server Component work (here, the
`Promise.all` of `listNotes`/`listCollections`/`listTags`/
`listNoteTags` in `app/protected/notes/page.tsx`) is in flight — no
manual loading state, no client-side fetch-and-spinner pattern needed.
Built with the shadcn `Skeleton` component
(`npx shadcn@latest add skeleton`), laid out to roughly match the real
page's shape (sidebar + note cards) so the transition doesn't jump
around. Hard to see locally since Supabase responds fast enough that it
flashes by quickly — that's expected, not a sign it isn't working.

## Image uploads (optional task)

A note can have one attached image, stored in Supabase Storage — **not**
base64 in the database. `notes.image_path` holds the Storage object path
(e.g. `<user_id>/<uuid>.jpg`), never a public URL.

**The `note-images` bucket is private, not public.** A public bucket
would let anyone with a URL view an image with no auth check at all,
which conflicts with this being a private, per-user app. Instead:

- Every upload path is prefixed with the uploader's `user_id` as its
  first folder segment — this convention is what the Storage policies
  key off of.
- Storage policies (on `storage.objects`, added via SQL Editor — bucket
  creation itself was done in the dashboard's Storage UI) restrict
  insert/select/delete to rows where `(storage.foldername(name))[1] =
  (select auth.uid())::text` — the same ownership pattern as every other
  table in this project, just expressed through path segments instead of
  a `user_id` column, since `storage.objects` is Supabase's own table.
- Because the bucket is private, displaying an image requires a
  **signed URL** (`getNoteImageSignedUrl()` in `lib/storage.ts`,
  1-hour expiry) rather than a plain public URL — fetched client-side by
  the `NoteImage` component in `components/notes/notes-manager.tsx` each
  time a note with an image renders, not stored or cached.

`lib/storage.ts` follows the same pattern as every other `lib/*.ts`
module: functions take a `SupabaseClient` as their first argument, no
module-level client. `uploadNoteImage()`, `getNoteImageSignedUrl()`, and
`deleteNoteImage()` are the only three operations needed.

**Old images aren't left orphaned.** Replacing a note's image (upload a
new one) or removing it deletes the old Storage object; deleting a note
with an image deletes its Storage object too. These are best-effort
(`.catch(() => {})`) — a failed cleanup delete doesn't block the actual
note operation, since a stray orphaned file in Storage is a much smaller
problem than a broken save/delete flow.

## Collection sharing (optional task)

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
`authenticated`/`true`/`true` table policies are untouched by any of
this — signed-in users' access is unaffected.

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

## Authentication rules

- **Use Supabase Auth for all sign-in and session handling — never build
  custom auth or store passwords.** Email/password
  (`signInWithPassword`) and Google OAuth (`signInWithOAuth({ provider:
  "google" })`) are the only two sign-in paths in this app, both fully
  handled by Supabase; there is no separate account/password system
  anywhere in this codebase.
- **Every page under `app/protected/` requires a signed-in user,
  verified on the server before the page loads** — via
  `supabase.auth.getClaims()` (or `getUser()`), which makes a real
  server-side call to validate the session. Never `getSession()` alone:
  it only reads the cookie without verifying it, so it is not
  trustworthy for gating access. See `app/protected/page.tsx` and
  `app/protected/notes/page.tsx` for the pattern; don't invent a second
  one. Redirect to `/auth/login` if the user is not signed in.
- **After a successful sign-in, redirect to `/protected`.** Both
  `components/login-form.tsx` (email/password and Google) and
  `app/auth/callback/route.ts` (OAuth PKCE completion) already do this —
  keep it consistent for any future sign-in path.
- **After sign-out, redirect to `/auth/login`.**
  `components/logout-button.tsx` already does this.
- **Always call `router.refresh()` right after `router.push()` on both the
  sign-in and sign-out transitions.** `router.push()` is a client-side
  navigation — Next.js can serve a cached version of the destination route
  instead of asking the server for fresh data. Bug found by testing: sign
  out as one user, sign in as a second, and `/protected/notes` briefly
  showed the *first* user's notes until a manual browser refresh. This
  was not an RLS/database leak (compare the bug in "Data model" above) —
  the database was already returning the correct, per-user rows the whole
  time. The bug was that the browser hadn't asked it to. `router.refresh()`
  clears the client-side cache for the current route and re-fetches/
  re-renders the Server Component, so the new session's data is what
  actually shows up. Fixed in `components/logout-button.tsx` and
  `components/login-form.tsx`'s `handleLogin`.
- Email/password and Google OAuth are otherwise indistinguishable once
  signed in — same session, same `auth.uid()`, no separate code paths
  anywhere else in the app. Google requires a Client ID/Secret configured
  directly in the Supabase Dashboard's Google provider settings (not
  something this codebase configures) plus the `/auth/callback` redirect
  route above.
- **Password requirements (sign-up only): at least 8 characters,
  including an uppercase letter, a lowercase letter, a digit, and a
  symbol.** Enforced client-side in `components/sign-up-form.tsx`
  (`isPasswordValid()`) before `supabase.auth.signUp()` is ever called,
  with the same text shown as a hint under the field and as the error
  message if it fails — this is stricter than Supabase's own default
  minimum (6 characters), so don't assume Supabase enforces this; the app
  does.
- **The `service_role`/secret key must never be placed in a client-
  accessible env var, and never sent to the browser.** In Next.js, any
  env var prefixed `NEXT_PUBLIC_` is bundled into client-side JS and
  therefore public — that's exactly why this project only ever uses
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (see Environment below), both safe-to-expose keys, everywhere,
  including in `lib/supabase/server.ts`. There is currently no
  `service_role` key anywhere in this project — no `.env.local` entry, no
  code reference — and none of this app's features (including the
  `SECURITY DEFINER` functions used for collection sharing) require one.
  If a future feature seems to need elevated/service-role privileges,
  that's a signal to re-examine the design (e.g. a narrower
  `SECURITY DEFINER` function, as done for sharing) rather than reach for
  the service-role key in application code.

## Conventions

- Server Components by default; add `"use client"` only where interactivity
  (forms, state, event handlers) requires it.
- **All Supabase queries/mutations live in `lib/<feature>.ts` helper
  modules** (e.g. `lib/notes.ts`), not inline in components — each function
  takes a `SupabaseClient` as its first argument so the same functions work
  from both a Server Component (passing the `lib/supabase/server.ts`
  client) and a Client Component (passing the `lib/supabase/client.ts`
  client). Follow this pattern for collections/tags too rather than
  inlining `.from(...)` calls in new components.
- Mutations are triggered from `"use client"` components calling
  `createClient()` from `lib/supabase/client.ts` directly in the event
  handler (see `components/login-form.tsx` and
  `components/notes/notes-manager.tsx`) — there is no Server Actions
  convention in this codebase, don't introduce one without reason.
- Styling: Tailwind utility classes + existing shadcn `ui/` primitives.
  Match the existing minimal, unstyled-shadcn aesthetic rather than adding a
  new design system.
- Don't commit `.env.local` or any real Supabase keys.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
