---
name: supabase-security
description: Use when auditing this project for Supabase security issues — RLS policies, SECURITY DEFINER functions, service-role/key exposure, Storage access control, and auth/session handling. Load before or during any security review of Supabase-backed schema, policies, or code in this project.
---

# Supabase security facts

Reference checklist for auditing Supabase security in this project — RLS,
privileged functions, key exposure, Storage, and auth. Each item states
the fact and what a real violation looks like. Check the actual
schema/code against these before calling something safe; don't assume a
pattern is followed correctly just because it's the documented convention.

## Row Level Security (RLS)

**Every table with real data needs RLS enabled, with an ownership
predicate — not just `TO authenticated`.** `TO authenticated` alone only
checks that *a* valid session exists; it says nothing about *whose* rows
can be read. That's authentication, not authorization — a classic
BOLA/IDOR gap. The correct shape combines the role with an ownership
check:

```sql
create policy "example" on table_name for select
to authenticated
using ( (select auth.uid()) = user_id );
```

This project hit exactly this gap once: a leftover `using (true)` policy
stayed active alongside a new owner-only one because a `drop policy` with
a guessed name silently no-opped. Postgres ORs multiple permissive
policies together, so the looser one won even though the stricter one
also existed. **Lesson for auditing: don't trust that a migration ran
cleanly — list every policy actually on the table and confirm only the
intended one is there.**

**UPDATE policies need both `USING` and `WITH CHECK`.** `USING` alone
lets a user update their own row's contents but reassign its owner column
to someone else; `WITH CHECK` is what stops the *new* row values from
violating the ownership rule. UPDATE also implicitly requires a SELECT
policy — Postgres has to read a row before it can update it, so without
one, updates silently affect 0 rows instead of erroring, which reads as
"did nothing" rather than "blocked."

**`(select auth.uid())`, not bare `auth.uid()`.** Wrapping it in a
`select` lets Postgres evaluate it once per query instead of once per
row — a performance pattern, not a security fact on its own, but cheap to
check and free to fix.

**`auth.role() = 'authenticated'` is deprecated and unsafe.** It breaks
silently if anonymous sign-ins are ever enabled, since anonymous users
also carry the `authenticated` Postgres role. Use `to authenticated` on
the policy itself, not a role check inside `USING`.

## SECURITY DEFINER functions

**A `SECURITY DEFINER` function bypasses RLS entirely**, running with its
creator's (usually elevated) privileges. It's the right tool for a
narrow, deliberate exception — e.g. this project's public
collection-sharing read path — but never a fix for "RLS is blocking me,"
which just removes the access control instead of fixing why it's
blocking.

**Functions in the `public` schema are callable by everyone.** Postgres
grants `EXECUTE` to `PUBLIC` by default, and `anon`/`authenticated`
inherit from `PUBLIC` — so a `SECURITY DEFINER` function in `public` is a
public API endpoint the moment it's created, whether or not anyone
explicitly granted access to it. If a function takes a parameter, check
exactly what it returns for an unauthenticated caller passing an
arbitrary or guessed value.

**A table-level `anon` policy can't express "this exact token," only
"this row has *a* token."** This project's first attempt at public
collection sharing used `to anon using (share_token is not null)` — which
looks scoped, but a direct anon API call to
`.from('collections').select('*')` would return *every* shared collection
at once, tokens included, since the policy has no way to compare against
the one token the specific request presented. A `SECURITY DEFINER`
function that takes the token as a parameter and matches it server-side
is the correct shape for this class of problem.

## Keys and secrets

**The `service_role`/secret key must never reach client-accessible
code.** In Next.js specifically: any env var prefixed `NEXT_PUBLIC_` is
bundled into client-side JS and is therefore public, full stop — check
every `NEXT_PUBLIC_*` var for exactly this. If a feature seems to need
service-role privileges, that's a signal to use a narrower
`SECURITY DEFINER` function instead of reaching for the elevated key.

**`user_metadata` is user-editable — never use it in an authorization
decision.** It can appear in `auth.jwt()`, but a user can change their
own `raw_user_meta_data`. Authorization data belongs in
`app_metadata`/`raw_app_meta_data` instead.

## Auth and sessions

**`getSession()` reads the cookie without verifying it; `getUser()`/
`getClaims()` make a real server-side call to validate the session.** Any
server-side access-gating check using `getSession()` alone is trusting a
value the client could have tampered with — audit every auth gate for
which one it actually calls.

**Deleting a user doesn't invalidate their existing access tokens.** If
strict revocation matters, sessions need to be explicitly signed out or
checked against `auth.sessions`, not assumed dead the moment the user row
is gone.

## Storage

**A private bucket needs signed URLs, not public ones**, or anyone with a
guessed or leaked URL bypasses auth entirely. Check that bucket
visibility (public vs private) actually matches the intended access
model — a bucket created public "for convenience" is a full data leak,
not a performance tradeoff.

**Storage policies key off path segments, not a `user_id` column** —
`storage.objects` is Supabase's own table, so ownership is usually
expressed as `(storage.foldername(name))[1] = (select auth.uid())::text`.
Check that every upload path is actually prefixed with the uploader's own
id — a policy is only as good as the convention every upload respects.

**Upsert (overwrite) needs INSERT + SELECT + UPDATE**, not just INSERT —
granting only INSERT lets new files in but makes replacing an existing
file at the same path silently fail.

## Data API exposure

**A table can be reachable via the REST API independent of RLS.** RLS
controls which *rows* come back once a table is reachable; whether the
table is reachable at all is a separate Data API setting. A table with
RLS enabled but exposed with no policies at all just returns zero rows to
everyone — safe by default. But confirm this project's Data API settings
actually match intent, since the two controls are easy to conflate when
auditing.
