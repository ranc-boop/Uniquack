"use client";

import { BookOpen } from "lucide-react";

import { LoadingIndicator } from "@/components/loading-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { PracticeLoadingBlock } from "@/components/practice/practice-loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  PracticeCourseFrameworkSummary,
  PracticeRoundHistory,
  PracticeSourceOption,
} from "@/lib/practice/types";

const starterGoals = [
  {
    value: "AP Calculus: implicit differentiation with harder MCQs",
    zhLabel: "AP 微积分：用更难的选择题练习隐函数求导",
  },
  {
    value: "Review missed integration questions and explain traps",
    zhLabel: "复习积分错题，并解释易错点",
  },
  {
    value: "Build a short mixed round on limits and continuity",
    zhLabel: "围绕极限与连续性创建一轮短的混合练习",
  },
  {
    value: "Practice FRQ-style derivative applications",
    zhLabel: "练习 FRQ 风格的导数应用题",
  },
];

export function PracticeSessionListLoading() {
  const { t } = useLocale();

  return (
    <div
      aria-busy="true"
      className="space-y-2 rounded-xl border border-slate-200/80 bg-white/70 p-3"
      role="status"
    >
      <LoadingIndicator label={t("practice.loadingRecentSessions")} />
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="flex items-center gap-3 py-1.5" key={index}>
          <PracticeLoadingBlock className="h-7 w-1 rounded-full" />
          <PracticeLoadingBlock className="h-4 flex-1 rounded" />
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
  const { t } = useLocale();

  if (frameworks.length) {
    return (
      <label className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">
        <span>{t("practice.framework")}</span>
        <select
          className="max-w-44 bg-transparent text-sm font-bold text-slate-900 outline-none"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">{t("practice.none")}</option>
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
      <LoadingIndicator label={t("practice.loadingOptions")} />
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
  const { locale } = useLocale();

  return (
    <div className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
      {starterGoals.map((goal) => (
        <button
          className="student-focus-ring rounded-full border border-slate-200 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-slate-600 shadow-sm transition-all duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 hover:shadow-md"
          disabled={disabled}
          key={goal.value}
          onClick={() => onSelect(goal.value)}
          type="button"
        >
          {locale === "zh-CN" ? goal.zhLabel : goal.value}
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
  const { formatNumber, t } = useLocale();

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-slate-950">
            <BookOpen className="size-4 text-sky-700" aria-hidden="true" />
            {t("practice.sources")}
          </div>
        </div>
        <Badge variant="outline">
          {t("practice.selected", {
            count: formatNumber((includePublicCatalog ? 1 : 0) + selectedBankIds.length),
          })}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <>
            <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2 lg:col-span-3">
              <LoadingIndicator label={t("practice.loadingSources")} />
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <PracticeLoadingBlock className="h-16 rounded-xl" key={index} />
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
                  {t("practice.sourceCounts", {
                    available: formatNumber(source.counts.unseen + source.counts.needsRetry),
                    mastered: formatNumber(source.counts.mastered),
                    retry: formatNumber(source.counts.needsRetry),
                    total: formatNumber(source.counts.questionCount),
                    unseen: formatNumber(source.counts.unseen),
                  })}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {locked ? (
        <p className="mt-3 text-xs font-medium text-slate-500">
          {t("practice.sourceLocked")}
        </p>
      ) : null}
    </div>
  );
}

export function PracticeRoundNavigator({
  completed,
  disabled,
  onSelectCompletion,
  onSelectRound,
  rounds,
  selectedRoundId,
}: {
  completed: boolean;
  disabled: boolean;
  onSelectCompletion: () => void;
  onSelectRound: (roundId: string) => void;
  rounds: PracticeRoundHistory[];
  selectedRoundId: string | null;
}) {
  const { formatNumber, t } = useLocale();

  if (!rounds.length) return null;

  return (
    <nav aria-label={t("practice.history")} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-slate-500">
          {t("practice.history")}
        </span>
        {rounds.map((round, index) => (
          <Button
            aria-current={selectedRoundId === round.id ? "page" : undefined}
            className="shrink-0"
            disabled={disabled}
            key={round.id}
            onClick={() => onSelectRound(round.id)}
            size="sm"
            type="button"
            variant={selectedRoundId === round.id ? "default" : "outline"}
          >
            {t("practice.round", { count: formatNumber(index + 1) })}
            {round.score.total > 0 ? ` · ${formatNumber(round.score.correct)}/${formatNumber(round.score.total)}` : ""}
          </Button>
        ))}
        {completed ? (
          <Button
            aria-current={selectedRoundId === null ? "page" : undefined}
            className="shrink-0"
            disabled={disabled}
            onClick={onSelectCompletion}
            size="sm"
            type="button"
            variant={selectedRoundId === null ? "default" : "outline"}
          >
            {t("practice.finalReport")}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
