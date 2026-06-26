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
import { Textarea } from "@/components/ui/textarea";
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
    return <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">correct</Badge>;
  }
  if (result.isCorrect === false) {
    return <Badge variant="destructive">incorrect</Badge>;
  }
  return <Badge variant="outline">manual review</Badge>;
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
  disabled,
  onChange,
  question,
}: {
  answer: string | string[] | undefined;
  disabled?: boolean;
  onChange: (value: string | string[]) => void;
  question: PracticeRecommendation;
}) {
  if (question.questionType === "mcq" && question.options.length) {
    return (
      <div className="space-y-2">
        {question.options.map((option) => {
          const selected = Array.isArray(answer) ? answer.includes(option.id) : answer === option.id;
          return (
            <label key={option.id} className="grid cursor-pointer gap-3 rounded-md border bg-background p-3 sm:grid-cols-[1.5rem_1fr]">
              <input
                checked={selected}
                disabled={disabled}
                name={`answer-${question.id}`}
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
      onChange={(event) => onChange(event.target.value)}
      placeholder={question.questionType === "fill_blank" ? "Enter your final answer" : "Write your response"}
      value={answerValue(answer)}
    />
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
  currentAnswer,
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
  currentAnswer: string | string[] | undefined;
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
  return (
    <Card className="student-card-hover border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-sm font-bold text-white">
              {index + 1}
            </span>
            <div className="min-w-0">
              <CardTitle className="text-xl leading-snug">{question.title}</CardTitle>
              <p className="mt-2 text-sm font-medium text-slate-500">
                {question.questionCode} / {question.questionType} / difficulty {question.difficulty}
              </p>
            </div>
          </div>
          {resultBadge(result) ?? (phase === "feedback" ? reviewingBadge() : null)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <QuestionText value={question.contentHtml} />
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm">
          <p className="font-bold text-amber-950">Why this question</p>
          <FeedbackText className="mt-2 border-none bg-transparent p-0 text-amber-900" compact value={question.reason} />
          <p className="mt-2 text-sm text-amber-900/80">
            Expected skill:{" "}
            <FeedbackText className="inline border-none bg-transparent p-0 text-sm text-amber-900/80" compact inline value={question.expectedSkill} />
          </p>
        </div>
        <QuestionAnswerInput
          answer={currentAnswer}
          disabled={phase === "feedback"}
          onChange={onAnswerChange}
          question={question}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={isPending || phase === "feedback"} onClick={() => onHintRequest(question)} size="sm" type="button" variant="outline">
            Hint
          </Button>
          <span className="text-sm text-slate-500">Hints are saved with the submitted round.</span>
        </div>
        {hints.length ? (
          <div className="space-y-2">
            {hints.map((hint, hintIndex) => (
              <div key={`${question.id}-hint-${hintIndex}`} className="rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm">
                <span className="font-bold text-sky-900">Hint {hintIndex + 1}: </span>
                <FeedbackText className="inline border-none bg-transparent p-0 text-sky-900/80" compact inline value={hint} />
              </div>
            ))}
          </div>
        ) : null}
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
