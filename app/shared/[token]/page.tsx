import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCollectionByShareToken } from "@/lib/collections";
import { listSharedCollectionNotes } from "@/lib/notes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SharedCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-8 max-w-3xl p-5">
        <Suspense
          fallback={
            <p className="pt-8 text-sm text-muted-foreground">Loading…</p>
          }
        >
          <SharedCollection params={params} />
        </Suspense>
      </div>
    </main>
  );
}

async function SharedCollection({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const collection = await getCollectionByShareToken(supabase, token);
  if (!collection) {
    notFound();
  }

  const notes = await listSharedCollectionNotes(supabase, token);

  return (
    <>
      <div className="flex flex-col gap-1 pt-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:underline w-fit"
        >
          Notes
        </Link>
        <p className="text-sm text-muted-foreground">Shared collection</p>
        <h1 className="font-bold text-2xl">{collection.name}</h1>
      </div>

      <div className="flex flex-col gap-4">
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This collection has no notes yet.
          </p>
        )}
        {notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <CardTitle className="text-base">{note.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
