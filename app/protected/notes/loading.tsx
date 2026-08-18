import { Skeleton } from "@/components/ui/skeleton";

export default function NotesLoading() {
  return (
    <div className="flex-1 w-full flex flex-col gap-8">
      <Skeleton className="h-8 w-24" />

      <div className="flex flex-col sm:flex-row gap-8">
        <div className="flex flex-col gap-8 w-full sm:w-56 shrink-0">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-8 min-w-0">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-9 w-full" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
