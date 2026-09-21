import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Users,
} from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomPublishCta,
  ClassroomQuickAction,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherClassroomDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    newCode?: string;
    saved?: string;
  }>;
};

function statusLabel(locale: Parameters<typeof translate>[0], status: string) {
  if (status === "active") return translate(locale, "classroom.statusActive");
  if (status === "archived") return translate(locale, "classroom.statusArchived");
  return translate(locale, "classroom.statusUnknown");
}

function assignmentLabel(locale: Parameters<typeof translate>[0], status: string) {
  if (status === "assigned") return translate(locale, "classroom.assignmentStatusAssigned");
  if (status === "draft") return translate(locale, "classroom.assignmentStatusDraft");
  if (status === "archived") return translate(locale, "classroom.assignmentStatusArchived");
  return translate(locale, "classroom.assignmentStatusUnknown");
}

function sourceLabel(locale: Parameters<typeof translate>[0], kind: string) {
  if (kind === "question_bank") return translate(locale, "assignmentDetail.library");
  if (kind === "course_builder_run") return translate(locale, "assignmentDetail.courseBuilderRun");
  if (kind === "practice_framework") return translate(locale, "assignmentDetail.practiceFramework");
  return translate(locale, "assignmentDetail.manual");
}

function formatDateForLocale(
  locale: Parameters<typeof translate>[0],
  value: string | null | undefined,
  fallback: string,
) {
  return value ? formatLocaleDate(locale, value, { dateStyle: "medium" }) : fallback;
}

function formatDateTimeForLocale(
  locale: Parameters<typeof translate>[0],
  value: string | null | undefined,
  fallback: string,
) {
  return value
    ? formatLocaleDateTime(locale, value, { dateStyle: "medium", timeStyle: "short" })
    : fallback;
}

export default async function TeacherClassroomDetailPage({
  params,
  searchParams,
}: TeacherClassroomDetailPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { assignments, classroom, roster } = workspace;
  const visibleJoinCode = query.newCode || classroom.joinCodeVisible;
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const draft = assignments.filter((assignment) => assignment.status === "draft");
  const recentAssignments = assignments.slice(0, 4);
  const attentionAssignments = assigned.filter(
    (assignment) =>
      assignment.progressSummary.studentCount > 0 &&
      assignment.progressSummary.completedCount <
        assignment.progressSummary.studentCount,
  );
  const activeStudents = roster.filter(
    (member) => member.role === "student" && member.status === "active",
  );
  const owner = roster.find((member) => member.user_id === classroom.owner_id);
  const activeCoTeachers = roster.filter(
    (member) => member.role === "co_teacher" && member.status === "active",
  );
  const studentsNeedingAttention = activeStudents.filter(
    (student) => student.assignmentSummary.needsAttention,
  );

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero overflow-hidden p-0">
        <div className="bg-gradient-to-br from-sky-100 via-white to-blue-50 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-4xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="teacher-eyebrow">{t("classroomOverview.workspace")}</p>
                <ClassroomBadge tone="sky">
                  {statusLabel(locale, classroom.status)}
                </ClassroomBadge>
                {classroom.subject ? (
                  <ClassroomBadge>{classroom.subject}</ClassroomBadge>
                ) : null}
              </div>
              <div className="space-y-2">
                <h1 className="break-words text-3xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">
                  {classroom.name}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-600">
                  {classroom.description || t("classroomOverview.descriptionFallback")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {classroom.status === "active" ? (
                <ClassroomPublishCta classroomId={classroom.id} />
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                    {t("classroomOverview.reopenInSettings")}
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/teacher/classrooms">{t("classroomOverview.backToClasses")}</Link>
              </Button>
            </div>
          </div>

        </div>

        <div className="grid gap-3 border-t border-slate-200 bg-white/80 p-5 md:grid-cols-4">
          <ClassroomMetricCard
            description={t("classroomOverview.studentsMetricDescription")}
            icon={Users}
            label={t("classroomOverview.students")}
            value={formatNumber(locale, classroom.studentCount)}
          />
          <ClassroomMetricCard
            description={t("classroomOverview.activeAssignmentsMetricDescription")}
            icon={ClipboardCheck}
            label={t("classroom.activeAssignments")}
            value={formatNumber(locale, classroom.activeAssignmentCount)}
          />
          <ClassroomMetricCard
            description={t("classroomOverview.coTeachersMetricDescription")}
            icon={Users}
            label={t("classroomTeachers.coTeacher")}
            value={formatNumber(locale, classroom.coTeacherCount)}
          />
          <ClassroomMetricCard
            description={t("classroomOverview.recentActivityMetricDescription")}
            icon={Activity}
            label={t("classroomSettings.recentActivity")}
            value={formatDateTimeForLocale(locale, classroom.latestActivityAt, t("classroom.noActivityYet"))}
          />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      {query.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {t("classroomOverview.actionSaved")}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {t("classroomOverview.actionFailed")}
        </p>
      ) : null}

      {visibleJoinCode && classroom.status === "active" ? (
        <section className="teacher-soft-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="teacher-eyebrow">{t("classroomOverview.activeJoinCode")}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {t("classroomOverview.joinCodeShareTitle")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t("classroomOverview.joinCodeRosterDescription")}
              </p>
            </div>
            <code className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-2xl font-bold tracking-[0.16em] text-slate-950">
              {visibleJoinCode}
            </code>
          </div>
        </section>
      ) : (
        <section className="teacher-soft-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="teacher-eyebrow">{t("classroomOverview.joinCodeStatus")}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {classroom.status === "archived"
                  ? t("classroomOverview.joiningBlockedArchived")
                  : t("classroomOverview.noActiveJoinCode")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t("classroomSettings.joinCodeLifecycleDescription")}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                {t("classroomOverview.manageJoining")}
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-white/70 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="teacher-eyebrow">{t("classroomOverview.overview")}</p>
                  <h2 className="text-xl font-bold text-slate-950">
                    {t("classroomOverview.deliverySnapshot")}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    {t("classroomOverview.deliverySnapshotDescription")}
                  </p>
                </div>
                <ClassroomQuickAction
                  href={`/teacher/classrooms/${classroom.id}/assignments`}
                  icon={ClipboardCheck}
                >
                  {t("classroomOverview.viewAssignments")}
                </ClassroomQuickAction>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[20rem_1fr]">
              <ClassroomProgressRing
                helper={
                  classroom.completionRate === null
                    ? t("classroom.completionAppearsAfterPractice")
                    : t("classroom.assignedWorkCompleted")
                }
                label={t("classroomAnalytics.classCompletionRate")}
                value={classroom.completionRate}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [t("classroomOverview.students"), formatNumber(locale, classroom.studentCount)],
                  [t("classroomTeachers.coTeacher"), formatNumber(locale, activeCoTeachers.length)],
                  [t("classroom.assignmentStatusAssigned"), formatNumber(locale, assigned.length)],
                  [t("classroom.drafts"), formatNumber(locale, draft.length)],
                  [t("classroomOverview.studentsNeedingAttention"), formatNumber(locale, studentsNeedingAttention.length)],
                ].map(([label, value]) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                    key={label}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-white/70 p-5">
              <h2 className="text-xl font-bold text-slate-950">
                {t("classroomOverview.recentAssignments")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {t("classroomOverview.recentAssignmentsDescription")}
              </p>
            </div>
            {recentAssignments.length ? (
              <div className="divide-y divide-slate-100">
                {recentAssignments.map((assignment) => (
                  <Link
                    className="block p-5 transition hover:bg-sky-50/40"
                    href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ClassroomBadge
                            tone={assignment.status === "assigned" ? "blue" : "slate"}
                          >
                            {assignmentLabel(locale, assignment.status)}
                          </ClassroomBadge>
                          <ClassroomBadge>{sourceLabel(locale, assignment.source_kind)}</ClassroomBadge>
                        </div>
                        <h3 className="break-words text-lg font-bold text-slate-950">
                          {assignment.title}
                        </h3>
                        <p className="text-sm leading-6 text-slate-600">
                          {t("classroomOverview.dueItems", {
                            date: formatDateForLocale(
                              locale,
                              assignment.due_at,
                              t("classroom.notSet"),
                            ),
                            count: formatNumber(locale, assignment.itemCount),
                          })}
                        </p>
                      </div>
                      <div className="grid min-w-full grid-cols-3 gap-2 text-center lg:min-w-72">
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {formatNumber(locale, assignment.progressSummary.notStartedCount)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {t("classroomOverview.notStarted")}
                          </span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {formatNumber(locale, assignment.progressSummary.inProgressCount)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {t("classroomOverview.active")}
                          </span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {formatNumber(locale, assignment.progressSummary.completedCount)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {t("classroomOverview.done")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="teacher-eyebrow">{t("classroomOverview.noAssignmentHistory")}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  {t("classroomOverview.noAssignmentHistoryTitle")}
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {t("classroomOverview.noAssignmentHistoryDescription")}
                </p>
                <div className="mt-5">
                  {classroom.status === "active" ? (
                    <ClassroomPublishCta classroomId={classroom.id} />
                  ) : (
                    <Button asChild variant="outline">
                      <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                        {t("classroomOverview.reopenBeforePublishing")}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              {t("classroomOverview.studentsNeedingAttention")}
            </h2>
            {attentionAssignments.length ? (
              <div className="mt-4 space-y-3">
                {attentionAssignments.slice(0, 3).map((assignment) => (
                  <Link
                    className="block rounded-lg border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100/70"
                    href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <p className="break-words text-sm font-bold text-amber-950">
                      {assignment.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      {t("classroomOverview.attentionProgress", {
                        notStarted: formatNumber(
                          locale,
                          assignment.progressSummary.notStartedCount,
                        ),
                        active: formatNumber(
                          locale,
                          assignment.progressSummary.inProgressCount,
                        ),
                      })}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("classroomOverview.noAttention")}
              </p>
            )}
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              {t("classroomOverview.classTeam")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("classroomOverview.owner")}:{" "}
              <span className="font-semibold text-slate-900">
                {owner?.displayName ?? t("classroomOverview.owner")}
              </span>
              . {t("classroomOverview.activeRosterSummary", {
                count: formatNumber(locale, activeStudents.length),
              })} {t("classroomOverview.coTeachersSummary", {
                count: formatNumber(locale, activeCoTeachers.length),
              })}
            </p>
            {activeStudents.length ? (
              <div className="mt-4 space-y-2">
                {activeStudents.slice(0, 4).map((student) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    key={student.id}
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {student.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {student.email || student.profile?.username || t("roles.student")}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/students`}>
                  {t("classroomOverview.students")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/teachers`}>
                  {t("classroomOverview.teachers")}
                </Link>
              </Button>
            </div>
          </section>

          <section className="teacher-panel p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <BarChart3 aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {t("classroomOverview.progress")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("classroomOverview.progressDescription")}
                </p>
              </div>
            </div>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/analytics`}>
                {t("classroomOverview.openProgress")}
              </Link>
            </Button>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              {t("classroomOverview.linkedBlueprintContext")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {classroom.linkedBlueprintCount === null
                ? t("classroomOverview.noLinkedBlueprints")
                : t("classroomOverview.linkedBlueprintsDescription", {
                    count: formatNumber(locale, classroom.linkedBlueprintCount),
                  })}
            </p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/teacher/blueprints">{t("classroomOverview.openBlueprintLibrary")}</Link>
            </Button>
          </section>
        </aside>
      </div>
    </main>
  );
}
