# Loading states (optional task)

`app/protected/notes/loading.tsx` — Next.js App Router's built-in
convention: any route segment with a `loading.tsx` file automatically
wraps the page in a Suspense boundary and shows that file as the
fallback while the page's async Server Component work (here, the
`Promise.all` of `listNotes`/`listCollections`/`listTags`/
`listNoteTags` in `app/protected/notes/page.tsx`) is in flight — no
manual loading state, no client-side fetch-and-spinner pattern needed.
Built with the shadcn `Skeleton` component
(`npx shadcn@latest add skeleton`), laid out to roughly match the real
page's shape (sidebar + note cards) so the transition doesn't jump
around. Hard to see locally since Supabase responds fast enough that it
flashes by quickly — that's expected, not a sign it isn't working.

**`app/protected/notes/error.tsx`** — matching error-boundary convention
for the same segment: `lib/*.ts` functions throw Supabase's raw error
object on failure, so this catches that and shows a "Try again" button
instead of a crash.
