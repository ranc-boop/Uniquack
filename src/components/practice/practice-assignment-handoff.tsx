"use client";

import { StudentPendingLink } from "@/components/student/student-pending-link";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";

export function focusStudyDetails(element: HTMLElement | null) {
  element?.scrollIntoView({ behavior: "smooth", block: "start" });
  element?.focus({ preventScroll: true });
}

export function PracticeAssignmentHandoff({
  assignmentId,
  visible,
}: {
  assignmentId?: string | null;
  visible: boolean;
}) {
  const { t } = useLocale();

  if (!assignmentId || !visible) return null;

  return (
    <section
      aria-labelledby="assignment-round-next-step-heading"
      className="student-panel p-5"
    >
      <p className="student-eyebrow">{t("practice.assignmentRoundSaved")}</p>
      <h2
        className="mt-2 text-lg font-bold text-slate-950"
        id="assignment-round-next-step-heading"
      >
        {t("practice.chooseNextStep")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {t("practice.assignmentHandoffDescription")}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild className="min-h-11">
          <StudentPendingLink href={`/student/work/${assignmentId}`}>
            {t("practice.reviewAssignment")}
          </StudentPendingLink>
        </Button>
        <Button asChild className="min-h-11" variant="outline">
          <StudentPendingLink href="/student/work">{t("practice.backToMyWork")}</StudentPendingLink>
        </Button>
      </div>
    </section>
  );
}
