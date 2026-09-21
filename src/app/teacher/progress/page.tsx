import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  type Locale,
} from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherProgressSummary,
  type TeacherProgressAssignment,
  type TeacherProgressAttentionReason,
  type TeacherProgressSummary,
} from "@/lib/teacher-progress";

export const dynamic = "force-dynamic";

function formatProgressDate(locale: Locale, value: string | null | undefined) {
  if (!value) return translate(locale, "classrooms.notSet");

  return formatDate(locale, value, {
    dateStyle: "medium",
  });
}

function formatProgressDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) return translate(locale, "teacher.progressNoActivityYet");

  return formatDateTime(locale, value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatProgressPercentage(locale: Locale, value: number) {
  return `${formatNumber(locale, value)}%`;
}

function assignmentStatusLabel(
  locale: Locale,
  status: TeacherProgressAssignment["status"],
) {
  if (status === "assigned") return translate(locale, "teacher.progressAssigned");
  if (status === "draft") return translate(locale, "teacher.progressDraft");
  return translate(locale, "teacher.progressArchived");
}

function attentionReasonLabel(locale: Locale, reason: TeacherProgressAttentionReason) {
  if (reason === "overdue") return translate(locale, "teacher.progressOverdue");
  if (reason === "due_soon") return translate(locale, "teacher.progressDueSoon");
  if (reason === "high_wrong_rate") {
    return translate(locale, "teacher.progressWrongAnswerPattern");
  }
  return translate(locale, "teacher.progressLowCompletion");
}

function SummaryCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
}) {
  return (
    <article className="teacher-panel min-w-0 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Icon aria-hidden="true" className="size-4" />
        </span>
      </div>
      <p className="mt-3 break-words text-2xl font-bold tabular-nums text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function EmptyState({
  actionHref,
  actionLabel,
  description,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center">
      <h3 className="text-base font-bold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        {description}
      </p>
      <Button asChild className="mt-4" size="sm" variant="outline">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function ProgressCounts({
  assignment,
  locale,
}: {
  assignment: TeacherProgressAssignment;
  locale: Locale;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {formatNumber(locale, assignment.completedCount)}
        </span>
        <span className="text-xs text-slate-500">
          {translate(locale, "teacher.progressDone")}
        </span>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {formatNumber(locale, assignment.inProgressCount)}
        </span>
        <span className="text-xs text-slate-500">
          {translate(locale, "teacher.progressActive")}
        </span>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {formatNumber(locale, assignment.notStartedCount)}
        </span>
        <span className="text-xs text-slate-500">
          {translate(locale, "teacher.progressNotStarted")}
        </span>
      </div>
    </div>
  );
}

function AssignmentStatusBadge({
  assignment,
  locale,
}: {
  assignment: TeacherProgressAssignment;
  locale: Locale;
}) {
  const isAssigned = assignment.status === "assigned";

  return (
    <span
      className={
        isAssigned
          ? "inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
          : "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
      }
    >
      {assignmentStatusLabel(locale, assignment.status)}
    </span>
  );
}

function AssignmentProgressSection({
  locale,
  progress,
}: {
  locale: Locale;
  progress: TeacherProgressSummary;
}) {
  return (
    <details className="teacher-panel overflow-hidden">
      <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
        <span className="block text-xl font-bold text-slate-950">
          {translate(locale, "teacher.progressAllAssignmentProgress")}
        </span>
        <span className="mt-1 block text-sm leading-6 text-slate-600">
          {translate(locale, "teacher.progressAllAssignmentProgressDescription")}
        </span>
      </summary>

      {progress.assignments.length ? (
        <>
          <div className="hidden border-t border-slate-100 lg:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">
                {translate(locale, "teacher.progressAssignmentProgressCaption")}
              </caption>
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="w-[26%] px-5 py-3" scope="col">
                    {translate(locale, "teacher.progressAssignment")}
                  </th>
                  <th className="w-[14%] px-3 py-3" scope="col">
                    {translate(locale, "teacher.progressStatusDue")}
                  </th>
                  <th className="w-[10%] px-3 py-3" scope="col">
                    {translate(locale, "teacher.progressStudents")}
                  </th>
                  <th className="w-[27%] px-3 py-3" scope="col">
                    {translate(locale, "teacher.progress")}
                  </th>
                  <th className="w-[15%] px-3 py-3" scope="col">
                    {translate(locale, "teacher.progressLatestActivity")}
                  </th>
                  <th className="w-[8%] px-3 py-3 text-right" scope="col">
                    {translate(locale, "teacher.progressOpen")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {progress.assignments.map((assignment) => (
                  <tr className="align-top" key={assignment.assignmentId}>
                    <td className="px-5 py-4">
                      <p className="break-words font-semibold text-slate-950">
                        {assignment.title}
                      </p>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {assignment.classroomName}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <AssignmentStatusBadge assignment={assignment} locale={locale} />
                      <p className="mt-2 text-xs text-slate-500">
                        {translate(locale, "teacher.progressDue", {
                          date: formatProgressDate(locale, assignment.dueAt),
                        })}
                      </p>
                    </td>
                    <td className="px-3 py-4 font-semibold tabular-nums text-slate-950">
                      {formatNumber(locale, assignment.studentCount)}
                    </td>
                    <td className="px-3 py-4">
                      {assignment.status === "assigned" ? (
                        <ProgressCounts assignment={assignment} locale={locale} />
                      ) : (
                        <p className="text-xs leading-5 text-slate-500">
                          {translate(locale, "teacher.progressDraftNotVisible")}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs leading-5 text-slate-600">
                      {formatProgressDateTime(locale, assignment.latestActivityAt)}
                    </td>
                    <td className="px-3 py-4 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                        >
                          {translate(locale, "teacher.progressOpen")}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 border-t border-slate-100 lg:hidden">
            {progress.assignments.map((assignment) => (
              <article className="space-y-4 p-5" key={assignment.assignmentId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold text-slate-950">
                      {assignment.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{assignment.classroomName}</p>
                  </div>
                  <AssignmentStatusBadge assignment={assignment} locale={locale} />
                </div>
                {assignment.status === "assigned" ? (
                  <ProgressCounts assignment={assignment} locale={locale} />
                ) : (
                  <p className="text-sm leading-6 text-slate-500">
                    {translate(locale, "teacher.progressDraftTeacherOnly")}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>
                    {translate(locale, "teacher.progressDue", {
                      date: formatProgressDate(locale, assignment.dueAt),
                    })}
                  </span>
                  <span>
                    {translate(locale, "teacher.progressStudentCount", {
                      count: formatNumber(locale, assignment.studentCount),
                    })}
                  </span>
                  <span>{formatProgressDateTime(locale, assignment.latestActivityAt)}</span>
                </div>
                <Button asChild className="w-full" size="sm" variant="outline">
                  <Link
                    href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                  >
                    {translate(locale, "teacher.progressOpenAssignmentDetail")}
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </>
      ) : progress.hasClassrooms ? (
        <div className="p-5">
          <EmptyState
            actionHref="/teacher/publish"
            actionLabel={translate(locale, "teacher.createAssignment")}
            description={translate(locale, "teacher.progressNoAssignedWorkDescription")}
            title={translate(locale, "teacher.progressNoAssignedWork")}
          />
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            actionHref="/teacher/classrooms"
            actionLabel={translate(locale, "teacher.progressCreateClassroom")}
            description={translate(locale, "teacher.progressNoClassroomsDescription")}
            title={translate(locale, "teacher.progressNoClassrooms")}
          />
        </div>
      )}
    </details>
  );
}

export default async function TeacherProgressPage() {
  const [, locale] = await Promise.all([requireTeacher(), getRequestLocale()]);
  const supabase = await createClient();
  const summary = await getTeacherProgressSummary({ supabase });
  const completionLabel =
    summary.overview.completionRate === null
      ? translate(locale, "teacher.progressNoAssignedRoster")
      : formatProgressPercentage(locale, summary.overview.completionRate);
  const assignmentProgress = summary;

  return (
    <TeacherWorkspaceShell
      eyebrow={translate(locale, "teacher.progressEyebrow")}
      title={translate(locale, "teacher.progressTitle")}
      description={translate(locale, "teacher.progressDescription")}
      actions={
        <Button asChild variant="outline">
          <Link href="/teacher/publish">
            {translate(locale, "teacher.createAssignment")}
          </Link>
        </Button>
      }
    >
      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          detail={translate(locale, "teacher.progressDraftsSaved", {
            count: formatNumber(locale, summary.overview.draftAssignmentCount),
          })}
          icon={Activity}
          label={translate(locale, "teacher.progressActiveAssignments")}
          value={formatNumber(locale, summary.overview.activeAssignmentCount)}
        />
        <SummaryCard
          detail={translate(locale, "teacher.progressCompletionDetail", {
            assigned: formatNumber(locale, summary.overview.assignedStudentSlotCount),
            completed: formatNumber(locale, summary.overview.completedStudentSlotCount),
          })}
          icon={CheckCircle2}
          label={translate(locale, "teacher.progressCompletionRate")}
          value={completionLabel}
        />
        <SummaryCard
          detail={translate(locale, "teacher.progressAcrossAssignedWork")}
          icon={AlertTriangle}
          label={translate(locale, "teacher.progressStudentsNeedingAttention")}
          value={formatNumber(locale, summary.overview.studentsNeedingAttentionCount)}
        />
      </section>

      <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              {translate(locale, "teacher.progressNeedsAttention")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {translate(locale, "teacher.progressNeedsAttentionDescription")}
            </p>
          </div>
          {summary.attentionQueue.length ? (
            <div className="divide-y divide-slate-100">
              {summary.attentionQueue.map((assignment) => (
                <article className="space-y-4 p-5" key={assignment.assignmentId}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words font-bold text-slate-950">
                        {assignment.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {assignment.classroomName} · {translate(locale, "teacher.progressDue", {
                          date: formatProgressDate(locale, assignment.dueAt),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assignment.reasons.map((reason) => (
                        <span
                          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
                          key={reason}
                        >
                          {attentionReasonLabel(locale, reason)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {formatNumber(
                          locale,
                          assignment.inProgressCount + assignment.notStartedCount,
                        )}
                      </span>
                      <span className="text-xs text-slate-500">
                        {translate(locale, "teacher.progressIncomplete")}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {formatProgressPercentage(locale, assignment.completionRate ?? 0)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {translate(locale, "teacher.progressCompletion")}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {formatNumber(locale, assignment.recentWrongCount)}/
                        {formatNumber(locale, assignment.recentAttemptCount)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {translate(locale, "teacher.progressWrongAttempts")}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">
                      {translate(locale, "teacher.progressStudentsInSignal", {
                        count: formatNumber(locale, assignment.studentsNeedingAttentionCount),
                      })}
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                      >
                        {translate(locale, "teacher.progressOpenAssignmentDetail")}
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : summary.hasAssignedWork ? (
            <div className="p-5">
              <EmptyState
                actionHref="/teacher/classrooms"
                actionLabel={translate(locale, "teacher.progressReviewClassrooms")}
                description={translate(locale, "teacher.progressNoAttentionSignalsDescription")}
                title={translate(locale, "teacher.progressNoAttentionSignals")}
              />
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                actionHref={summary.hasClassrooms ? "/teacher/publish" : "/teacher/classrooms"}
                actionLabel={
                  summary.hasClassrooms
                    ? translate(locale, "teacher.createAssignment")
                    : translate(locale, "teacher.progressCreateClassroom")
                }
                description={translate(locale, "teacher.progressAttentionAppears")}
                title={translate(locale, "teacher.progressNoAssignedWork")}
              />
            </div>
          )}
      </section>

      <details className="teacher-panel overflow-hidden">
        <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
          <span className="block text-xl font-bold text-slate-950">
            {translate(locale, "teacher.progressRecentEvidence")}
          </span>
          <span className="mt-1 block text-sm leading-6 text-slate-600">
            {translate(locale, "teacher.progressRecentEvidenceDescription", {
              count: formatNumber(locale, summary.overview.recentEvidenceCount),
            })}
          </span>
        </summary>
          {summary.recentEvidence.length ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {summary.recentEvidence.map((evidence) => (
                <Link
                  className="teacher-focus-ring block p-5 transition hover:bg-sky-50/50"
                  href={`/teacher/classrooms/${evidence.classroomId}/assignments/${evidence.assignmentId}`}
                  key={`${evidence.assignmentId}-${evidence.practiceSessionId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-bold text-slate-950">
                        {evidence.studentName}
                      </h3>
                      <p className="mt-1 break-words text-sm text-slate-600">
                        {evidence.assignmentTitle} · {evidence.classroomName}
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      {translate(locale, "teacher.progressCorrectCount", {
                        correct: formatNumber(locale, evidence.correctCount),
                        total: formatNumber(locale, evidence.totalAttemptCount),
                      })}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      {translate(locale, "teacher.progressWrongCount", {
                        count: formatNumber(locale, evidence.wrongCount),
                      })}
                    </span>
                    <span>{formatProgressDateTime(locale, evidence.latestActivityAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                actionHref={summary.hasAssignedWork ? "/teacher/classrooms" : "/teacher/publish"}
                actionLabel={
                  summary.hasAssignedWork
                    ? translate(locale, "teacher.progressOpenClassrooms")
                    : translate(locale, "teacher.createAssignment")
                }
                description={translate(locale, "teacher.progressNoEvidenceDescription")}
                title={translate(locale, "teacher.progressNoEvidence")}
              />
            </div>
          )}
      </details>

      <AssignmentProgressSection locale={locale} progress={assignmentProgress} />
      <p className="text-xs leading-5 text-slate-500">
        {translate(locale, "teacher.progressEvidenceBoundary")}
      </p>
    </TeacherWorkspaceShell>
  );
}
