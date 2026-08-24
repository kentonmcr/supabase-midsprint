# Notes App — Turing College "Building with AI Agents"

A private, per-user notes app backed by Supabase, built on the official
`with-supabase` Next.js starter. This is a course exercise (spanning a
midsprint and a follow-on sprint) — keep changes scoped, readable, and
easy to explain in a walkthrough. See `REFLECTION.md` for the reasoning
behind key decisions, including the shared-pool → per-user schema pivot.

## Stack

- Next.js (App Router, TypeScript, React 19)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) for auth, Postgres,
  and Storage (note images — see `docs/image-uploads.md`)
- Tailwind CSS + shadcn/ui components (`components/ui/*`, configured via
  `components.json`)
- next-themes for light/dark mode

## Structure

- `app/` — routes. `app/auth/*` is the existing login/sign-up/password flow,
  `app/protected/*` is an example authenticated page.
- `app/auth/confirm/route.ts` vs `app/auth/callback/route.ts` — two
  different auth completion routes, don't conflate them. `confirm` handles
  the OTP/magic-link flow (`token_hash` + `type` query params,
  `supabase.auth.verifyOtp()`) used by email confirmation and password
  reset. `callback` handles the OAuth PKCE flow (`code` query param,
  `supabase.auth.exchangeCodeForSession()`) used by Google sign-in — add
  any future OAuth provider's redirect here too, not a new route.
- `lib/supabase/client.ts` — browser Supabase client (Client Components).
- `lib/supabase/server.ts` — server Supabase client (Server Components,
  Route Handlers, Server Actions). Always create a fresh client per request —
  never hoist it into a module-level singleton.
- `lib/supabase/proxy.ts` + `proxy.ts` — session refresh middleware, runs on
  every request per the matcher in `proxy.ts`.
- `components/` — shared UI; `components/ui/` is shadcn-generated, prefer
  adding new primitives via `npx shadcn@latest add <component>` over
  hand-rolling them.
- `.agents/skills/` + `.claude/skills/` — two Supabase agent skills
  (`supabase`, `supabase-postgres-best-practices`) installed via
  `npx skills add supabase/agent-skills`, symlinked so Claude Code
  registers them. Consult these — especially
  `supabase-postgres-best-practices` — before schema/RLS/index changes;
  the missing foreign-key indexes (see `docs/data-model.md`) were only
  caught after the fact because this wasn't properly wired in until
  partway through the project.

## Environment

`.env.local` holds the real project credentials (gitignored, never commit
it). Required vars, from the Supabase project dashboard (Settings > API):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Run `npm run dev` to start locally.

## Feature documentation

Schema, RLS, and reasoning for individual features live in `docs/`,
referenced here so they load as needed rather than bloating this file:

- @docs/data-model.md — tables, RLS policies, indexes, and the schema
  gotchas hit while building them by hand
- @docs/search.md — server-side full-text search (optional task)
- @docs/loading-states.md — `loading.tsx`/`error.tsx` conventions
  (optional task)
- @docs/image-uploads.md — Storage-backed note images (optional task)
- @docs/collection-sharing.md — public read-only share links (optional
  task)

## Authentication rules

- **Use Supabase Auth for all sign-in and session handling — never build
  custom auth or store passwords.** Email/password
  (`signInWithPassword`) and Google OAuth (`signInWithOAuth({ provider:
  "google" })`) are the only two sign-in paths in this app, both fully
  handled by Supabase; there is no separate account/password system
  anywhere in this codebase.
- **Every page under `app/protected/` requires a signed-in user,
  verified on the server before the page loads** — via
  `supabase.auth.getClaims()` (or `getUser()`), which makes a real
  server-side call to validate the session. Never `getSession()` alone:
  it only reads the cookie without verifying it, so it is not
  trustworthy for gating access. See `app/protected/notes/page.tsx` for
  the pattern; don't invent a second one. Redirect to `/auth/login` if
  the user is not signed in.
- **After a successful sign-in, redirect to `/protected/notes`.**
  `components/login-form.tsx` (email/password and Google),
  `app/auth/callback/route.ts` (OAuth PKCE completion), and
  `components/sign-up-form.tsx` (email confirmation link) all do this —
  keep it consistent for any future sign-in path.
- **After sign-out, redirect to `/auth/login`.**
  `components/logout-button.tsx` already does this.
- **Always call `router.refresh()` right after `router.push()` on both the
  sign-in and sign-out transitions.** `router.push()` is a client-side
  navigation — Next.js can serve a cached version of the destination route
  instead of asking the server for fresh data. Bug found by testing: sign
  out as one user, sign in as a second, and `/protected/notes` briefly
  showed the *first* user's notes until a manual browser refresh. This
  was not an RLS/database leak (compare the bug documented in
  `docs/data-model.md`) — the database was already returning the correct,
  per-user rows the whole time. The bug was that the browser hadn't asked
  it to. `router.refresh()`
  clears the client-side cache for the current route and re-fetches/
  re-renders the Server Component, so the new session's data is what
  actually shows up. Fixed in `components/logout-button.tsx` and
  `components/login-form.tsx`'s `handleLogin`.
- Email/password and Google OAuth are otherwise indistinguishable once
  signed in — same session, same `auth.uid()`, no separate code paths
  anywhere else in the app. Google requires a Client ID/Secret configured
  directly in the Supabase Dashboard's Google provider settings (not
  something this codebase configures) plus the `/auth/callback` redirect
  route above.
- **Password requirements: at least 8 characters, including an
  uppercase letter, a lowercase letter, a digit, and a symbol.**
  Enforced in two places, deliberately kept in sync: client-side in
  `components/sign-up-form.tsx` (`isPasswordValid()`, checked before
  `supabase.auth.signUp()` is ever called, so the error shows instantly
  without a round trip) and server-side via the same minimum
  length/character-type settings in the Supabase Dashboard
  (Authentication → Sign In / Providers → Email), which rejects
  non-conforming passwords on every sign-up and password change
  regardless of client. If either side's rule changes, update the
  other to match.
- **The `service_role`/secret key must never be placed in a client-
  accessible env var, and never sent to the browser.** In Next.js, any
  env var prefixed `NEXT_PUBLIC_` is bundled into client-side JS and
  therefore public — that's exactly why this project only ever uses
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (see Environment above), both safe-to-expose keys, everywhere,
  including in `lib/supabase/server.ts`. There is currently no
  `service_role` key anywhere in this project — no `.env.local` entry, no
  code reference — and none of this app's features (including the
  `SECURITY DEFINER` functions used for collection sharing) require one.
  If a future feature seems to need elevated/service-role privileges,
  that's a signal to re-examine the design (e.g. a narrower
  `SECURITY DEFINER` function, as done for sharing) rather than reach for
  the service-role key in application code.

## Conventions

- Server Components by default; add `"use client"` only where interactivity
  (forms, state, event handlers) requires it.
- **All Supabase queries/mutations live in `lib/<feature>.ts` helper
  modules** (e.g. `lib/notes.ts`), not inline in components — each function
  takes a `SupabaseClient` as its first argument so the same functions work
  from both a Server Component (passing the `lib/supabase/server.ts`
  client) and a Client Component (passing the `lib/supabase/client.ts`
  client). Follow this pattern for collections/tags too rather than
  inlining `.from(...)` calls in new components.
- Mutations are triggered from `"use client"` components calling
  `createClient()` from `lib/supabase/client.ts` directly in the event
  handler (see `components/login-form.tsx` and
  `components/notes/notes-manager.tsx`) — there is no Server Actions
  convention in this codebase, don't introduce one without reason.
- Styling: Tailwind utility classes + existing shadcn `ui/` primitives.
  Match the existing minimal, unstyled-shadcn aesthetic rather than adding a
  new design system.
- Don't commit `.env.local` or any real Supabase keys.

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run lint` — ESLint

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
