"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { FeedbackText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PracticeCompletion,
  PracticeSourceOption,
} from "@/lib/practice/types";

export function PracticeWorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 sm:px-4 xl:grid-cols-[18rem_minmax(0,1fr)_3rem]" role="status">
      <span className="sr-only">Loading practice workspace…</span>
      <aside className="hidden border-r border-slate-100 px-4 py-6 xl:block">
        <div className="h-5 w-24 animate-pulse rounded bg-slate-100" />
        <div className="mt-8 h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="mt-7 space-y-3">
          <div className="h-10 animate-pulse rounded-lg bg-slate-50" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-50" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-50" />
        </div>
      </aside>
      <main className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-5 py-12">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-5 w-3/5 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 space-y-3">
          <div className="h-16 animate-pulse rounded-2xl bg-slate-50" />
          <div className="h-16 animate-pulse rounded-2xl bg-slate-50" />
        </div>
      </main>
    </div>
  );
}

export function PracticeSourceSelector({
  includePublicCatalog,
  locked,
  onIncludePublicCatalogChange,
  onSelectedBankIdsChange,
  practiceSources,
  selectedBankIds,
}: {
  includePublicCatalog: boolean;
  locked: boolean;
  onIncludePublicCatalogChange: (checked: boolean) => void;
  onSelectedBankIdsChange: (update: (current: string[]) => string[]) => void;
  practiceSources: PracticeSourceOption[];
  selectedBankIds: string[];
}) {
  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-slate-950">
            <BookOpen className="size-4 text-sky-700" aria-hidden="true" />
            Practice sources
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Choose up to 10 Libraries. This scope locks when the first round starts.
          </p>
        </div>
        <Badge variant="outline">
          {(includePublicCatalog ? 1 : 0) + selectedBankIds.length} selected
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {practiceSources.map((source) => {
          const checked = source.sourceKind === "public_catalog"
            ? includePublicCatalog
            : Boolean(source.bankId && selectedBankIds.includes(source.bankId));
          return (
            <label
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                checked ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white"
              } ${locked ? "cursor-not-allowed opacity-70" : "hover:border-sky-200"}`}
              key={source.id}
            >
              <input
                checked={checked}
                disabled={locked}
                onChange={(event) => {
                  if (source.sourceKind === "public_catalog") {
                    onIncludePublicCatalogChange(event.target.checked);
                    return;
                  }
                  if (!source.bankId) return;
                  onSelectedBankIdsChange((current) =>
                    event.target.checked
                      ? Array.from(new Set([...current, source.bankId!])).slice(0, 10)
                      : current.filter((id) => id !== source.bankId),
                  );
                }}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900">
                  {source.name}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {source.counts.unseen} unseen · {source.counts.needsRetry} retry ·{" "}
                  {source.counts.mastered} mastered
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {locked ? (
        <p className="mt-3 text-xs font-medium text-slate-500">
          This source scope was locked when the first round started. Start a new session to change it.
        </p>
      ) : null}
    </div>
  );
}

export function PracticeCompletionPanel({
  completion,
  isCompleted,
  onNewSession,
  onRetryMistakes,
  report,
  retryAvailable,
}: {
  completion: PracticeCompletion | null;
  isCompleted: boolean;
  onNewSession: () => void;
  onRetryMistakes: () => void;
  report: string;
  retryAvailable: boolean;
}) {
  return (
    <Card className="student-panel student-enter">
      <CardHeader>
        <Badge className="w-fit" variant="outline">
          {isCompleted ? "Practice complete" : "Finishing practice"}
        </Badge>
        <CardTitle className="text-2xl">
          {isCompleted ? "Your learning report" : "Building your learning report…"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FeedbackText
          className="border-none bg-transparent p-0 text-sm leading-7 text-slate-700"
          value={report || "Reviewing your saved practice evidence…"}
        />
        {completion ? (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["Mastered", completion.inventory.mastered],
              ["Unseen", completion.inventory.unseen],
              ["Retry later", completion.inventory.deferred],
            ].map(([label, value]) => (
              <div className="rounded-xl bg-slate-50 p-3" key={label}>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </span>
                <span className="mt-1 block text-xl font-bold text-slate-950">{value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {isCompleted ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={onNewSession} type="button">
              Start with more Libraries
            </Button>
            <Button
              disabled={!retryAvailable}
              onClick={onRetryMistakes}
              type="button"
              variant="outline"
            >
              Review remaining mistakes
            </Button>
            <Button asChild type="button" variant="ghost">
              <Link href="/student">Back to student workspace</Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
