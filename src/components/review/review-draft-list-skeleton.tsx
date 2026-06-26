type ReviewDraftListSkeletonProps = {
  cardCount?: number;
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function ReviewDraftListSkeleton({
  cardCount = 5,
}: ReviewDraftListSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading Review Drafts"
      className="grid gap-4"
    >
      {Array.from({ length: cardCount }).map((_, index) => (
        <div className="rounded-lg border bg-card p-4 shadow-sm" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-5 w-3/4" />
              <SkeletonBlock className="h-4 w-1/2" />
            </div>
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-9 w-24" />
              <SkeletonBlock className="h-9 w-24" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
