import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-slate-100 motion-safe:animate-pulse", className)}
    />
  );
}

export function WorkspaceLoadingSkeleton({
  label = "Loading workspace...",
}: {
  label?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="space-y-6"
      role="status"
    >
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <SkeletonBlock className="h-4 w-28" />
        <SkeletonBlock className="mt-4 h-8 w-full max-w-lg" />
        <SkeletonBlock className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-5 flex flex-wrap gap-3">
          <SkeletonBlock className="h-10 w-32" />
          <SkeletonBlock className="h-10 w-36" />
        </div>
      </section>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock className="h-10 w-28 shrink-0" key={index} />
        ))}
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="rounded-lg border border-slate-200/80 bg-white p-4 shadow-sm"
            key={index}
          >
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="mt-4 h-8 w-16" />
            <SkeletonBlock className="mt-3 h-4 w-full" />
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="space-y-3 p-5" key={index}>
              <SkeletonBlock className="h-5 w-2/5" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function LibraryLoadingSkeleton({
  label = "Loading Libraries...",
}: {
  label?: string;
}) {
  return <WorkspaceLoadingSkeleton label={label} />;
}
