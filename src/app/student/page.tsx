import { Suspense } from "react";

import { StudentDashboardLoadingContent } from "@/components/student/student-loading-skeletons";
import { StudentPendingLink } from "@/components/student/student-pending-link";
import { StudentModuleCard, StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { formatNumber, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { listStudentAssignedWork } from "@/lib/student-work";

export const dynamic = "force-dynamic";

function countDueSoon(value: string | null | undefined) {
  if (!value) return false;
  const due = new Date(value).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due - today.getTime()) / 86_400_000);
  return days <= 7;
}

async function StudentDashboardOverview({ locale }: { locale: Locale }) {
  const profile = await requireStudentWorkspace();
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });
  const dueSoon = assignments.filter(
    (assignment) =>
      assignment.progressStatus !== "completed" && countDueSoon(assignment.due_at),
  ).length;
  const inProgress = assignments.filter(
    (assignment) => assignment.progressStatus === "in_progress",
  ).length;
  const completed = assignments.filter(
    (assignment) => assignment.progressStatus === "completed",
  ).length;
  const metrics: Array<[string, number]> = [
    [translate(locale, "student.assignedWork"), assignments.length],
    [translate(locale, "student.dueSoon"), dueSoon],
    [translate(locale, "student.inProgress"), inProgress],
    [translate(locale, "student.completed"), completed],
  ];

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        {metrics.map(([label, count]) => (
          <div className="student-panel p-4" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(locale, count)}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StudentModuleCard
          actionLabel={translate(locale, "student.viewAssignments")}
          eyebrow={translate(locale, "student.assigned")}
          href="/student/work"
          status={assignments.length ? translate(locale, "student.active", { count: formatNumber(locale, assignments.length) }) : translate(locale, "student.empty")}
          title={translate(locale, "student.myWork")}
        />
        <StudentModuleCard
          actionLabel={translate(locale, "student.startRound")}
          eyebrow={translate(locale, "student.practice")}
          href="/practice"
          title={translate(locale, "student.practice")}
        />
        <StudentModuleCard
          actionLabel={translate(locale, "student.reviewMisses")}
          eyebrow={translate(locale, "student.recovery")}
          href="/mistakes"
          title={translate(locale, "student.mistakes")}
        />
        <StudentModuleCard
          actionLabel={translate(locale, "student.seeProgress")}
          eyebrow={translate(locale, "student.evidence")}
          href="/student/progress"
          title={translate(locale, "student.progressFeedback")}
        />
      </section>
    </>
  );
}

export default async function StudentHomePage() {
  const locale = await getRequestLocale();

  return (
    <StudentWorkspaceShell
      title={translate(locale, "student.dashboard")}
      actions={
        <>
          <Button asChild>
            <StudentPendingLink href="/student/work">{translate(locale, "student.openMyWork")}</StudentPendingLink>
          </Button>
          <Button asChild variant="outline">
            <StudentPendingLink href="/practice">{translate(locale, "student.startPractice")}</StudentPendingLink>
          </Button>
        </>
      }
    >
      <Suspense fallback={<StudentDashboardLoadingContent />}>
        <StudentDashboardOverview locale={locale} />
      </Suspense>

      <section className="grid gap-4">
        <StudentModuleCard
          actionLabel={translate(locale, "student.browsePublicQuestions")}
          eyebrow={translate(locale, "student.discovery")}
          href="/student/public-library"
          title={translate(locale, "student.publicLibrary")}
        />
      </section>

    </StudentWorkspaceShell>
  );
}
