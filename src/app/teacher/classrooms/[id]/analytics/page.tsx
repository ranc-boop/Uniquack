import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ClipboardCheck, MessageSquareText, Target } from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomAnalyticsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomAnalyticsPage({
  params,
}: ClassroomAnalyticsPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const { id } = await params;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { assignments, classroom } = workspace;
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const linkedPracticeSessions = assignments.reduce(
    (sum, assignment) => sum + assignment.progressSummary.linkedPracticeSessionCount,
    0,
  );
  const latestActivity =
    assignments
      .map((assignment) => assignment.progressSummary.latestPracticeSessionAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? classroom.latestActivityAt;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("classroomAnalytics.title")}</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {t("classroomAnalytics.description")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/teacher/progress">{t("classroomAnalytics.allProgress")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}`}>
                {t("classroomAnalytics.backToOverview")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description={t("classroomAnalytics.assignedDescription")}
          icon={ClipboardCheck}
          label={t("classroom.assignmentStatusAssigned")}
          value={formatNumber(locale, assigned.length)}
        />
        <ClassroomMetricCard
          description={t("classroomAnalytics.practiceLinksDescription")}
          icon={BarChart3}
          label={t("classroomAnalytics.practiceLinks")}
          value={formatNumber(locale, linkedPracticeSessions)}
        />
        <ClassroomMetricCard
          description={t("classroomAnalytics.latestActivityDescription")}
          icon={Target}
          label={t("classroomAnalytics.latestActivity")}
          value={latestActivity
            ? formatLocaleDateTime(locale, latestActivity, { dateStyle: "medium", timeStyle: "short" })
            : t("classroom.noActivityYet")}
        />
        <ClassroomMetricCard
          description={t("classroomAnalytics.studentsDescription")}
          icon={MessageSquareText}
          label={t("classroom.students")}
          value={formatNumber(locale, classroom.studentCount)}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <ClassroomProgressRing
          helper={
            classroom.completionRate === null
              ? t("classroom.completionAppearsAfterPractice")
              : t("classroom.assignedWorkCompleted")
          }
          label={t("classroomAnalytics.classCompletionRate")}
          value={classroom.completionRate}
        />

        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              {t("classroomAnalytics.assignmentCompletionSummaries")}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {t("classroomAnalytics.summaryDescription")}
            </p>
          </div>
          {assigned.length ? (
            <div className="divide-y divide-slate-100">
              {assigned.map((assignment) => (
                <Link
                  className="block p-5 transition hover:bg-sky-50/40"
                  href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                  key={assignment.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-bold text-slate-950">
                          {assignment.title}
                        </h3>
                        <ClassroomBadge tone="blue">
                          {t("classroom.assignmentStatusAssigned")}
                        </ClassroomBadge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {t("classroomAnalytics.assignmentEvidenceSummary", {
                          items: formatNumber(locale, assignment.itemCount),
                          sessions: formatNumber(
                            locale,
                            assignment.progressSummary.linkedPracticeSessionCount,
                          ),
                        })}
                      </p>
                    </div>
                    <div className="grid min-w-full grid-cols-3 gap-2 text-center lg:min-w-72">
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="block text-base font-bold text-slate-950">
                          {formatNumber(locale, assignment.progressSummary.notStartedCount)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t("classroomAnalytics.notStarted")}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="block text-base font-bold text-slate-950">
                          {formatNumber(locale, assignment.progressSummary.inProgressCount)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t("classroomAnalytics.active")}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="block text-base font-bold text-slate-950">
                          {formatNumber(locale, assignment.progressSummary.completedCount)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {t("classroomAnalytics.done")}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="teacher-eyebrow">{t("classroomAnalytics.noAnalyticsYet")}</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                {t("classroomAnalytics.noAnalyticsTitle")}
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("classroomAnalytics.noAnalyticsDescription")}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
