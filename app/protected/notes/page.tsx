import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { listNotes } from "@/lib/notes";
import { listCollections } from "@/lib/collections";
import { NotesManager } from "@/components/notes/notes-manager";

export default async function NotesPage() {
  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/auth/login");
  }

  const [notes, collections] = await Promise.all([
    listNotes(supabase),
    listCollections(supabase),
  ]);

  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <h1 className="font-bold text-2xl">Notes</h1>
      <NotesManager initialNotes={notes} initialCollections={collections} />
    </div>
  );
}
