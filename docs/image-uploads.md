# Image uploads (optional task)

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
  the `NoteImage` component in `components/notes/note-image.tsx` each
  time a note with an image renders, not stored or cached.

`lib/storage.ts` follows the same pattern as every other `lib/*.ts`
module: functions take a `SupabaseClient` as their first argument, no
module-level client. `uploadNoteImage()`, `getNoteImageSignedUrl()`, and
`deleteNoteImage()` are the only three operations needed.

**Old images aren't left orphaned.** Replacing a note's image (upload a
new one) or removing it deletes the old Storage object; deleting a note
with an image deletes its Storage object too. These are best-effort —
a failed cleanup delete is caught and logged with `console.error()`
rather than thrown, so it doesn't block the actual note operation,
since a stray orphaned file in Storage is a much smaller
problem than a broken save/delete flow.
