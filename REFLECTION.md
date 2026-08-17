# Reflection

## Persistence approach

Consulted Claude Code on the best persistence approach before implementing
the per-user pivot, as this sprint's requirements asked. Given the
existing stack — Next.js + Supabase, already fully wired for Postgres and
Supabase Auth — the recommendation was: **stay on Supabase Postgres, add
a `user_id uuid references auth.users(id)` column to every table, and
enforce ownership with Row Level Security** (`using ((select auth.uid())
= user_id)`), rather than any alternative approach.

Why this is the right choice, not just the convenient one:

- The stack is already Supabase end-to-end (auth, database, and the RLS
  patterns already used elsewhere in this project, e.g. the
  `SECURITY DEFINER` functions behind collection sharing) — introducing a
  second persistence layer or a different database would duplicate
  infrastructure for no real benefit.
- RLS lets the *database* enforce "a user only sees their own notes,"
  rather than relying on every query in the application remembering to
  filter by owner. That's a materially stronger guarantee than
  application-level filtering: even a bug in `lib/notes.ts` that forgot a
  `.eq("user_id", ...)` filter couldn't leak another user's data, because
  the database rejects the row regardless of what the application asked
  for. (This project already learned that lesson the hard way once, on
  the collection-sharing feature — see `docs/reflections.md`.)
- `localStorage`/`sessionStorage` were explicitly ruled out by this
  sprint's requirements, and would have been the wrong tool regardless —
  note data needs to survive across devices and be provably scoped per
  account, which client-side browser storage can't do.

## What each relevant column means, and how a new row is created

Using `notes` as the example — the pattern is identical for
`collections`, `tags`, and `note_tags`:

| Column | Meaning |
|---|---|
| `id` | Auto-incrementing primary key, assigned by Postgres |
| `user_id` | References `auth.users.id` — the Supabase Auth account that owns this row. **Never set by the application.** |
| `title` / `body` | The note's content, entered by the user |
| `collection_id` | Optional link to a `collections` row (nullable) |
| `search_vector` | Auto-generated from `title`/`body` for full-text search, not user-editable |
| `created_at` / `updated_at` | Timestamps, set by Postgres defaults |

**How a row is actually created:** when a user submits the "New note"
form, `components/notes/notes-manager.tsx` calls `createNote(supabase, {
title, body, collection_id })` — `user_id` is never included in that
payload. The `notes.user_id` column has `default auth.uid()`, so Postgres
fills it in automatically from whoever's authenticated session made the
request (derived from their session JWT, verified server-side). The same
insert is then checked against the RLS policy's `with check ((select
auth.uid()) = user_id)` — since the value Postgres just filled in *is*
`auth.uid()`, this trivially passes for a legitimate request, and would
reject any attempt to insert a row under a different user's id even if a
client tried to force one explicitly.

The practical consequence: this is also why the per-user migration
required **zero changes** to any query in `lib/notes.ts`,
`lib/collections.ts`, or `lib/tags.ts` — every read is automatically
filtered by RLS, and every write is automatically stamped with the right
owner by the column default. Only `lib/types.ts` needed updating, to add
`user_id` to the type definitions.

## Schema pivot: shared pool → per-user

Earlier in this project (the original midsprint), the notes/collections/
tags schema was deliberately built with **no** `user_id` column at all —
a single shared pool visible to every signed-in user, matching that
sprint's ER diagram exactly (confirmed as an intentional choice, not an
oversight, at the time). This sprint's requirements explicitly reversed
that: *"A user sees only the notes they created — not notes belonging to
other accounts."* The migration (see `CLAUDE.md`'s Data model section for
the full SQL) cleared the old shared-pool test data — it had no single
rightful owner to assign it to — and added `user_id` + rewrote every RLS
policy from "any authenticated user" to "owner only."

**Verification caught a real isolation bug, not a hypothetical one.**
Local verification with two dashboard-created test accounts (per this
sprint's checklist) initially failed: account 2 could see account 1's
notes. The migration's `drop policy if exists` calls had guessed the
wrong existing policy names, so they silently no-opped instead of
removing the old shared-pool policies — leaving the old `using (true)`
policy active side-by-side with the new owner-only one on all four
tables. Since Postgres OR's multiple permissive policies together, the
old policy alone was enough to grant everyone access to everything,
regardless of the new policy also being present. Found by checking each
table's actual policy list in the dashboard (not by re-reading the
migration SQL, which looked correct), fixed by deleting the leftover
policy on all four tables, then re-verified with the same two accounts
until isolation actually held in both directions. Full writeup in
`CLAUDE.md`'s Data model section. This is exactly the kind of thing the
"verify, don't assume" checklist is designed to catch — the SQL running
without error was not sufficient evidence that it did what it was
supposed to.

## Optional task

<!-- filled in once finalized for this sprint -->

## Fresh-session PR review

<!-- filled in once the fresh-session /code-review pass is done -->
