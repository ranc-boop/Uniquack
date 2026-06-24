"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LoaderCircle, Play, RefreshCw } from "lucide-react";

import { FeedbackText, QuestionText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  PracticeRecommendResponse,
  PracticeSessionDetail,
  PracticeSessionSummary,
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

function answerPreview(answer: string | string[]) {
  const value = Array.isArray(answer) ? answer.join(", ") : answer;
  return value.trim() || "No saved answer.";
}

export function MistakesPageClient() {
  const router = useRouter();
  const [wrongQuestions, setWrongQuestions] = useState<PracticeWrongQuestionView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadWrongQuestions() {
    const payload = await jsonRequest<{ wrongQuestions: PracticeWrongQuestionView[] }>(
      "/api/practice/wrong-questions",
    );
    setWrongQuestions(payload.wrongQuestions);
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        await loadWrongQuestions();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }, []);

  async function ensureSession() {
    const sessionsPayload = await jsonRequest<{
      activeSession: PracticeSessionDetail | null;
      sessions: PracticeSessionSummary[];
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
        window.sessionStorage.setItem("o2i:pendingPracticeRound", JSON.stringify(round));
        router.push("/practice");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setBusyId(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border bg-muted/20 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mistakes
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Active missed questions</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              These records use saved snapshots, so you can still review context even if a source question changes later.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/questions">Question Bank</Link>
            </Button>
            <Button disabled={isPending} onClick={loadWrongQuestions} variant="outline" type="button">
              <RefreshCw className="mr-2 size-4" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {wrongQuestions.length ? (
        <div className="grid gap-4">
          {wrongQuestions.map((question) => (
            <Card key={question.id} className="shadow-none">
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {question.questionCode}
                      </Badge>
                      <Badge variant="secondary">missed {question.missCount}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Last missed {new Date(question.lastMissedAt).toLocaleString()}
                      </span>
                    </div>
                    <CardTitle className="text-base leading-snug">{question.title}</CardTitle>
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
                    Practice again
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-3">
                  {question.contentHtml ? (
                    <QuestionText value={question.contentHtml} />
                  ) : (
                    <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                      The saved snapshot did not include a question stem.
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last answer</p>
                    <p className="mt-2 break-words text-sm">{answerPreview(question.lastAnswer)}</p>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last explanation</p>
                    {question.lastExplanation ? (
                      <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm text-muted-foreground" compact value={question.lastExplanation} />
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No saved explanation.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="shadow-none">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-base font-medium">No active missed questions</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Missed questions appear here after a practice review marks an answer incorrect.
            </p>
            <Button asChild>
              <Link href="/practice">Start practice</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
