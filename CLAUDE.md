# Notes App — Turing College "Building with AI Agents" Midsprint

A notes app backed by Supabase, built on the official `with-supabase` Next.js
starter. This is a course exercise — keep changes scoped, readable, and easy
to explain in a walkthrough.

## Stack

- Next.js (App Router, TypeScript, React 19)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for auth + Postgres
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

Built by hand in the Supabase Dashboard's Table Editor (not via SQL/CLI
migrations), following the course's ER diagram: `collections` ─groups→
`notes` ─labelled via→ `note_tags` ←applied via─ `tags`. Any future schema
changes should be made the same way — through the Table Editor — until/
unless a CLI migration workflow is introduced.

Key decision: **no `user_id` anywhere.** This is intentionally a single
shared pool of notes/collections/tags across every signed-in user, not
per-user data — the diagram has no owner column, and that was confirmed
deliberately rather than an oversight. IDs are `int8` (Supabase's default
identity column), not UUID.

Current tables:

```
notes
  id             int8 pk identity
  title          text
  body           text
  collection_id  int8 fk -> collections.id, nullable, on delete set null
  created_at     timestamptz default now()
  updated_at     timestamptz default now()

collections
  id            int8 pk identity
  name          text
  share_token   uuid, nullable, no default — null means "not shared"
  created_at    timestamptz default now()

tags
  id          int8 pk identity
  name        text
  created_at  timestamptz default now()

note_tags
  id          int8 pk identity
  note_id     int8 fk -> notes.id, not null, on delete cascade
  tag_id      int8 fk -> tags.id, not null, on delete cascade
  created_at  timestamptz default now()
```

`notes.collection_id` deletes as `SET NULL`, not `CASCADE` — deleting a
collection should orphan its notes (they become uncategorized), never
delete them. `note_tags` rows delete as `CASCADE` on both sides — a join
row is meaningless once either the note or the tag it links is gone, so
there's nothing to preserve (unlike `collection_id`, there's no "keep the
row, blank the reference" case here).

**Every foreign key column has an explicit index** — Postgres indexes
primary keys automatically but never foreign keys, so this doesn't happen
for free (flagged by the `supabase-postgres-best-practices` skill's
`schema-foreign-key-indexes` rule, added after the fact once the skill
was properly installed — see below):

```sql
create index notes_collection_id_idx on notes (collection_id);
create index note_tags_note_id_idx on note_tags (note_id);
create index note_tags_tag_id_idx on note_tags (tag_id);
```

`note_tags.note_id` matters most in practice: `setNoteTags()` in
`lib/tags.ts` runs `delete from note_tags where note_id = ...` on every
note create/edit, one of the most frequently-run queries in the app. The
other two speed up `ON DELETE SET NULL`/`CASCADE` (finding dependent rows
when a collection/tag is deleted). Add an index for any future foreign
key column the same way — don't rely on the primary key's automatic
index covering it.

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

Every table gets the same RLS policy — since there's no owner column to
scope by, the goal is just "must be logged in," not "must be the owner":

```sql
-- FOR ALL, target role: authenticated
using (true)
with check (true)
```

RLS is still enabled on every table (so anonymous/logged-out requests are
rejected outright); it just doesn't filter which rows an authenticated user
can see.

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

## Collection sharing (optional task)

Any collection can be made publicly viewable, read-only, via a link —
`collections.share_token` (nullable `uuid`) is `null` by default; setting
it (via the Share button, `shareCollection()` in `lib/collections.ts`,
which generates the token client-side with `crypto.randomUUID()`) makes
the collection and its notes visible at `/shared/[token]` to anyone with
the link, signed in or not. Unsharing sets it back to `null`.

**Not implemented as RLS policies on the tables** — an earlier version of
this did `to anon using (share_token is not null)`, but that's the wrong
shape: RLS can express "this row has *a* token," not "this row matches
*the* token this specific request presented." A direct anon call to
`supabase.from('collections').select('*')` would satisfy that policy for
every shared collection at once, handing out every collection's name and
live share token in one request — turning "share via unguessable link"
into "query the anon REST API and get every token." Caught via
`/code-review` on the PR diff (see `docs/reflections.md`).

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
