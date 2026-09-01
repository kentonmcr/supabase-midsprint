-- notes.updated_at had drifted from what docs/data-model.md always
-- documented (`timestamptz default now()`): the live column was
-- `timestamp without time zone`, nullable, with no default. Not
-- exploitable -- lib/notes.ts always sets updated_at explicitly on
-- every update -- but real schema/doc drift, tracked as a Medium
-- follow-up in the 2026-08-27 supabase-security-scanner audit.
--
-- The database session timezone is UTC (confirmed via `show timezone`)
-- and the app always writes UTC ISO timestamps
-- (`new Date().toISOString()`), so casting the existing naive values
-- `at time zone 'utc'` reproduces the original instants exactly, with no
-- shift.
--
-- Existing NULL updated_at values (notes that were created but never
-- edited) are left as NULL, not backfilled -- nothing in the app treats
-- updated_at as non-null (lib/types.ts's `updated_at: string` is itself
-- slightly optimistic), and "never edited" is meaningfully different
-- from "edited at creation time." The new default only applies to rows
-- inserted from here on.

alter table public.notes
  alter column updated_at type timestamptz using updated_at at time zone 'utc';

alter table public.notes
  alter column updated_at set default now();
