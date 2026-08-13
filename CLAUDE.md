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
- `lib/supabase/client.ts` — browser Supabase client (Client Components).
- `lib/supabase/server.ts` — server Supabase client (Server Components,
  Route Handlers, Server Actions). Always create a fresh client per request —
  never hoist it into a module-level singleton.
- `lib/supabase/proxy.ts` + `proxy.ts` — session refresh middleware, runs on
  every request per the matcher in `proxy.ts`.
- `components/` — shared UI; `components/ui/` is shadcn-generated, prefer
  adding new primitives via `npx shadcn@latest add <component>` over
  hand-rolling them.

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
  id          int8 pk identity
  name        text
  created_at  timestamptz default now()
```

`notes.collection_id` deletes as `SET NULL`, not `CASCADE` — deleting a
collection should orphan its notes (they become uncategorized), never
delete them.

**Table names must be lowercase.** Postgres/PostgREST is case-sensitive on
unquoted-vs-quoted identifiers, and the Supabase Table Editor preserves
whatever case you type. Naming a table `Collections` instead of
`collections` causes `PGRST205: Could not find the table 'public
.collections'` at runtime even though the table clearly exists — hit this
once already when building collections. Double-check casing when adding
`tags`/`note_tags`.

Not built yet (later course steps — tag system): `tags` (id, name), and
the `note_tags` join table (note_id FK, tag_id FK).

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
- Auth gate: pages under `app/protected/` should redirect unauthenticated
  users via `supabase.auth.getClaims()` like `app/protected/page.tsx` and
  `app/protected/notes/page.tsx` do — don't invent a second auth pattern.
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
