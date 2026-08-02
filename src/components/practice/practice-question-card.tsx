"use client";

import { LoaderCircle } from "lucide-react";

import {
  FeedbackText,
  OptionText,
  QuestionText,
  SolutionText,
} from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { practiceAnswerKey } from "@/lib/practice/client-helpers";
import { PRACTICE_INPUT_LIMITS } from "@/lib/practice/request-validation";
import type {
  PracticeGradeResult,
  PracticeQuestionReview,
  PracticeRecommendation,
} from "@/lib/practice/types";

function answerValue(answer: string | string[] | undefined) {
  return Array.isArray(answer) ? answer.join(", ") : answer ?? "";
}

function resultBadge(result: PracticeGradeResult | undefined) {
  if (!result) return null;
  if (result.isCorrect === true) {
    return (
      <Badge
        className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600"
        data-result="correct"
        data-testid="practice-result-badge"
      >
        correct
      </Badge>
    );
  }
  if (result.isCorrect === false) {
    return (
      <Badge data-result="incorrect" data-testid="practice-result-badge" variant="destructive">
        incorrect
      </Badge>
    );
  }
  return (
    <Badge data-result="manual-review" data-testid="practice-result-badge" variant="outline">
      manual review
    </Badge>
  );
}

function reviewingBadge() {
  return (
    <Badge className="gap-1.5 border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50" variant="outline">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      Reviewing
    </Badge>
  );
}

function QuestionAnswerInput({
  answer,
  answerCommitted,
  clientReady,
  disabled,
  hasAnswerError,
  index,
  onChange,
  question,
}: {
  answer: string | string[] | undefined;
  answerCommitted: boolean;
  clientReady: boolean;
  disabled?: boolean;
  hasAnswerError: boolean;
  index: number;
  onChange: (value: string | string[]) => void;
  question: PracticeRecommendation;
}) {
  const answerKey = practiceAnswerKey(question);
  const answerControlId = `practice-question-${index + 1}-answer`;
  const answerErrorId = `practice-question-${index + 1}-answer-error`;
  const answerLabel = `Your answer for question ${index + 1}: ${question.title}`;
  const control = question.questionType === "mcq" && question.options.length ? (
    <fieldset
      aria-describedby={hasAnswerError ? answerErrorId : undefined}
      aria-invalid={hasAnswerError || undefined}
      className="space-y-2"
    >
      <legend className="mb-2 text-sm font-semibold text-slate-900">
        <span className="sr-only">{answerLabel}. </span>
        Choose one answer
      </legend>
      {question.options.map((option) => {
        const selected = Array.isArray(answer) ? answer.includes(option.id) : answer === option.id;
        return (
          <label
            className={`grid cursor-pointer gap-3 rounded-xl border px-4 py-3.5 transition-colors sm:grid-cols-[1.5rem_2rem_minmax(0,1fr)] ${
              selected
                ? "border-sky-500 bg-sky-50/70 shadow-sm"
                : "border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50"
            }`}
            key={option.id}
          >
            <input
              checked={selected}
              className="mt-1 size-5 accent-sky-600"
              disabled={disabled}
              id={`${answerControlId}-${option.id}`}
              name={`answer-${answerKey}`}
              onChange={() => onChange(option.id)}
              type="radio"
            />
            <span className={`mt-0.5 flex size-6 items-center justify-center rounded-full text-sm font-semibold ${selected ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600"}`}>
              {option.label}
            </span>
            <div className="min-w-0">
              <OptionText className="border-none bg-transparent p-0 text-[1.05rem] leading-7 text-slate-900 [&_p]:leading-7" value={option.content_html} />
            </div>
          </label>
        );
      })}
    </fieldset>
  ) : (
    <div className="space-y-2">
      <Label htmlFor={answerControlId}>Your answer</Label>
      <Textarea
        aria-describedby={hasAnswerError ? answerErrorId : undefined}
        aria-invalid={hasAnswerError || undefined}
        aria-label={answerLabel}
        className="min-h-32 text-base leading-7"
        disabled={disabled}
        id={answerControlId}
        maxLength={PRACTICE_INPUT_LIMITS.ANSWER_CHARS}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={question.questionType === "fill_blank" ? "Enter your final answer" : "Write your response"}
        value={answerValue(answer)}
      />
    </div>
  );

  return (
    <div
      data-answer-committed={answerCommitted ? "yes" : "no"}
      data-client-ready={clientReady ? "yes" : "no"}
      data-testid="practice-answer-control"
    >
      {control}
      {hasAnswerError ? (
        <p className="mt-2 text-sm font-semibold text-destructive" id={answerErrorId}>
          Answer required for question {index + 1}.
        </p>
      ) : null}
    </div>
  );
}

function QuestionReviewDiagnostic({ review }: { review?: PracticeQuestionReview }) {
  if (!review) return null;

  const rows = [
    ["Judgment", review.judgmentReason ?? review.observedError],
    ["Solution key points", review.solutionKeyPoints],
    ["Missing or extra", review.missingOrExtraParts],
    ["Answer form", review.answerFormIssue],
    ["Concept gap", review.conceptGap],
    ["Personal pattern", review.personalizationLink],
    ["Fix next", review.fixNext],
  ].filter((row): row is [string, string] => Boolean(row[1]?.trim()));

  if (!rows.length) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-sky-950">Review diagnosis</p>
        {review.verdict ? (
          <Badge className="border-sky-200 bg-white text-sky-900 hover:bg-white" variant="outline">
            {review.verdict}
          </Badge>
        ) : null}
      </div>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-md border border-sky-100 bg-white/70 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">{label}</p>
            <FeedbackText className="mt-1 border-none bg-transparent p-0 text-sm leading-6 text-slate-700" compact value={value} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PracticeQuestionCard({
  answerCommitted,
  clientReady,
  currentAnswer,
  hasAnswerError,
  hints,
  index,
  isPending,
  onAnswerChange,
  onHintRequest,
  phase,
  question,
  result,
  review,
}: {
  answerCommitted: boolean;
  clientReady: boolean;
  currentAnswer: string | string[] | undefined;
  hasAnswerError: boolean;
  hints: string[];
  index: number;
  isPending: boolean;
  onAnswerChange: (value: string | string[]) => void;
  onHintRequest: (question: PracticeRecommendation) => void;
  phase: "recommended" | "practicing" | "feedback";
  question: PracticeRecommendation;
  result?: PracticeGradeResult;
  review?: PracticeQuestionReview;
}) {
  const answerKey = practiceAnswerKey(question);
  const questionRegionId = `practice-question-${index + 1}`;
  const questionTitleId = `${questionRegionId}-title`;

  return (
    <Card
      aria-labelledby={questionTitleId}
      className={`student-card-hover border-slate-200 shadow-sm ${
        hasAnswerError ? "border-destructive/50 ring-1 ring-destructive/20" : ""
      }`}
      data-practice-question-index={index + 1}
      id={questionRegionId}
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <CardTitle
                aria-level={2}
                className="text-xl leading-snug"
                id={questionTitleId}
                role="heading"
              >
                {question.title}
              </CardTitle>
            </div>
          </div>
          {resultBadge(result) ?? (phase === "feedback" ? reviewingBadge() : null)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <QuestionText className="border-none bg-transparent p-0 text-lg leading-8 text-slate-950 [&_p]:leading-8" value={question.contentHtml} />
        <QuestionAnswerInput
          answer={currentAnswer}
          answerCommitted={answerCommitted}
          clientReady={clientReady}
          disabled={phase === "feedback"}
          hasAnswerError={hasAnswerError}
          index={index}
          onChange={onAnswerChange}
          question={question}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={isPending || phase === "feedback" || hints.length >= PRACTICE_INPUT_LIMITS.HINTS_PER_QUESTION} onClick={() => onHintRequest(question)} size="sm" type="button" variant="outline">
            Hint
          </Button>
        </div>
        {hints.length ? (
          <div className="space-y-2">
            {hints.map((hint, hintIndex) => (
              <div key={`${answerKey}-hint-${hintIndex}`} className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm">
                <span className="font-bold text-sky-900">Hint {hintIndex + 1}: </span>
                <FeedbackText className="inline border-none bg-transparent p-0 text-sky-900/80" compact inline value={hint} />
              </div>
            ))}
          </div>
        ) : null}
        <details className="border-t border-slate-100 pt-3 text-sm text-slate-500">
          <summary className="cursor-pointer font-medium text-slate-500 marker:text-slate-400 hover:text-slate-800">
            Why this question?
          </summary>
          <div className="mt-2 border-l-2 border-slate-200 pl-3">
            <FeedbackText className="border-none bg-transparent p-0 text-sm leading-6 text-slate-600" compact value={question.reason} />
            <FeedbackText className="mt-1 border-none bg-transparent p-0 text-xs text-slate-400" compact value={question.expectedSkill} />
          </div>
        </details>
        {phase === "feedback" && result ? (
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
            <FeedbackText className="border-none bg-transparent p-0 text-emerald-950" compact value={result.explanation} />
            <QuestionReviewDiagnostic review={review} />
            {result.solutionHtml ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-emerald-950">Solution</p>
                <SolutionText value={result.solutionHtml} />
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
