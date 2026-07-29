import { AdminLoadingState } from "@/components/admin/admin-loading-state";
import { QuestionListSkeleton } from "@/components/questions/question-list-skeleton";

export default function AdminQuestionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Content management
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Central Public Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Search, filter, edit, and maintain global questions. Teacher-owned
          Library content stays in its own workspace.
        </p>
      </div>
      <div
        aria-hidden="true"
        className="flex gap-2 overflow-hidden rounded-lg border bg-white p-2 shadow-sm"
      >
        {["w-28", "w-40", "w-36", "w-32", "w-20"].map((width) => (
          <div
            className={`h-10 shrink-0 rounded-md bg-muted motion-safe:animate-pulse ${width}`}
            key={width}
          />
        ))}
      </div>
      <div className="h-10 w-40 rounded-md bg-muted motion-safe:animate-pulse" />
      <AdminLoadingState
        description="Showing first 50 questions. Use search or filters to narrow results."
        label="Loading questions..."
        rows={0}
      >
        <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_1fr_auto]">
          <div className="h-10 rounded-md border bg-muted/40" />
          <div className="h-10 rounded-md border bg-muted/40" />
          <div className="h-10 w-32 rounded-md border bg-muted/40" />
        </div>
      </AdminLoadingState>
      <QuestionListSkeleton variant="admin" />
    </div>
  );
}
