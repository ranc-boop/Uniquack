type QuestionListSkeletonProps = {
  rowCount?: number;
  variant?: "admin" | "public";
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export function QuestionListSkeleton({
  rowCount = 6,
  variant = "public",
}: QuestionListSkeletonProps) {
  if (variant === "admin") {
    return (
      <div
        aria-busy="true"
        aria-label="Loading questions"
        className="overflow-hidden rounded-md border"
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SkeletonBlock className="h-9 w-28" />
          <SkeletonBlock className="h-9 w-40" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <div className="divide-y">
          {Array.from({ length: rowCount }).map((_, index) => (
            <div
              className="grid gap-3 p-4 md:grid-cols-[5rem_minmax(0,1fr)_6rem_12rem_6rem_6rem_9rem]"
              key={index}
            >
              <SkeletonBlock className="h-4 w-16" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-16" />
              <div className="flex flex-wrap gap-2">
                <SkeletonBlock className="h-6 w-20" />
                <SkeletonBlock className="h-6 w-24" />
              </div>
              <SkeletonBlock className="h-4 w-12" />
              <SkeletonBlock className="h-5 w-16" />
              <SkeletonBlock className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label="Loading questions"
      className="grid gap-3"
    >
      {Array.from({ length: rowCount }).map((_, index) => (
        <div className="student-panel space-y-3 p-4" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-5 w-3/4" />
            </div>
            <SkeletonBlock className="h-8 w-24" />
          </div>
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-2/3" />
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-6 w-24" />
            <SkeletonBlock className="h-6 w-28" />
            <SkeletonBlock className="h-6 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
