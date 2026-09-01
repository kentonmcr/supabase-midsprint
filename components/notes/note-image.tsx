"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getNoteImageSignedUrl } from "@/lib/storage";
import { getErrorMessage } from "@/lib/utils";

export function NoteImage({
  userId,
  path,
}: {
  userId: string;
  path: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    getNoteImageSignedUrl(supabase, userId, path)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(getErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, path]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!url) return null;

  // eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset
  return <img src={url} alt="" className="rounded-md max-h-64 w-auto" />;
}
