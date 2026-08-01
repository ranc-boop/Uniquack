import { QuestionListSkeleton } from "@/components/questions/question-list-skeleton";

export default function TeacherBankQuestionsLoading() {
  return (
    <div aria-busy="true" className="space-y-5" role="status">
      <span className="sr-only">Loading Library questions</span>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-3">
          <div className="h-8 w-64 max-w-full rounded bg-slate-200 motion-safe:animate-pulse motion-reduce:animate-none" />
          <div className="h-4 w-28 rounded bg-slate-100 motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="h-10 w-36 rounded bg-slate-200 motion-safe:animate-pulse motion-reduce:animate-none" />
      </header>
      <QuestionListSkeleton rowCount={6} variant="admin" />
    </div>
  );
}
