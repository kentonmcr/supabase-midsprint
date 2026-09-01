-- note-images had no file_size_limit or allowed_mime_types (both null),
-- flagged Medium in the 2026-09-01 supabase-security-scanner audit.
-- Access control was already correct (private bucket, owner-scoped path
-- policies) -- this is defense-in-depth against an authenticated user
-- uploading arbitrarily large or arbitrary-content-type files under
-- their own prefix. 5 MiB matches the client-side check added in
-- lib/storage.ts; jpeg/png/webp/gif covers what note images realistically
-- need.

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'note-images';
