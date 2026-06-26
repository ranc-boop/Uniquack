import Link from "next/link";

import { QuestionListSkeleton } from "@/components/questions/question-list-skeleton";
import { Button } from "@/components/ui/button";

export default function QuestionsLoading() {
  return (
    <div className="space-y-5">
      <div className="student-hero">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Question Bank</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Build your next practice round
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Loading questions... Showing first 25 published questions while
              search and filters initialize.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/mistakes">Review mistakes</Link>
          </Button>
        </div>
      </div>
      <div className="student-panel space-y-4 p-4">
        <div className="space-y-2">
          <div className="h-5 w-48 rounded-md bg-slate-200/80" />
          <div className="h-4 w-full max-w-lg rounded-md bg-slate-100" />
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.5fr)_10rem_10rem_auto]">
          <div className="h-11 rounded-md border border-slate-200 bg-white/70 shadow-sm" />
          <div className="h-11 rounded-md border border-slate-200 bg-white/70 shadow-sm" />
          <div className="h-11 rounded-md border border-slate-200 bg-white/70 shadow-sm" />
          <div className="h-11 rounded-md border border-slate-200 bg-white/70 shadow-sm" />
        </div>
      </div>
      <QuestionListSkeleton variant="public" />
    </div>
  );
}
