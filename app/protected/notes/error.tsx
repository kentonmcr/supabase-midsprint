"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function NotesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="text-sm text-muted-foreground">
        Something went wrong loading your notes.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
