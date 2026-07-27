import { cn } from "@/lib/utils";

type AdminRouteLoadingProps = {
  description: string;
  libraryNav?: boolean;
  title: string;
  variant?: "cards" | "form" | "table";
};

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

function LibraryNavSkeleton() {
  const widths = ["w-28", "w-40", "w-36", "w-32", "w-20"];

  return (
    <div
      aria-hidden="true"
      className="flex gap-2 overflow-hidden rounded-lg border bg-white p-2 shadow-sm"
    >
      {widths.map((width) => (
        <SkeletonBlock className={cn("h-10 shrink-0", width)} key={width} />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_14rem_auto]">
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-10 w-24" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="grid gap-4 p-4 md:grid-cols-[minmax(10rem,1.3fr)_minmax(8rem,1fr)_7rem_minmax(10rem,1fr)]"
            key={index}
          >
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-4/5" />
              <SkeletonBlock className="h-3 w-2/5" />
            </div>
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-6 w-20 rounded-full" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-9 w-24" />
              <SkeletonBlock className="h-9 w-20" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FormSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, cardIndex) => (
        <section className="space-y-5 rounded-lg border bg-card p-5" key={cardIndex}>
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-4/5" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, fieldIndex) => (
              <div className="space-y-2" key={fieldIndex}>
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-10 w-full" />
              </div>
            ))}
          </div>
          <SkeletonBlock className="h-10 w-32" />
        </section>
      ))}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <section className="space-y-3 rounded-lg border bg-card p-5" key={index}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-5 w-2/3" />
              <SkeletonBlock className="h-4 w-full" />
            </div>
            <SkeletonBlock className="h-8 w-20" />
          </div>
          <SkeletonBlock className="h-4 w-4/5" />
          <SkeletonBlock className="h-4 w-1/2" />
        </section>
      ))}
    </div>
  );
}

export function AdminRouteLoading({
  description,
  libraryNav = false,
  title,
  variant = "cards",
}: AdminRouteLoadingProps) {
  return (
    <div
      aria-busy="true"
      aria-label={`Loading ${title}`}
      className="space-y-6"
    >
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </header>
      {libraryNav ? <LibraryNavSkeleton /> : null}
      {variant === "table" ? <TableSkeleton /> : null}
      {variant === "form" ? <FormSkeleton /> : null}
      {variant === "cards" ? <CardsSkeleton /> : null}
    </div>
  );
}
