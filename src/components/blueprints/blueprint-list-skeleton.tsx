import Link from "next/link";

import type { BlueprintWorkspaceView } from "@/components/blueprints/blueprint-workspace";

const blueprintViewCopy: Record<
  BlueprintWorkspaceView,
  { description: string; title: string }
> = {
  history: {
    description: "Review rejected, archived, trashed, and versioned blueprint work.",
    title: "History / Archive / Trash",
  },
  library: {
    description: "Browse approved reusable blueprints, folders, calibration, and generation readiness.",
    title: "Approved Blueprint Library",
  },
  overview: {
    description: "Track review work, approved blueprints, import sources, and lifecycle health.",
    title: "Question Blueprint Workspace",
  },
  review: {
    description: "Review extracted blueprint drafts before they enter the approved library.",
    title: "Blueprint Review Queue",
  },
  sources: {
    description: "Store review actions from AI Parsing blueprint observation imports.",
    title: "Blueprint Import Sources",
  },
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

function BlueprintSubnav({ view }: { view: BlueprintWorkspaceView }) {
  const links: { href: string; label: string; view: BlueprintWorkspaceView }[] = [
    { href: "/admin/blueprints", label: "Overview", view: "overview" },
    { href: "/admin/blueprints/review", label: "Review", view: "review" },
    { href: "/admin/blueprints/library", label: "Library", view: "library" },
    { href: "/admin/blueprints/history", label: "History", view: "history" },
    { href: "/admin/blueprints/sources", label: "Sources", view: "sources" },
  ];

  return (
    <nav aria-label="Blueprint workspace" className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          className={`rounded-md border px-3 py-1.5 text-sm ${
            link.view === view
              ? "bg-primary text-primary-foreground"
              : "bg-background hover:bg-muted/40"
          }`}
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function BlueprintFolderShell() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-4 space-y-2">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-64" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-full" />
          <SkeletonBlock className="h-9 w-5/6" />
          <SkeletonBlock className="h-9 w-3/4" />
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

export function BlueprintListSkeleton({
  cardCount = 4,
}: {
  cardCount?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading blueprint workspace content"
      className="grid gap-4"
    >
      {Array.from({ length: cardCount }).map((_, index) => (
        <div className="rounded-lg border bg-card p-4 shadow-sm" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-6 w-3/4" />
              <SkeletonBlock className="h-4 w-full" />
            </div>
            <SkeletonBlock className="h-8 w-28" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-36" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SourcePlanSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading blueprint import sources"
      className="grid gap-3"
    >
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="rounded-lg border bg-card p-4 shadow-sm" key={index}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-5 w-64" />
            </div>
            <SkeletonBlock className="h-9 w-40" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SkeletonBlock className="h-14 w-full" />
            <SkeletonBlock className="h-14 w-full" />
            <SkeletonBlock className="h-14 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BlueprintWorkspaceLoading({
  view,
}: {
  view: BlueprintWorkspaceView;
}) {
  const copy = blueprintViewCopy[view];
  const isSources = view === "sources";
  const showFolderShell = view === "library" || view === "overview";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Blueprint Library
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <BlueprintSubnav view={view} />
      </div>
      <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        Loading blueprint workspace...
      </div>
      {showFolderShell ? <BlueprintFolderShell /> : null}
      {isSources ? <SourcePlanSkeleton /> : <BlueprintListSkeleton />}
    </div>
  );
}
