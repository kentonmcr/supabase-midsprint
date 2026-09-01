---
description: Run all three security subagents in parallel and merge results into one severity-grouped report
allowed-tools: Agent
---

Run a full security scan of this project by dispatching all three project security subagents — `supabase-security-scanner`, `nextjs-security-scanner`, and `vercel-security-scanner` — then merge their findings into a single report.

## Step 1: Dispatch all three subagents in parallel

Invoke the Agent tool three times — once per subagent below — as three separate tool calls within the **same response**, so they run concurrently rather than one after another. Do not launch one, wait for it, then launch the next.

Each subagent starts with no memory of this conversation, so give each a complete, self-contained prompt:

1. **`supabase-security-scanner`** — prompt it to audit this project's Supabase setup: RLS enabled/policy completeness on every table, the `service_role` key never appearing client-side or in a `NEXT_PUBLIC_` env var, storage bucket privacy, and policies that trust client-editable data instead of `auth.uid()`. Tell it live CLI access is available (`supabase` CLI, already authenticated and linked) and it should use it rather than relying on docs alone. Tell it to report findings grouped by severity (critical/high/medium/low) and make no changes.

2. **`nextjs-security-scanner`** — prompt it to audit this Next.js app against its seeded Next.js data-security reference (`.claude/agents/nextjs-security-scanner-reference.md`): secrets behind `NEXT_PUBLIC_` vars, full DB records passed from Server to Client Components, Server Actions/Route Handlers missing re-authentication, permission checks that only verify login rather than resource ownership, and data access scattered outside `lib/*.ts`. Tell it to report findings grouped by severity and make no changes.

3. **`vercel-security-scanner`** — prompt it to audit this project's Vercel deployment configuration (not the codebase): environment variable scoping and `Sensitive` marking via `vercel env ls`, whether Production/Preview deployments are protected, whether CSP/`X-Frame-Options`/`X-Content-Type-Options` are configured and actually deployed, and whether git history shows a secret was ever committed and not rotated (using its timestamp cross-reference against `vercel env ls`'s `created` column). Tell it to report findings grouped by severity and make no changes.

All three subagents are read-only by design (no `Write`/`Edit` tool access) — they cannot change code or configuration regardless. Do not attempt to fix anything yourself either; this command produces a report only.

## Step 2: Wait for all three to complete

Each dispatch returns asynchronously. Wait for all three completion notifications before continuing — do not synthesize a report from partial results.

## Step 3: Merge into one report

Once all three have reported back, combine their findings into a single report with this structure:

```
# Security Scan — <date>

## Critical
## High
## Medium
## Low
```

For each finding:

- Place it under the severity the originating scanner assigned. If scanners disagree on severity for what is clearly the same underlying issue, use the higher severity and note the disagreement.
- **Deduplicate**: if two or more scanners flag substantively the same issue (same underlying location/root cause — e.g. both an Supabase- and Vercel-layer note about the same env var), list it **once**, and append which scanner(s) flagged it, e.g. `(flagged by supabase-security-scanner, vercel-security-scanner)`. Don't merge findings that only sound similar but concern different locations or root causes — when unsure, keep them separate rather than guessing they're the same issue.
- For every finding (deduplicated or not), preserve the location, the risk, and the plain-language impact as reported by the scanner(s).
- Note explicitly, at the end of the report, which subagent(s) — if any — reported nothing under a given severity tier or reported "unable to verify" items, so partial coverage is visible rather than silently dropped.

Present the merged report as your final response. Do not edit any files as part of this command.
