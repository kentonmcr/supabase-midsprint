import { EnvVarWarning } from "@/components/env-var-warning";

// Normal requests never reach this component — proxy.ts (middleware)
// redirects / before the page renders, based on auth state. This only
// renders in the one case middleware skips: .env.local not configured
// yet (the fresh-clone case the README's setup steps describe).
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <EnvVarWarning />
    </main>
  );
}
