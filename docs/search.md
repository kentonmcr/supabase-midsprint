# Search (optional task)

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
