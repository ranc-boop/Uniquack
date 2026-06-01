export default function QuestionDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-3">
        <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-6 rounded-md border p-6">
        <div className="flex gap-2">
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-6 w-1/2 animate-pulse rounded-md bg-muted" />
        <div className="space-y-3 rounded-md border p-4">
          <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-11/12 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-4/5 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-12 animate-pulse rounded-md border bg-muted/50" />
        <div className="h-12 animate-pulse rounded-md border bg-muted/50" />
      </div>
    </div>
  );
}
