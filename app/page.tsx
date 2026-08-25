import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EnvVarWarning } from "@/components/env-var-warning";
import { hasEnvVars } from "@/lib/utils";

// This route has no content of its own — it only ever redirects — so
// there's nothing worth shipping as a static shell. `instant = false`
// lets it block for a real server-side redirect instead of streaming
// one shell, then relying on client-side JS to navigate away from it.
export const instant = false;

export default async function Home() {
  if (!hasEnvVars) {
    return (
      <main className="min-h-screen flex items-center justify-center p-5">
        <EnvVarWarning />
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  redirect(data?.claims ? "/protected/notes" : "/auth/login");
}
