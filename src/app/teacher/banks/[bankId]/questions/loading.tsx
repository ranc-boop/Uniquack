import { QuestionListSkeleton } from "@/components/questions/question-list-skeleton";

export default function TeacherBankQuestionsLoading() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">Loading Library questions...</span>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <div className="h-4 w-28 rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="mt-4 h-8 w-72 max-w-full rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100 motion-safe:animate-pulse" />
      </section>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            className="h-10 w-28 shrink-0 rounded-md bg-slate-100 motion-safe:animate-pulse"
            key={index}
          />
        ))}
      </div>
      <QuestionListSkeleton rowCount={6} variant="admin" />
    </div>
  );
}
