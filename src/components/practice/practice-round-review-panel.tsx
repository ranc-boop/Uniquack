"use client";

import { FeedbackText } from "@/components/math-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PracticeReviewResponse } from "@/lib/practice/types";

export function PracticeRoundReviewPanel({
  isPending,
  isStreaming,
  nextRoundNote,
  onNextRoundNoteChange,
  onQuestionCountChange,
  onStartNextRound,
  questionCount,
  review,
}: {
  isPending: boolean;
  isStreaming: boolean;
  nextRoundNote: string;
  onNextRoundNoteChange: (value: string) => void;
  onQuestionCountChange: (value: number) => void;
  onStartNextRound: () => void;
  questionCount: number;
  review: PracticeReviewResponse;
}) {
  return (
    <Card className="student-panel">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Round review</CardTitle>
            {isStreaming ? (
              <p aria-live="polite" className="mt-2 flex items-center gap-2 text-sm text-slate-500" role="status">
                <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-sky-500" />
                Reviewing your answers…
              </p>
            ) : null}
            <FeedbackText className="mt-2 border-none bg-transparent p-0 text-slate-600" compact value={review.summary} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {review.roundPatterns?.length ? (
          <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Round patterns</p>
            <div className="mt-3 space-y-2">
              {review.roundPatterns.map((pattern, index) => (
                <FeedbackText
                  className="border-none bg-transparent p-0 text-sm leading-6 text-slate-700"
                  compact
                  key={`${pattern}-${index}`}
                  value={pattern}
                />
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Next round focus</p>
          <FeedbackText className="mt-2 border-none bg-transparent p-0 text-sm leading-6 text-slate-700" compact value={review.nextRoundGoal} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="next-round-goal">Add your thoughts for the next round</Label>
          <Input
            id="next-round-goal"
            onChange={(event) => onNextRoundNoteChange(event.target.value)}
            placeholder="Optional: ask for a focus, pace, or difficulty change"
            value={nextRoundNote}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Label className="text-sm font-bold text-slate-800" htmlFor="review-next-count">
              Questions
            </Label>
            <Input
              className="h-11 w-28 border-slate-200 bg-white text-base shadow-sm"
              id="review-next-count"
              max={8}
              min={1}
              onChange={(event) => onQuestionCountChange(Number(event.target.value))}
              type="number"
              value={questionCount}
            />
          </div>
          <Button className="h-11 px-6" disabled={isPending} onClick={onStartNextRound} type="button">
            Start next round
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
