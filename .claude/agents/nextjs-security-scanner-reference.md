# Next.js data-security reference

Seeded from the official Next.js documentation, "How to think about data
security in Next.js": https://nextjs.org/docs/app/guides/data-security
(Next.js docs version 16.3.4, page last updated 2026-08-25, fetched into
this file 2026-09-01). This is a point-in-time snapshot for the
`nextjs-security-scanner` subagent to audit against — re-fetch the page
if the guidance seems stale relative to a newer Next.js release.

## Data fetching approaches

Next.js recommends choosing **one** approach consistently rather than
mixing them, so both developers and security auditors know what to
expect:

- **External HTTP APIs** — for existing large apps with their own
  backend/API team; call existing REST/GraphQL endpoints from Server
  Components with `fetch`, same as from Client Components. Zero Trust
  model.
- **Data Access Layer (DAL)** — recommended for new projects (see below).
- **Component-level data access** — fine for prototypes, but easy to
  accidentally leak private fields to the client (see example below).

## Data Access Layer (DAL) — the recommended pattern

A DAL is an internal library that controls how/when data is fetched and
what gets passed into the render tree. It should:

- Only run on the server (mark modules with `import 'server-only'`).
- Perform authorization checks.
- Return safe, minimal **Data Transfer Objects (DTOs)** — not raw
  database rows.

```ts
// data/auth.ts
import { cache } from 'react'
import { cookies } from 'next/headers'

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies()
  const token = cookieStore.get('AUTH_TOKEN')
  const decodedToken = await decryptAndValidate(token)
  // Don't include secret tokens or private information as public fields.
  // Use classes to avoid accidentally passing the whole object to the client.
  return new User(decodedToken.id)
})
```

```ts
// data/user-dto.tsx
import 'server-only'
import { getCurrentUser } from './auth'

function canSeePhoneNumber(viewer, team) {
  return viewer.isAdmin || team === viewer.team
}

export async function getProfileDTO(slug: string) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const userData = rows[0]
  const currentUser = await getCurrentUser()

  // only return the data relevant for this query, not everything
  return {
    username: userData.username,
    phonenumber: canSeePhoneNumber(currentUser, userData.team)
      ? userData.phonenumber
      : null,
  }
}
```

> Only the DAL should access `process.env` for secret keys — this keeps
> secrets from being reachable elsewhere in the app.

**Component-level data access anti-pattern** — passing a full DB row
straight into a Client Component prop:

```tsx
// BAD
export default async function Page({ params }) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${params.slug}`
  // EXPOSED: every field in userData ships to the client
  return <Profile user={rows[0]} />
}
```

```tsx
// BAD prop type — accepts far more than the UI needs
;('use client')
export default function Profile({ user }: { user: User }) { ... }
```

Fix: return only public fields from the data-fetching function itself
(`{ name: user.name }`), not the whole row.

## Reading data — server/client boundary

- **Server Components**: run only on the server; may safely touch env
  vars, secrets, databases, internal APIs.
- **Client Components**: run on the server only during prerendering, but
  must be treated as browser code — must not touch privileged data or
  server-only modules.
- **`NEXT_PUBLIC_`-prefixed env vars are bundled into client JS.** Any
  secret/API key placed in one is exposed to the browser. Non-prefixed
  vars stay server-only by default.
- **Tainting** (optional, experimental): `experimental_taintObjectReference`
  / `experimental_taintUniqueValue` from React, enabled via
  `experimental.taint` in `next.config.js`, can mark objects/values as
  forbidden to pass to the client — an extra layer, not a substitute for
  filtering data in the DAL.
- **`import 'server-only'`** at the top of a module causes a build error
  if that module is ever imported into client code — use it to pin
  database/business-logic modules server-side.

## Mutating data — Server Actions

- Every exported Server Action (`"use server"`) is reachable via a direct
  POST request, whether or not it's referenced in the UI. Next.js gives
  two built-in protections (secure, non-deterministic action IDs; dead
  code elimination of unused actions from the client bundle), but **you
  must still treat every Server Action as a public HTTP endpoint** and
  verify auth inside it.
- **Always validate client input** (form data, searchParams, headers) —
  never trust it directly for authorization decisions:

```tsx
// BAD — trusts a client-controlled searchParam for an authz decision
export default async function Page({ searchParams }) {
  if ((await searchParams).isAdmin === 'true') return <AdminPanel />
}

// GOOD — re-verify server-side every time
import { cookies } from 'next/headers'
import { verifyAdmin } from './auth'
export default async function Page() {
  const isAdmin = await verifyAdmin((await cookies()).get('AUTH_TOKEN'))
  if (isAdmin) return <AdminPanel />
}
```

- **A page-level auth check does NOT protect the Server Action defined
  within it.** The action is a separate entry point and must re-verify
  the caller itself:

```tsx
export default async function AdminPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/login')

  return (
    <form
      action={async () => {
        'use server'
        // This re-check is the critical part — without it, the page-level
        // redirect above does nothing to protect this action.
        const session = await auth()
        if (!session?.user?.isAdmin) throw new Error('Unauthorized')
        await db.record.deleteMany()
      }}
    >
      <button>Delete Records</button>
    </form>
  )
}
```

- **Authentication (logged in?) is not the same as authorization
  (allowed to act on *this* resource?).** Missing the ownership check is
  an Insecure Direct Object Reference (IDOR) vulnerability:

```ts
'use server'
export async function deletePost(postId: string) {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorized')

  const post = await db.post.findUnique({ where: { id: postId } })
  // This ownership check is what actually prevents IDOR — without it,
  // any logged-in user could delete any post by guessing/enumerating IDs.
  if (post.authorId !== session.user.id) throw new Error('Forbidden')

  await db.post.delete({ where: { id: postId } })
}
```

- **DAL pattern for mutations too**: keep auth + authz + DB logic in a
  `server-only` module; let the thin `"use server"` action delegate to
  it. Keeps every mutation's authorization check in one place instead of
  duplicated (and potentially missed) across many actions.

- **Controlling return values**: Server Action return values are
  serialized to the client. Return only what the UI needs — not a raw DB
  record that may carry internal fields the client shouldn't see.

- **Rate limiting**: consider it for expensive mutations (email sends, DB
  writes) to prevent abuse.

- **Closures**: variables captured by a Server Action defined inside a
  component are encrypted by Next.js before being round-tripped to the
  client, but this should not be relied on alone to protect sensitive
  values — don't close over secrets you wouldn't otherwise pass to the
  client.

- **CSRF**: Server Actions only accept POST, and Next.js compares the
  `Origin` header against `Host`/`X-Forwarded-Host`, aborting on
  mismatch. Apps behind a reverse proxy with a different public domain
  need `experimental.serverActions.allowedOrigins` configured, or every
  action will be rejected.

- **No mutations during render**: don't set cookies, revalidate caches,
  or otherwise mutate state as a side effect of rendering (e.g. reading a
  `logout` searchParam and deleting a cookie in a Server Component body)
  — Next.js blocks cookie/cache mutation during render for this reason.
  Use a Server Action instead.

## The official "Auditing" checklist

Next.js's own guidance for auditors, verbatim — treat this as the
minimum bar for every audit run:

- **Data Access Layer**: Is there an established, isolated DAL? Are
  database packages and environment variables imported *only* inside it
  (not scattered across components/actions/handlers)?
- **`"use client"` files**: Do component props expect private data? Are
  the prop type signatures overly broad (accepting a whole record instead
  of the specific fields the UI renders)?
- **`"use server"` files**: Are action arguments validated (in the action
  or the DAL)? Is the user re-authorized *inside* the action? Does the
  action check *ownership* of the resource, not just that the caller is
  logged in? Are return values filtered to only what the client needs?
  Is DB access delegated to a `server-only` DAL rather than inlined?
- **`/[param]/` folders**: bracketed route segments are user input — are
  params validated before use (e.g. in a query)?
- **`proxy.ts` / middleware and `route.ts` Route Handlers**: these carry
  the most power (they run before/instead of normal request handling) —
  audit them with extra scrutiny.
