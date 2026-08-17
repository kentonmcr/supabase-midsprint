# Reflections

Journal entries on the build process go here — one section per milestone.

## 2026-08-12 — Scaffolding & Notes CRUD

## 2026-08-13 — Optional task: server-side full-text search

### Code review run on PR diff

Command: `/code-review 1` (Claude Code's built-in `code-review` slash
command), run against [PR #1](https://github.com/kentonmcr/supabase-midsprint/pull/1)
("Add server-side full-text search").

Findings:

1. **Race condition on rapid typing** (`components/notes/notes-manager.tsx`,
   debounced search effect) — the debounce only cancelled pending
   *timers*, not in-flight requests. Typing "cat" then quickly "cats"
   could let the slower "cat" response resolve after the "cats" response
   and silently overwrite it, showing stale results for the current query
   text.
2. **Misleading state on search failure** — on error, `searchMatchIds`
   was left at its previous value (often `null`, meaning "no active
   search"), so a failed search showed the *full unfiltered note list*
   next to an error banner instead of showing no results.
3. **Unnecessary Supabase client construction** — `createClient()` was
   called on every keystroke (before the debounce gate), not just when a
   search actually fired.

Fix applied: added a monotonically increasing request-id ref so a
response is only applied if it's still the latest request; error handling
now sets `searchMatchIds` to an empty set (not left stale) so the UI
correctly shows zero results alongside the error; `createClient()` moved
inside the debounced callback so it only runs once per actual search.

## 2026-08-13 — Optional task: collection sharing via link

### Code review run on PR diff

Command: `/code-review 2`, run against [PR #2](https://github.com/kentonmcr/supabase-midsprint/pull/2)
("Add collection sharing via link"). 10 findings total; the most
important one:

**RLS policies leaked every shared collection at once, not just the one
matching a specific link's token.** The original design used
`to anon using (share_token is not null)` on `collections` and a
subquery-based equivalent on `notes`. RLS policies check "does this row
satisfy this condition" per row — they have no concept of "the specific
token this HTTP request presented." That policy is true for *every*
shared collection at once, so a direct anonymous API call with no filter
at all (`supabase.from('collections').select('*')`) would return every
shared collection's name and live share token in one response — the
app's own `.eq('share_token', token)` filter was doing the real work of
scoping, not the database. Verified by hand: a raw `curl` against the
`collections` REST endpoint using only the public anon key returned the
full row set, no token needed.

Fix applied: replaced both anon policies with two `SECURITY DEFINER`
Postgres functions (`get_shared_collection`, `get_shared_collection_notes`)
that take the token as a required parameter and do the match internally,
returning only the one row/set matching the exact token — anon gets
`EXECUTE` on the functions, no `SELECT` grant on the tables at all.
Re-verified the same way: the direct table query now returns `[]`.

Minor findings also fixed: `handleCopyLink` had no error handling (now
matches the try/catch pattern its sibling handlers use);
`shareCollection`/`unshareCollection` were near-duplicate functions (now
share one internal helper); the `/shared` path exclusion in
`lib/supabase/proxy.ts` used a bare `startsWith("/shared")`, which would
also exempt an unrelated future route like `/shared-admin` — narrowed to
an exact match plus a `/shared/`-prefixed match.

Skipped (judgment calls, not fixed): a finding that any signed-in user
can rewrite any collection's `share_token` — true, but consistent with
this app's already-deliberate no-`user_id`, shared-pool design (every
authenticated user already has full write access to everything, not new
to this PR); `crypto.randomUUID()` requiring a secure context — not a
real risk for this project's deployment targets (localhost dev, HTTPS
hosting); short-circuiting `getClaims()` in the middleware before the
public-path check — skipped because that file has an explicit
maintainer comment warning against restructuring around `getClaims()`
due to a risk of randomly logging users out, and the performance gain
here is marginal.
