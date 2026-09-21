"use client";

import { useEffect, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import {
  FeedbackText,
  OptionText,
  SolutionText,
} from "@/components/math-content";
import { useLocale } from "@/components/i18n/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasSubmittedPracticeAnswer } from "@/lib/practice/client-helpers";
import { PRACTICE_INPUT_LIMITS } from "@/lib/practice/request-validation";
import type {
  PracticeGradeResult,
  PracticeHintResponse,
  PracticeRecommendResponse,
  PracticeRecommendation,
  PracticeSessionDetail,
  PracticeSessionListItem,
} from "@/lib/practice/types";
import type { Json } from "@/types/database";

type ApiError = { error?: string };

type QuestionPracticePanelProps = {
  answerSpec: Json;
  question: PracticeRecommendation;
  solutionContent: string | null;
};

type AnswerState = string | string[];

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

function answerValue(answer: AnswerState | undefined) {
  return Array.isArray(answer) ? answer.join(", ") : answer ?? "";
}

function resultBadge(
  result: PracticeGradeResult | undefined,
  t: ReturnType<typeof useLocale>["t"],
) {
  if (!result) return null;
  if (result.isCorrect === true) {
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
        {t("practice.correct")}
      </Badge>
    );
  }
  if (result.isCorrect === false) {
    return <Badge variant="destructive">{t("practice.incorrect")}</Badge>;
  }
  return <Badge variant="outline">{t("practice.manualReview")}</Badge>;
}

function AnswerInput({
  disabled,
  inputId,
  onChange,
  question,
  t,
  value,
}: {
  disabled?: boolean;
  inputId: string;
  onChange: (value: AnswerState) => void;
  question: PracticeRecommendation;
  t: ReturnType<typeof useLocale>["t"];
  value: AnswerState | undefined;
}) {
  if (question.questionType === "mcq" && question.options.length) {
    return (
      <div className="space-y-2">
        {question.options.map((option) => {
          const selected = Array.isArray(value) ? value.includes(option.id) : value === option.id;

          return (
            <label
              className="grid cursor-pointer gap-3 rounded-md border bg-background p-3 transition-colors duration-200 hover:border-sky-300 sm:grid-cols-[1.5rem_1fr]"
              key={option.id}
            >
              <input
                checked={selected}
                disabled={disabled}
                id={`${inputId}-${option.id}`}
                name={inputId}
                onChange={() => onChange(option.id)}
                type="radio"
              />
              <div className="space-y-1">
                <span className="font-mono text-xs text-muted-foreground">{option.label}</span>
                <OptionText className="border-none bg-transparent p-0" value={option.content_html} />
              </div>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <Textarea
      disabled={disabled}
      id={inputId}
      maxLength={PRACTICE_INPUT_LIMITS.ANSWER_CHARS}
      onChange={(event) => onChange(event.target.value)}
      placeholder={
        question.questionType === "fill_blank"
          ? t("practice.finalAnswerPlaceholder")
          : t("practice.responsePlaceholder")
      }
      value={answerValue(value)}
    />
  );
}

export function QuestionPracticePanel({ question, solutionContent }: QuestionPracticePanelProps) {
  const { formatNumber, t } = useLocale();
  const [recommendation, setRecommendation] = useState<PracticeRecommendResponse | null>(null);
  const [answer, setAnswer] = useState<AnswerState>("");
  const [hints, setHints] = useState<string[]>([]);
  const [result, setResult] = useState<PracticeGradeResult | undefined>();
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canSubmit = hasSubmittedPracticeAnswer(answer);

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
        goal: `Practice ${question.questionCode}`,
        title: "Question practice",
      }),
      method: "POST",
    });

    return created.session;
  }

  async function createRound() {
    const session = await ensureSession();
    const created = await jsonRequest<PracticeRecommendResponse>("/api/practice/rounds/custom", {
      body: JSON.stringify({
        goal: `Practice selected question: ${question.questionCode}`,
        questionIds: [question.id],
        sessionId: session.id,
      }),
      method: "POST",
    });

    setRecommendation(created);
    return created;
  }

  async function ensureRound() {
    if (recommendation?.roundId && recommendation.sessionId) {
      return recommendation;
    }
    return createRound();
  }

  useEffect(() => {
    startTransition(async () => {
      try {
        await ensureRound();
      } catch {
        setError(t("common.requestFailed"));
      }
    });
    // Entering question practice mode should immediately attach the question to a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestHint() {
    setError(null);
    startTransition(async () => {
      try {
        const activeRound = await ensureRound();
        const response = await jsonRequest<PracticeHintResponse>("/api/practice/hint", {
          body: JSON.stringify({
            currentAnswer: answer,
            hintLevel: hints.length + 1,
            previousHints: hints,
            questionId: question.id,
            roundId: activeRound.roundId,
            sessionId: activeRound.sessionId,
          }),
          method: "POST",
        });
        setHints((current) => [...current, response.hint]);
      } catch {
        setError(t("common.requestFailed"));
      }
    });
  }

  function submitAnswer() {
    setError(null);
    startTransition(async () => {
      try {
        const activeRound = await ensureRound();
        const grade = await jsonRequest<{ results: PracticeGradeResult[] }>("/api/practice/grade", {
          body: JSON.stringify({
            attempts: [{ answer, questionId: question.id }],
            roundId: activeRound.roundId,
            sessionId: activeRound.sessionId,
          }),
          method: "POST",
        });
        const submittedResult = grade.results.find((item) => item.questionId === question.id);
        if (!submittedResult) throw new Error("The submitted answer could not be graded.");
        setResult(submittedResult);
        setShowAnswer(true);
      } catch {
        setError(t("common.requestFailed"));
      }
    });
  }

  function reset() {
    setAnswer("");
    setHints([]);
    setResult(undefined);
    setShowAnswer(false);
    setError(null);
    setRecommendation(null);
    startTransition(async () => {
      try {
        await createRound();
      } catch {
        setError(t("common.requestFailed"));
      }
    });
  }

  return (
    <Card className="border-sky-200 bg-sky-50/30 shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{t("practice.questionPracticeTitle")}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("practice.questionPracticeDescription")}
            </p>
          </div>
          {resultBadge(result, t)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!recommendation ? (
          <div className="flex items-center gap-2 rounded-md border bg-background p-4 text-sm text-muted-foreground">
            <span aria-hidden="true" className="loading-indicator-spinner size-4" />
            {t("practice.preparingQuestion")}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`detail-answer-${question.id}`}>
                {t("practice.yourAnswer")}
              </Label>
              <AnswerInput
                disabled={showAnswer}
                inputId={`detail-answer-${question.id}`}
                onChange={setAnswer}
                question={question}
                t={t}
                value={answer}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={isPending || showAnswer} onClick={requestHint} type="button" variant="outline">
                Hint
              </Button>
               <Button disabled={isPending || showAnswer || !canSubmit} onClick={submitAnswer} type="button">
                {isPending ? <span aria-hidden="true" className="loading-indicator-spinner mr-2 size-4" /> : null}
                {t("practice.submit")}
              </Button>
              {showAnswer ? (
                <Button onClick={reset} type="button" variant="outline">
                  <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                  {t("practice.tryAgain")}
                </Button>
              ) : null}
            </div>
          </div>
        )}

        {hints.length ? (
          <div className="space-y-2">
            {hints.map((hint, index) => (
              <div className="rounded-md border bg-background p-3 text-sm" key={`${question.id}-hint-${index}`}>
                <span className="font-medium">
                  {t("practice.hintNumber", { count: formatNumber(index + 1) })}:{" "}
                </span>
                <FeedbackText className="inline border-none bg-transparent p-0 text-muted-foreground" compact inline value={hint} />
              </div>
            ))}
          </div>
        ) : null}

        {showAnswer ? (
          <div className="space-y-4 rounded-md border bg-background p-4">
            <div>
              <p className="text-sm font-medium">
                {question.questionType === "mcq" ? t("practice.result") : t("practice.answer")}
              </p>
              <FeedbackText className="mt-2 border-none bg-transparent p-0 text-muted-foreground" compact value={result?.explanation ?? ""} />
            </div>
            {solutionContent ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("practice.solution")}</p>
                <SolutionText value={solutionContent} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("practice.solutionUnavailable")}
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
