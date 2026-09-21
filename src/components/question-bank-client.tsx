"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BookOpen, Check, ClipboardList, LoaderCircle, Play, Plus, X } from "lucide-react";

import { FeedbackText } from "@/components/math-content";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  TaxonomyTagChips,
  type TaxonomyTagChipAssignment,
} from "@/components/tags/taxonomy-tag-chips";
import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  PracticeRecommendResponse,
  PracticeSessionDetail,
  PracticeSessionListItem,
} from "@/lib/practice/types";
import { CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY } from "@/lib/practice/schema";

type QuestionBankRow = {
  content_excerpt: string;
  difficulty_rating: number;
  id: string;
  question_code: string;
  status: string;
  title: string;
};

type ApiError = { error?: string };

type QuestionBankClientProps = {
  questions: QuestionBankRow[];
  taxonomyCatalog: TaxonomyCatalogView;
  taxonomyTagsByQuestionId: Record<string, TaxonomyTagChipAssignment[]>;
  totalCount: number;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function difficultyTone(value: number) {
  if (value >= 400) return "border-red-200 bg-red-50 text-red-800";
  if (value >= 250) return "border-orange-200 bg-orange-50 text-orange-800";
  if (value >= 100) return "border-sky-200 bg-sky-50 text-sky-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export function QuestionBankClient({
  questions,
  taxonomyCatalog,
  taxonomyTagsByQuestionId,
  totalCount,
}: QuestionBankClientProps) {
  const { formatNumber, t } = useLocale();
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedIds.includes(question.id)),
    [questions, selectedIds],
  );

  function toggleQuestion(questionId: string) {
    setSelectedIds((current) =>
      current.includes(questionId)
        ? current.filter((item) => item !== questionId)
        : [...current, questionId],
    );
  }

  async function ensureSession() {
    const sessionsPayload = await jsonRequest<{
      activeSession: PracticeSessionDetail | null;
      sessions: PracticeSessionListItem[];
    }>("/api/practice/sessions");

    if (sessionsPayload.activeSession) {
      return sessionsPayload.activeSession;
    }

    const created = await jsonRequest<{ session: PracticeSessionDetail }>("/api/practice/sessions", {
      body: JSON.stringify({
        goal: "Selected question practice",
        title: "Question practice",
      }),
      method: "POST",
    });

    return created.session;
  }

  function startPractice(questionIds: string[], label: string) {
    if (!questionIds.length) return;
    setError(null);
    setBusyLabel(label);

    startTransition(async () => {
      try {
        const session = await ensureSession();
        const round = await jsonRequest<PracticeRecommendResponse>("/api/practice/rounds/custom", {
          body: JSON.stringify({
            goal:
              questionIds.length === 1
                ? `Practice selected question: ${label}`
                : `Practice ${questionIds.length} selected questions from the question bank`,
            questionIds,
            sessionId: session.id,
          }),
          method: "POST",
        });
        window.sessionStorage.setItem(
          CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY,
          JSON.stringify(round),
        );
        router.push("/practice");
      } catch {
        setError(t("common.requestFailed"));
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card className="student-soft-panel sticky top-20 z-20">
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg border border-sky-100 bg-white shadow-sm">
              <ClipboardList className="size-5 text-sky-700" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-base font-bold text-slate-950">{t("library.basket")}</p>
              <p className="text-sm leading-6 text-slate-600">
                {selectedIds.length
                  ? t("library.basketSelected", { count: formatNumber(selectedIds.length) })
                  : t("library.basketEmpty", { count: formatNumber(totalCount) })}
              </p>
              {selectedQuestions.length ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedQuestions.slice(0, 4).map((question) => (
                    <Badge key={question.id} className="max-w-[14rem] truncate" variant="outline">
                      {question.question_code}
                    </Badge>
                  ))}
                  {selectedQuestions.length > 4 ? (
                    <Badge variant="secondary">+{selectedQuestions.length - 4}</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="w-full sm:w-auto"
              disabled={isPending || !selectedIds.length}
              onClick={() => startPractice(selectedIds, "selected basket")}
              type="button"
            >
              {isPending && busyLabel === "selected basket" ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="mr-2 size-4" aria-hidden="true" />
              )}
              {t("library.practiceBasket")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={isPending || !selectedIds.length}
              onClick={() => setSelectedIds([])}
              type="button"
              variant="outline"
            >
              <X className="mr-2 size-4" aria-hidden="true" />
              {t("library.clear")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3">
        {questions.map((question) => {
          const isSelected = selectedIds.includes(question.id);

          return (
            <Card
              key={question.id}
              className={`student-panel student-card-hover ${
                isSelected ? "border-sky-300 bg-sky-50/40" : ""
              }`}
            >
              <CardContent className="grid gap-4 p-4 md:grid-cols-[2rem_minmax(0,1fr)_auto] md:items-start">
                <div className="flex items-center md:block">
                  <Checkbox
                    aria-label={t("library.selectQuestion", { code: question.question_code })}
                    checked={isSelected}
                    onCheckedChange={() => toggleQuestion(question.id)}
                  />
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {question.question_code}
                    </Badge>
                    <Badge className={difficultyTone(question.difficulty_rating)} variant="outline">
                      {t("library.difficulty", { value: formatNumber(question.difficulty_rating) })}
                    </Badge>
                    {isSelected ? (
                      <Badge className="border-sky-200 bg-sky-50 text-sky-800" variant="outline">
                        <Check className="mr-1 size-3" aria-hidden="true" />
                        {t("library.inBasket")}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold leading-snug text-slate-950">
                      <Link className="hover:underline underline-offset-4" href={`/questions/${question.id}`}>
                        {question.title}
                      </Link>
                    </h2>
                    <FeedbackText
                      className="line-clamp-2 border-none bg-transparent p-0 text-sm leading-relaxed text-muted-foreground"
                      compact
                      value={question.content_excerpt}
                    />
                  </div>
                  <TaxonomyTagChips
                    assignments={taxonomyTagsByQuestionId[question.id]}
                    emptyLabel={t("library.noApprovedTags")}
                    maxVisibleTags={4}
                    taxonomyCatalog={taxonomyCatalog}
                  />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                  <Button asChild className="w-full md:w-32" size="sm" variant="outline">
                    <Link href={`/questions/${question.id}`}>
                      <BookOpen className="mr-2 size-4" aria-hidden="true" />
                      {t("common.open")}
                    </Link>
                  </Button>
                  <Button
                    className="w-full md:w-32"
                    disabled={isPending}
                    onClick={() => startPractice([question.id], question.question_code)}
                    size="sm"
                    type="button"
                  >
                    {isPending && busyLabel === question.question_code ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="mr-2 size-4" aria-hidden="true" />
                    )}
                    {t("student.practice")}
                  </Button>
                  <Button
                    className="w-full md:w-32"
                    onClick={() => toggleQuestion(question.id)}
                    size="sm"
                    type="button"
                    variant={isSelected ? "secondary" : "outline"}
                  >
                    <Plus className="mr-2 size-4" aria-hidden="true" />
                    {isSelected ? t("library.added") : t("library.add")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
