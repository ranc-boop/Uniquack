import { ReviewDraftListSkeleton } from "@/components/review/review-draft-list-skeleton";

export default function AdminReviewLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Review Drafts</h1>
        <p className="text-sm text-muted-foreground">
          Loading Review Drafts... The queue shell is ready while draft cards
          and related assets load below.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="h-10 min-w-64 flex-1 rounded-md border bg-muted/40" />
        <div className="h-10 w-24 rounded-md border bg-muted/40" />
        <div className="h-10 w-24 rounded-md border bg-muted/40" />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3 text-sm">
        <div className="h-9 w-28 rounded-md border bg-muted/40" />
        <div className="h-9 w-36 rounded-md border bg-muted/40" />
        <div className="h-9 w-36 rounded-md border bg-muted/40" />
        <span className="text-xs text-muted-foreground">
          Select draft cards below before applying a bulk action.
        </span>
      </div>
      <ReviewDraftListSkeleton />
    </div>
  );
}
