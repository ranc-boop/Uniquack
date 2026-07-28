"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";

import { LoadingIndicator } from "@/components/loading-indicator";
import { FeedbackText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PracticeCompletion,
  PracticeCourseFrameworkSummary,
  PracticeRoundHistory,
  PracticeSourceOption,
} from "@/lib/practice/types";

const starterGoals = [
  "AP Calculus: implicit differentiation with harder MCQs",
  "Review missed integration questions and explain traps",
  "Build a short mixed round on limits and continuity",
  "Practice FRQ-style derivative applications",
];

export function PracticeSessionListLoading() {
  return (
    <div
      aria-busy="true"
      className="space-y-2 rounded-xl border border-slate-200/80 bg-white/70 p-3"
      role="status"
    >
      <LoadingIndicator label="Loading recent sessions..." />
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="flex items-center gap-3 py-1.5" key={index}>
          <div className="h-7 w-1 rounded-full bg-slate-100 motion-safe:animate-pulse" />
          <div className="h-4 flex-1 rounded bg-slate-100 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export function PracticeInlineLoading({ label }: { label: string }) {
  return <LoadingIndicator className="text-xs" label={label} />;
}

export function PracticeFrameworkSelector({
  frameworks,
  loading,
  onChange,
  value,
}: {
  frameworks: PracticeCourseFrameworkSummary[];
  loading: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  if (frameworks.length) {
    return (
      <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
        <span>Framework</span>
        <select
          className="max-w-44 bg-transparent text-sm font-bold text-slate-900 outline-none"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">None</option>
          {frameworks.map((framework) => (
            <option key={framework.id} value={framework.id}>
              {framework.title}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return loading ? (
    <span className="flex h-10 items-center rounded-full border border-slate-200 bg-slate-50 px-3">
      <LoadingIndicator label="Loading options" />
    </span>
  ) : null;
}

export function PracticeStarterGoals({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (goal: string) => void;
}) {
  return (
    <div className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
      {starterGoals.map((goal) => (
        <button
          className="student-focus-ring rounded-full border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md"
          disabled={disabled}
          key={goal}
          onClick={() => onSelect(goal)}
          type="button"
        >
          {goal}
        </button>
      ))}
    </div>
  );
}

export function PracticeSourceSelector({
  includePublicCatalog,
  loading,
  locked,
  onIncludePublicCatalogChange,
  onSelectedBankIdsChange,
  practiceSources,
  selectedBankIds,
}: {
  includePublicCatalog: boolean;
  loading: boolean;
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
        </div>
        <Badge variant="outline">
          {(includePublicCatalog ? 1 : 0) + selectedBankIds.length} selected
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <>
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2 lg:col-span-3">
              <LoadingIndicator label="Loading available question sources..." />
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="h-16 rounded-xl bg-slate-100 motion-safe:animate-pulse"
                key={index}
              />
            ))}
          </>
        ) : practiceSources.map((source) => {
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
                  {source.counts.questionCount} total ·{" "}
                  {source.counts.unseen + source.counts.needsRetry} available ·{" "}
                  {source.counts.unseen} not attempted · {source.counts.needsRetry} retry ·{" "}
                  {source.counts.mastered} answered correctly
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

export function PracticeRoundNavigator({
  completed,
  onSelectCompletion,
  onSelectRound,
  rounds,
  selectedRoundId,
}: {
  completed: boolean;
  onSelectCompletion: () => void;
  onSelectRound: (roundId: string) => void;
  rounds: PracticeRoundHistory[];
  selectedRoundId: string | null;
}) {
  if (!rounds.length) return null;

  return (
    <nav aria-label="Practice round history" className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500">
          History
        </span>
        {rounds.map((round, index) => (
          <Button
            aria-current={selectedRoundId === round.id ? "page" : undefined}
            className="shrink-0"
            key={round.id}
            onClick={() => onSelectRound(round.id)}
            size="sm"
            type="button"
            variant={selectedRoundId === round.id ? "default" : "outline"}
          >
            Round {index + 1}
            {round.score.total > 0 ? ` · ${round.score.correct}/${round.score.total}` : ""}
          </Button>
        ))}
        {completed ? (
          <Button
            aria-current={selectedRoundId === null ? "page" : undefined}
            className="shrink-0"
            onClick={onSelectCompletion}
            size="sm"
            type="button"
            variant={selectedRoundId === null ? "default" : "outline"}
          >
            Final report
          </Button>
        ) : null}
      </div>
    </nav>
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
              ["Not attempted", completion.inventory.unseen],
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
