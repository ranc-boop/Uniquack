"use client";

import Link from "next/link";

import { FeedbackText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PracticeCompletion } from "@/lib/practice/types";

export function PracticeCompletionPanel({
  assignmentId,
  completion,
  isCompleted,
  onNewSession,
  onRetryMistakes,
  report,
  retryAvailable,
}: {
  assignmentId?: string | null;
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
            {assignmentId ? (
              <Button asChild>
                <Link href={`/student/work/${assignmentId}`}>
                  Review this Assignment
                </Link>
              </Button>
            ) : (
              <Button onClick={onNewSession} type="button">
                Start with more Libraries
              </Button>
            )}
            <Button
              disabled={!retryAvailable}
              onClick={onRetryMistakes}
              type="button"
              variant="outline"
            >
              {assignmentId ? "Retry this Assignment" : "Review remaining mistakes"}
            </Button>
            <Button asChild type="button" variant="ghost">
              <Link href={assignmentId ? "/student/work" : "/student"}>
                {assignmentId ? "Back to My Work" : "Back to student workspace"}
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
