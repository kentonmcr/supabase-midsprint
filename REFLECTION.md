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

**Image uploads (Hard tier)** — via Supabase Storage, delivered on its
own branch (`feature/image-uploads`) and [PR #3](https://github.com/kentonmcr/supabase-midsprint/pull/3).
A note can have one attached image; the file lives in a private
`note-images` Storage bucket (never public, never base64 in the
database), with access scoped per-user by Storage RLS policies keyed on
the upload path's first folder segment (`<user_id>/...`) — the same
ownership pattern as every table this sprint, just expressed through a
file path instead of a `user_id` column, since `storage.objects` is
Supabase's own table. Display goes through a signed URL (1-hour expiry),
fetched client-side, not cached. Full detail in `CLAUDE.md`'s "Image
uploads" section.

**Bonus: Loading states (Easy tier)** — `app/protected/notes/loading.tsx`,
using Next.js App Router's built-in loading-file convention rather than a
hand-rolled client-side fetch/spinner: Next.js automatically wraps the
route in a Suspense boundary and shows this file as the fallback while
the page's server-side data fetch is in flight. Delivered via its own
branch and PR directly in this submission repo —
[PR #1](https://github.com/TuringCollegeSubmissions/kmcrue-BAI.2.8/pull/1) —
to make sure the "at least one merged pull request" requirement is
unambiguously satisfied *in this specific repo*, not just carried over
as commit history from the separate repo the rest of this project was
built in ([kentonmcr/supabase-midsprint](https://github.com/kentonmcr/supabase-midsprint)).

## Fresh-session PR review

Ran `/code-review` against [PR #3](https://github.com/kentonmcr/supabase-midsprint/pull/3)
(the image-uploads PR) as an independent background subagent invocation
— a fresh context with no memory of the conversation that wrote the code,
the closest practical equivalent to a genuinely separate session. Four
real findings, all fixed before merging:

1. **Wrong operation order on image replace/remove** — the old Storage
   file was deleted *before* `updateNote()` persisted the new
   `image_path`. If the DB update failed after the Storage delete
   succeeded, the note's row was left pointing at an image that no
   longer existed, with no way to recover. Fixed by reordering: update
   the DB row first (the source of truth), only clean up the old Storage
   object after that succeeds.
2. **Create-failure path could orphan a Storage file** — if a user
   picked an image and `createNote()` then failed, the already-uploaded
   image had no note to attach to and was never cleaned up, contradicting
   this PR's own "old images aren't left orphaned" claim for every other
   flow. Fixed by wrapping `createNote()` in its own try/catch that
   deletes the just-uploaded file before re-throwing.
3. **Stale image-edit state carried into the next edit session** — unlike
   `handleCancel`, a successful `handleSave` never reset `imageFile`/
   `removeImage`. Reopening Edit on the same note (without touching the
   image) would silently re-upload the same file as a new object and
   delete the one just saved. Fixed by resetting both on success, same as
   cancel already did.
4. **Dead fallback in the file-extension parser** — `file.name.split(".")
   .pop() ?? "bin"` can never actually hit `?? "bin"`, since `.pop()` on
   a non-empty split always returns a string. A file with no extension
   (e.g. `"photo"`) got that whole filename used as the extension instead
   of the intended `.bin` fallback. Fixed with an explicit
   `lastIndexOf(".")` check.

None of these were visible from manually testing the happy path — all
four are failure-path or repeated-interaction bugs, exactly the kind of
thing a second, fresh set of eyes on the diff is for.
