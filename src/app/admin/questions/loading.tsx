import { AdminLoadingState } from "@/components/admin/admin-loading-state";
import { QuestionListSkeleton } from "@/components/questions/question-list-skeleton";

export default function AdminQuestionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Questions</h1>
        <p className="text-sm text-muted-foreground">
          Manage the question bank. Filters and actions are loading first;
          question rows will appear below.
        </p>
      </div>
      <details className="rounded-lg border bg-card p-5 shadow-sm">
        <summary className="cursor-pointer list-none">
          <div className="space-y-1">
            <p className="text-base font-semibold">Create question</p>
            <p className="text-sm text-muted-foreground">
              Manual creation controls are loading.
            </p>
          </div>
        </summary>
      </details>
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
