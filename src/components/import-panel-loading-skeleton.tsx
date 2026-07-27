import { cn } from "@/lib/utils";

type ImportPanelLoadingSkeletonProps = {
  variant: "assets" | "json" | "package" | "pdf";
};

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

export function ImportPanelLoadingSkeleton({
  variant,
}: ImportPanelLoadingSkeletonProps) {
  if (variant === "json") {
    return (
      <div
        aria-busy="true"
        aria-label="Loading JSON import editor"
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]"
      >
        <div className="space-y-3">
          <SkeletonBlock className="min-h-[520px] w-full" />
          <div className="flex flex-wrap gap-2">
            {["w-32", "w-36", "w-28", "w-36"].map((width, index) => (
              <SkeletonBlock
                className={cn("h-10", width)}
                key={`${width}-${index}`}
              />
            ))}
          </div>
        </div>
        <aside className="space-y-4 rounded-md border p-3">
          <SkeletonBlock className="h-5 w-20" />
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock className="h-4 w-full" key={index} />
          ))}
        </aside>
      </div>
    );
  }

  const title =
    variant === "assets"
      ? "Loading bulk asset matcher"
      : variant === "package"
        ? "Loading package import controls"
        : "Loading AI PDF import controls";

  return (
    <div aria-busy="true" aria-label={title} className="space-y-5">
      <section className="space-y-3 rounded-md border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-52" />
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
          <SkeletonBlock className="h-9 w-36" />
        </div>
        {variant === "assets" ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock className="h-6 w-24 rounded-full" key={index} />
            ))}
          </div>
        ) : null}
      </section>

      {variant === "pdf" ? (
        <>
          <section className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-5 w-44" />
              <SkeletonBlock className="h-8 w-20" />
            </div>
            <SkeletonBlock className="h-16 w-full" />
            <SkeletonBlock className="h-16 w-full" />
          </section>
          <section className="grid gap-4 rounded-md border p-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="space-y-2" key={index}>
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-md border">
          <div className="grid gap-3 p-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock className="h-4 w-full" key={index} />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="grid gap-3 border-t p-4 md:grid-cols-4" key={index}>
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-8 w-24" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
