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
