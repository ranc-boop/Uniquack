"use client";

import { FeedbackText } from "@/components/math-content";
import { useLocale } from "@/components/i18n/locale-provider";
import { StudentPendingLink } from "@/components/student/student-pending-link";
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
  const { formatNumber, t } = useLocale();
  const inventory: Array<[string, number]> = completion
    ? [
        [t("practice.mastered"), completion.inventory.mastered],
        [t("practice.notAttempted"), completion.inventory.unseen],
        [t("practice.retryLater"), completion.inventory.deferred],
      ]
    : [];

  return (
    <Card className="student-panel student-enter">
      <CardHeader>
        <Badge className="w-fit" variant="outline">
          {isCompleted ? t("practice.complete") : t("practice.finishing")}
        </Badge>
        <CardTitle className="text-2xl">
          {isCompleted ? t("practice.learningReport") : t("practice.buildingReport")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FeedbackText
          className="border-none bg-transparent p-0 text-sm leading-7 text-slate-700"
          value={report || t("practice.reviewingEvidence")}
        />
        {completion ? (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            {inventory.map(([label, value]) => (
              <div className="rounded-xl bg-slate-50 p-3" key={label}>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </span>
                <span className="mt-1 block text-xl font-bold text-slate-950">{formatNumber(value)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {isCompleted ? (
          <div className="flex flex-wrap gap-2">
            {assignmentId ? (
              <Button asChild>
                <StudentPendingLink href={`/student/work/${assignmentId}`}>
                  {t("practice.reviewAssignment")}
                </StudentPendingLink>
              </Button>
            ) : (
              <Button onClick={onNewSession} type="button">
                {t("practice.moreLibraries")}
              </Button>
            )}
            <Button
              disabled={!retryAvailable}
              onClick={onRetryMistakes}
              type="button"
              variant="outline"
            >
              {assignmentId ? t("practice.retryAssignment") : t("practice.reviewMistakes")}
            </Button>
            <Button asChild type="button" variant="ghost">
              <StudentPendingLink href={assignmentId ? "/student/work" : "/student"}>
                {assignmentId ? t("practice.backToMyWork") : t("practice.backToStudentWorkspace")}
              </StudentPendingLink>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
