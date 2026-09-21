"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Play, RefreshCw } from "lucide-react";

import { FeedbackText, QuestionText } from "@/components/math-content";
import { useLocale } from "@/components/i18n/locale-provider";
import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENT_PRACTICE_PENDING_ROUND_STORAGE_KEY } from "@/lib/practice/schema";
import type {
  PracticeRecommendResponse,
  PracticeSessionDetail,
  PracticeSessionListItem,
  PracticeWrongQuestionView,
} from "@/lib/practice/types";

type ApiError = { error?: string };

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

function answerPreview(answer: string | string[], emptyLabel: string) {
  const value = Array.isArray(answer) ? answer.join(", ") : answer;
  return value.trim() || emptyLabel;
}

export function MistakesPageClient() {
  const { formatDateTime, formatNumber, t } = useLocale();
  const router = useRouter();
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function loadWrongQuestions() {
    setRefreshing(true);
    setError(null);
    try {
      const payload = await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
        "/api/practice/wrong-questions",
      );
      setWrongQuestions(payload.wrongQuestions);
    } catch {
      setError(t("common.requestFailed"));
    } finally {
      setListLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        const payload = await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
          "/api/practice/wrong-questions",
        );
        setWrongQuestions(payload.wrongQuestions);
      } catch {
        setError(t("common.requestFailed"));
      } finally {
        setListLoading(false);
      }
    });
  }, [t]);

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
        goal: "Re-practice missed questions",
        title: "Mistake review",
      }),
      method: "POST",
    });

    return created.session;
  }

  function practiceMistake(question: PracticeWrongQuestionView) {
    setBusyId(question.id);
    setError(null);

    startTransition(async () => {
      try {
        const session = await ensureSession();
        const round = await jsonRequest<PracticeRecommendResponse>("/api/practice/rounds/custom", {
          body: JSON.stringify({
            goal: `Re-practice missed question ${question.questionCode}: ${question.title}`,
            questionIds: [question.sourceQuestionId],
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
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="student-hero">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">
              {t("mistakes.eyebrow")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">{t("mistakes.title")}</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {t("mistakes.description")}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <StudentPendingLink href="/questions">{t("mistakes.questionBank")}</StudentPendingLink>
            </Button>
            <Button
              disabled={isPending || refreshing}
              onClick={() => void loadWrongQuestions()}
              variant="outline"
              type="button"
            >
              {refreshing ? (
                <LoaderCircle className="mr-2 size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              )}
              {t("mistakes.refresh")}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {listLoading ? (
        <div aria-busy="true" className="grid gap-4" role="status">
          <span className="sr-only">{t("mistakes.loading")}</span>
          {Array.from({ length: 3 }).map((_, index) => (
            <Card className="student-panel" key={index}>
              <CardHeader className="space-y-3">
                <div className="h-5 w-2/5 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-7 w-3/5 rounded bg-slate-100 motion-safe:animate-pulse" />
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="h-28 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-28 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : wrongQuestions.length ? (
        <div className="grid gap-4">
          {wrongQuestions.map((question) => (
            <Card key={question.id} className="student-panel student-card-hover">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {question.questionCode}
                      </Badge>
                      <Badge variant="secondary">{t("mistakes.missedCount", { count: formatNumber(question.missCount) })}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {t("mistakes.lastMissed", { date: formatDateTime(question.lastMissedAt) })}
                      </span>
                    </div>
                    <CardTitle className="text-xl leading-snug text-slate-950">{question.title}</CardTitle>
                  </div>
                  <Button
                    className="w-full lg:w-auto"
                    disabled={isPending}
                    onClick={() => practiceMistake(question)}
                    type="button"
                  >
                    {busyId === question.id ? (
                      <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="mr-2 size-4" aria-hidden="true" />
                    )}
                    {t("mistakes.practiceAgain")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-3">
                  {question.contentHtml ? (
                    <QuestionText value={question.contentHtml} />
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-4 text-sm text-slate-600">
                      {t("mistakes.snapshotMissing")}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                    <p className="student-eyebrow">{t("mistakes.lastAnswer")}</p>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-800">{answerPreview(question.lastAnswer, t("mistakes.noSavedAnswer"))}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">{t("mistakes.lastExplanation")}</p>
                    {question.lastExplanation ? (
                      <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm text-amber-950" compact value={question.lastExplanation} />
                    ) : (
                      <p className="mt-2 text-sm text-amber-900">{t("mistakes.noSavedExplanation")}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="student-panel">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-xl font-bold text-slate-950">{t("mistakes.emptyTitle")}</p>
            <p className="max-w-md text-sm leading-6 text-slate-600">
              {t("mistakes.emptyDescription")}
            </p>
            <Button asChild>
              <StudentPendingLink href="/practice">{t("home.startPractice")}</StudentPendingLink>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
