import { randomUUID } from "node:crypto";

import Link from "next/link";
import { notFound } from "next/navigation";

import { ClassroomRouteTabs } from "@/app/teacher/classrooms/classroom-ui";
import {
  savePrivateTeacherFeedbackNote,
  sendTeacherFeedbackNote,
} from "@/app/teacher/classrooms/[id]/assignments/[assignmentId]/feedback-actions";
import { resumeQuarantinedAssignment } from "@/app/teacher/classrooms/[id]/assignments/[assignmentId]/delivery-actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { QuestionText } from "@/components/math-content";
import { EvidenceDisclosureLink } from "@/components/teacher/evidence-disclosure-link";
import { FocusTaskLink } from "@/components/teacher/focus-task-link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getAssignmentDeliveryQuarantine,
  getTeacherAssignmentDetail,
} from "@/lib/teacher-assignments";
import { listTeacherAssignmentFeedbackNotes } from "@/lib/teacher-feedback-notes";
import { formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

export const dynamic = "force-dynamic";

type TeacherAssignmentDetailPageProps = {
  params: Promise<{ assignmentId: string; id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function statusBadgeClass(status: string) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (status === "in_progress") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }
  if (status === "assigned") {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }
  if (status === "draft" || status === "not_started") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function formatPercent(value: number | null, locale: Parameters<typeof translate>[0], t: (key: Parameters<typeof translate>[1]) => string) {
  return value === null ? t("assignmentDetail.notSet") : `${formatNumber(locale, value)}%`;
}

function attentionLabel(
  status: "mixed_results" | "needs_attention" | "no_attempts" | "on_track" | "unavailable",
  t: (key: Parameters<typeof translate>[1]) => string,
) {
  if (status === "needs_attention") return t("assignmentDetail.needsAttention");
  if (status === "mixed_results") return t("assignmentDetail.mixedResults");
  if (status === "no_attempts") return t("assignmentDetail.noAttempts");
  if (status === "unavailable") return t("assignmentDetail.questionUnavailable");
  return t("assignmentDetail.onTrack");
}

function attentionBadgeClass(
  status: "mixed_results" | "needs_attention" | "no_attempts" | "on_track" | "unavailable",
) {
  if (status === "needs_attention") {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (status === "mixed_results") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  if (status === "on_track") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function attemptResultLabel(isCorrect: boolean | null, score: number | null, locale: Parameters<typeof translate>[0], t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string) {
  if (isCorrect === true) return t("assignmentDetail.correct");
  if (isCorrect === false) return t("assignmentDetail.needsReview");
  if (score !== null) return t("assignmentDetail.score", { score: formatNumber(locale, score) });
  return t("assignmentDetail.recorded");
}

function ProgressStat({
  label,
  value,
  helper,
}: {
  helper?: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

export default async function TeacherAssignmentDetailPage({
  params,
  searchParams,
}: TeacherAssignmentDetailPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const formatDateTime = (value: string | null | undefined) => value ? formatLocaleDateTime(locale, value) : t("assignmentDetail.notSet");
  const statusLabel = (status: string) => ({ completed: t("assignmentDetail.completed"), in_progress: t("assignmentDetail.inProgress"), assigned: t("assignmentDetail.assigned"), draft: t("assignmentDetail.draft"), not_started: t("assignmentDetail.notStarted") } as Record<string, string>)[status] ?? status;
  const sourceKindLabel = (kind: string) => ({ course_builder_run: t("assignmentDetail.courseBuilderRun"), practice_framework: t("assignmentDetail.practiceFramework"), question_bank: t("assignmentDetail.library"), manual: t("assignmentDetail.manual") } as Record<string, string>)[kind] ?? kind;
  const questionTypeLabel = (questionType: string | null | undefined) =>
    ({
      fill_blank: t("courseBuilder.questionTypeFillBlank"),
      frq: t("courseBuilder.questionTypeFrq"),
      mcq: t("courseBuilder.questionTypeMcq"),
      mixed: t("courseBuilder.questionTypeMixed"),
    } as Record<string, string>)[questionType ?? ""] ?? questionType ?? "";
  const itemTypeLabel = (itemType: string) =>
    itemType === "question" ? t("assignmentDetail.questionItem") : itemType;
  const { assignmentId, id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const assignment = await getTeacherAssignmentDetail({
    assignmentId,
    classroomId: id,
    supabase,
  });

  if (!assignment) {
    notFound();
  }
  const feedbackNotes = await listTeacherAssignmentFeedbackNotes({
    assignmentId: assignment.id,
    classroomId: assignment.classroom.id,
    supabase,
  });
  const studentById = new Map(
    assignment.studentProgressRows.map((row) => [row.studentId, row]),
  );
  const attachableQuestions = assignment.questionPerformanceRows.filter(
    (row) => row.question,
  );
  const deliveryQuarantine = getAssignmentDeliveryQuarantine(
    assignment.source_summary,
  );
  const affectedItems = assignment.items.filter(
    (item) => item.item_type === "question" && item.readinessIssues.length > 0,
  );
  const sourceBankId =
    assignment.source_record_id ??
    assignment.items.find((item) => item.source_bank_id)?.source_bank_id ??
    null;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("assignmentDetail.detailEyebrow")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {t("assignmentDetail.deliveryDetailFor", {
                classroom: `${assignment.classroom.name}${assignment.classroom.subject ? ` - ${assignment.classroom.subject}` : ""}`,
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
                <Link href="/teacher">{t("assignmentDetail.teacherStudio")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${assignment.classroom.id}/assignments`}>
                {t("assignmentDetail.backToAssignments")}
              </Link>
            </Button>
            <FocusTaskLink
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
              href={`/teacher/classrooms/${assignment.classroom.id}/assignments/${assignment.id}/student-preview`}
              newTabLabel={t("assignmentDetail.openStudentPreview")}
              returnTo={`/teacher/classrooms/${assignment.classroom.id}/assignments/${assignment.id}`}
              taskKind="student-preview"
              triggerId="assignment-student-preview"
            >
              {t("assignmentDetail.previewAsStudent")}
            </FocusTaskLink>
          </div>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={assignment.classroom.id} />

      <section
        aria-labelledby="assignment-evidence-heading"
        className="teacher-panel overflow-hidden"
      >
        <div className="border-b border-slate-100 p-5">
          <p className="teacher-eyebrow">{t("assignmentDetail.evidenceEyebrow")}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950" id="assignment-evidence-heading">
            {t("assignmentDetail.evidenceHeading")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("assignmentDetail.evidenceDescription")}
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
          <ProgressStat
            helper={t("assignmentDetail.studentsCompleted")}
            label={t("assignmentDetail.completionRate")}
            value={formatPercent(assignment.evidenceSummary.completionRate, locale, t)}
          />
          <ProgressStat
            helper={t("assignmentDetail.correctMissed", {
              correct: formatNumber(locale, assignment.evidenceSummary.correctAttemptCount),
              incorrect: formatNumber(locale, assignment.evidenceSummary.incorrectAttemptCount),
            })}
            label={t("assignmentDetail.attempts")}
            value={formatNumber(locale, assignment.evidenceSummary.attemptCount)}
          />
          <ProgressStat
            helper={t("assignmentDetail.twoOrMoreAttempts")}
            label={t("assignmentDetail.studentsNeedingAttention")}
            value={formatNumber(locale, assignment.evidenceSummary.studentsNeedingAttentionCount)}
          />
        </div>
      </section>

      {query.saved ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
          role="status"
        >
          {t("assignmentDetail.actionSaved")}
        </p>
      ) : null}
      {query.error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {t("assignmentDetail.actionFailed")}
        </p>
      ) : null}

      {deliveryQuarantine ? (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-base font-bold text-amber-950">
            {t("assignmentDetail.deliveryPausedByReview")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {t("assignmentDetail.quarantineDescription", {
              count: formatNumber(locale, affectedItems.length || 1),
              s: affectedItems.length === 1 ? "" : "s",
            })}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            {t("assignmentDetail.pausedAtReview", {
              date: formatDateTime(deliveryQuarantine.quarantinedAt),
            })}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {sourceBankId ? (
              <Button asChild variant="outline">
                <Link href={`/teacher/banks/${sourceBankId}/review`}>
                  {t("assignmentDetail.openLibraryReview")}
                </Link>
              </Button>
            ) : null}
            <form action={resumeQuarantinedAssignment}>
              <input name="assignmentId" type="hidden" value={assignment.id} />
              <input
                name="classroomId"
                type="hidden"
                value={assignment.classroom.id}
              />
              <FormSubmitButton
                disabled={affectedItems.length > 0}
                pendingLabel={t("assignmentDetail.resumingDelivery")}
              >
                {t("assignmentDetail.resumeDelivery")}
              </FormSubmitButton>
            </form>
            <Button asChild variant="outline">
              <Link
                href={`/teacher/publish?classroomId=${assignment.classroom.id}${
                  sourceBankId ? `&sourceBankId=${sourceBankId}` : ""
                }`}
              >
                {t("assignmentDetail.createReplacementAssignment")}
              </Link>
            </Button>
          </div>
          {affectedItems.length ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {affectedItems.map((item) => (
                <li key={item.id}>
                  {item.question?.title || t("assignmentDetail.unavailableLibraryQuestion")} —{" "}
                  {item.readinessIssues.join("; ")}
                </li>
              ))}
            </ul>
          ) : null}
          {affectedItems.length ? (
            <p className="mt-3 text-xs leading-5 text-amber-800">
              {t("assignmentDetail.resumeOnlyAfterIssues")} {t("assignmentDetail.useLibraryReview")}; {t("assignmentDetail.replacementWhenCannotRepair")}
            </p>
          ) : null}
        </section>
      ) : assignment.status === "draft" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-bold text-amber-950">
            {t("assignmentDetail.draftTeacherOnly")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            {t("assignmentDetail.draftDescription")}
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-base font-bold text-blue-950">
            {t("assignmentDetail.assignedVisible")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-blue-900">
            {t("assignmentDetail.assignedDescription")}
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                {t("assignmentDetail.studentProgress")}
              </h2>
              <p className="teacher-muted">
                {t("assignmentDetail.studentProgressDescription")}
              </p>
            </div>

            {assignment.progressSummary.studentCount === 0 ? (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  {t("assignmentDetail.noActiveStudents")}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {t("assignmentDetail.addStudentsForProgress")}
                </p>
              </div>
            ) : assignment.progressSummary.linkedPracticeSessionCount === 0 ? (
              <div className="border-b border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                {t("assignmentDetail.noLinkedPracticeEvidence")}
              </div>
            ) : null}

            {assignment.studentProgressRows.length ? (
              <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <caption className="sr-only">
                    {t("assignmentDetail.studentsOrderedByAttention")}
                  </caption>
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.student")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.status")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.attempts")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.correctTotal")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.latestActivity")}</th>
                      <th className="px-5 py-3" scope="col"><span className="sr-only">{t("assignmentDetail.viewEvidence")}</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignment.studentProgressRows.map((row) => (
                      <tr className="align-top" key={row.studentId}>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.displayName}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.email || row.profile?.username || row.studentId}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-bold capitalize ring-1 ${statusBadgeClass(
                              row.status,
                            )}`}
                          >
                            {statusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                            <p className="font-semibold">{formatNumber(locale, row.practiceAttemptCount)}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t("assignmentDetail.hintsUsed", { count: formatNumber(locale, row.practiceHintCount), s: row.practiceHintCount === 1 ? "" : "s" })}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          <p className="font-semibold">
                            {formatNumber(locale, row.practiceCorrectCount)} / {formatNumber(locale, row.practiceAttemptCount)}
                          </p>
                          {row.practiceIncorrectCount ? (
                            <p className="mt-1 text-xs text-rose-700">
                              {t("assignmentDetail.missed", { count: formatNumber(locale, row.practiceIncorrectCount) })}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-700">
                            {formatDateTime(row.latestPracticeSessionAt)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {t("assignmentDetail.linkedSessions", { count: formatNumber(locale, row.linkedPracticeSessionCount), s: row.linkedPracticeSessionCount === 1 ? "" : "s" })}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.recentAttempts.length ? (
                              <EvidenceDisclosureLink
                              targetId={`student-evidence-${row.studentId}`}
                            >
                              {t("assignmentDetail.viewEvidence")}
                            </EvidenceDisclosureLink>
                          ) : (
                            <span className="text-xs text-slate-400">{t("assignmentDetail.pending")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-slate-100 lg:hidden">
                {assignment.studentProgressRows.map((row) => (
                  <article className="space-y-4 p-5" key={row.studentId}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-semibold text-slate-950">
                          {row.displayName}
                        </h3>
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {row.email || row.profile?.username || row.studentId}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-bold capitalize ring-1 ${statusBadgeClass(
                          row.status,
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-xs font-semibold text-slate-500">
                          {t("assignmentDetail.attempts")}
                        </dt>
                        <dd className="mt-1 font-bold text-slate-950">
                          {formatNumber(locale, row.practiceAttemptCount)}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <dt className="text-xs font-semibold text-slate-500">
                          {t("assignmentDetail.correct")}
                        </dt>
                        <dd className="mt-1 font-bold text-slate-950">
                          {formatNumber(locale, row.practiceCorrectCount)} / {formatNumber(locale, row.practiceAttemptCount)}
                        </dd>
                      </div>
                      <div className="col-span-2 rounded-lg bg-slate-50 p-3">
                        <dt className="text-xs font-semibold text-slate-500">
                          {t("assignmentDetail.latestActivity")}
                        </dt>
                        <dd className="mt-1 font-medium text-slate-800">
                          {formatDateTime(row.latestPracticeSessionAt)}
                        </dd>
                      </div>
                    </dl>
                    {row.recentAttempts.length ? (
                      <EvidenceDisclosureLink
                        targetId={`student-evidence-${row.studentId}`}
                      >
                        {t("assignmentDetail.viewEvidence")}
                      </EvidenceDisclosureLink>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {t("assignmentDetail.evidencePending")}
                      </p>
                    )}
                  </article>
                ))}
              </div>
              </>
            ) : null}
          </section>

          <details className="teacher-panel overflow-hidden">
            <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
              <span className="block text-lg font-bold text-slate-950">
                {t("assignmentDetail.questionPerformance")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                {t("assignmentDetail.optionalEvidenceByQuestion")}
              </span>
            </summary>
            {assignment.questionPerformanceRows.length ? (
              <div className="overflow-x-auto border-t border-slate-100">
                <table
                  aria-label={t("assignmentDetail.questionPerformanceLabel")}
                  className="min-w-full divide-y divide-slate-100 text-sm"
                >
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.question")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.typeDifficulty")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.attempted")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.correct")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.missedCount")}</th>
                      <th className="px-5 py-3" scope="col">{t("assignmentDetail.attentionSignal")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignment.questionPerformanceRows.map((row) => (
                      <tr className="align-top" key={row.assignmentItemId}>
                        <td className="min-w-[18rem] px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.question?.title || t("assignmentDetail.questionUnavailable")}
                          </p>
                          {row.question?.content_html ? (
                            <QuestionText
                              className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600"
                              value={row.question.content_html}
                            />
                          ) : null}
                          <p className="mt-2 text-xs font-semibold text-sky-700">
                            {row.sourceLabel}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {row.question ? (
                            <>
                              <p className="font-medium">
                                {questionTypeLabel(row.question.question_type)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {t("assignmentDetail.difficulty", { value: formatNumber(locale, row.question.difficulty_rating) })}
                              </p>
                            </>
                          ) : (
                            <span className="text-slate-500">{t("assignmentDetail.notAvailable")}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-700">
                          {formatNumber(locale, row.studentAttemptedCount)} / {formatNumber(locale, row.assignedStudentCount)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-emerald-700">
                          {formatNumber(locale, row.correctAttemptCount)}
                        </td>
                        <td className="px-5 py-4 font-semibold text-rose-700">
                          {formatNumber(locale, row.incorrectAttemptCount)}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${attentionBadgeClass(
                              row.attentionStatus,
                            )}`}
                          >
                            {attentionLabel(row.attentionStatus, t)}
                          </span>
                          {row.latestActivityAt ? (
                            <p className="mt-2 text-xs text-slate-500">
                              {formatDateTime(row.latestActivityAt)}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">{t("assignmentDetail.noSelectedQuestions")}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {t("assignmentDetail.addQuestionsBeforeAssigning")}
                </p>
              </div>
            )}
          </details>

          <details className="teacher-panel overflow-hidden">
            <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
              <span className="block text-lg font-bold text-slate-950">
                {t("assignmentDetail.attemptDrilldown")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                {t("assignmentDetail.optionalRecentEvidence")}
              </span>
            </summary>
            {assignment.studentProgressRows.some((row) => row.recentAttempts.length) ? (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {assignment.studentProgressRows
                  .filter((row) => row.recentAttempts.length)
                  .map((row) => (
                    <details
                      className="group p-5"
                      id={`student-evidence-${row.studentId}`}
                      key={row.studentId}
                      tabIndex={-1}
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-slate-950">{row.displayName}</span>
                          <span className="mt-1 block text-sm text-slate-600">
                            {t("assignmentDetail.attemptSummary", { attempts: formatNumber(locale, row.practiceAttemptCount), s: row.practiceAttemptCount === 1 ? "" : "s", correct: formatNumber(locale, row.practiceCorrectCount), hints: formatNumber(locale, row.practiceHintCount), hintsSuffix: row.practiceHintCount === 1 ? "" : "s" })}
                          </span>
                        </span>
                        <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 group-open:bg-slate-50">
                          {t("assignmentDetail.viewRecentAttempts")}
                        </span>
                      </summary>
                      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                        {row.recentAttempts.map((attempt) => (
                          <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={attempt.id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-950">{attempt.questionTitle}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                   {formatDateTime(attempt.createdAt)} - {t("assignmentDetail.gradingMode", { mode: attempt.gradingMode })} - {t("assignmentDetail.hintsUsed", { count: formatNumber(locale, attempt.hintCount), s: attempt.hintCount === 1 ? "" : "s" })}
                                </p>
                              </div>
                              <span
                                className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusBadgeClass(
                                  attempt.isCorrect === true ? "completed" : attempt.isCorrect === false ? "draft" : "assigned",
                                )}`}
                              >
                                {attemptResultLabel(attempt.isCorrect, attempt.score, locale, t)}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                              <div className="rounded-md border border-slate-200 bg-white p-3">
                                 <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{t("assignmentDetail.studentAnswer")}</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{attempt.answerPreview}</p>
                              </div>
                              <div className="rounded-md border border-slate-200 bg-white p-3">
                                 <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{t("assignmentDetail.systemReview")}</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                   {attempt.feedbackSummary || t("assignmentDetail.noWrittenReview")}
                                </p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">{t("assignmentDetail.evidenceStillPending")}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {t("assignmentDetail.practiceEvidenceAppearsHere")}
                </p>
              </div>
            )}
          </details>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
            <p className="teacher-eyebrow">{t("assignmentDetail.teacherFeedbackNotes")}</p>
            <h2 className="mt-1 text-lg font-bold text-slate-950">{t("assignmentDetail.respondToAssignmentEvidence")}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {t("assignmentDetail.feedbackDescription")}
              </p>
            </div>

            {feedbackNotes.length ? (
              <div className="divide-y divide-slate-100 border-b border-slate-100">
                {feedbackNotes.map((note) => {
                  const student = note.student_id ? studentById.get(note.student_id) : null;
                  const sent = note.visibility === "sent_to_student" && note.status === "sent";

                  return (
                    <article className="p-5" key={note.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-950">
                            {student?.displayName || t("assignmentDetail.assignmentNote")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {sent
                              ? t("assignmentDetail.sentAt", { date: formatDateTime(note.sent_at) })
                              : t("assignmentDetail.privateNoteUpdated", { date: formatDateTime(note.updated_at) })}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ring-1 ${
                            sent
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {sent ? t("assignmentDetail.sentToStudent") : t("assignmentDetail.privateTeacherNote")}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {note.body}
                      </p>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="border-b border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {t("assignmentDetail.noFeedbackNotes")}
              </div>
            )}

            {assignment.studentProgressRows.length ? (
              <div className="divide-y divide-slate-100">
                {assignment.studentProgressRows.map((row) => (
                  <details className="group p-5" key={row.studentId}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="block font-semibold text-slate-950">
                          {t("assignmentDetail.writeFeedbackFor", { name: row.displayName })}
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {row.practiceAttemptCount
                            ? t("assignmentDetail.correctInAssignmentPractice", {
                                attempts: formatNumber(locale, row.practiceAttemptCount),
                                correct: formatNumber(locale, row.practiceCorrectCount),
                              })
                            : t("assignmentDetail.noAssignmentPracticeAttempt")}
                        </span>
                      </span>
                      <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 group-open:bg-slate-50">
                        {t("assignmentDetail.addNote")}
                      </span>
                    </summary>

                    <form className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                      <input name="assignmentId" type="hidden" value={assignment.id} />
                      <input name="classroomId" type="hidden" value={assignment.classroom.id} />
                      <input
                        name="feedbackId"
                        type="hidden"
                        value={randomUUID()}
                      />
                      <input name="studentId" type="hidden" value={row.studentId} />
                      <div className="space-y-2">
                        <Label htmlFor={`feedback-body-${row.studentId}`}>{t("assignmentDetail.feedbackNote")}</Label>
                        <Textarea
                          id={`feedback-body-${row.studentId}`}
                          maxLength={4000}
                          name="body"
                          placeholder={t("assignmentDetail.feedbackPlaceholder")}
                          required
                          rows={4}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm font-medium text-slate-900">
                          {t("assignmentDetail.attachQuestionOptional")}
                          <select
                            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            defaultValue=""
                            name="questionId"
                          >
                            <option value="">{t("assignmentDetail.assignmentLevelFeedback")}</option>
                            {attachableQuestions.map((questionRow) => (
                              <option
                                key={questionRow.assignmentItemId}
                                value={questionRow.question?.id ?? ""}
                              >
                                {questionRow.question?.title || t("assignmentDetail.assignmentQuestion")}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-900">
                          {t("assignmentDetail.attachRecentAttemptOptional")}
                          <select
                            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            defaultValue=""
                            name="practiceAttemptId"
                          >
                            <option value="">{t("assignmentDetail.noAttemptAttachment")}</option>
                            {row.recentAttempts.map((attempt) => (
                              <option key={attempt.id} value={attempt.id}>
                                {attempt.questionTitle} - {formatDateTime(attempt.createdAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <FormSubmitButton
                          className="min-h-11"
                          formAction={savePrivateTeacherFeedbackNote}
                          pendingLabel={t("assignmentDetail.savingPrivateNote")}
                          variant="outline"
                        >
                          {t("assignmentDetail.savePrivateNote")}
                        </FormSubmitButton>
                        <FormSubmitButton
                          className="min-h-11"
                          formAction={sendTeacherFeedbackNote}
                          pendingLabel={t("assignmentDetail.sendingFeedback")}
                        >
                          {t("assignmentDetail.sendToStudent")}
                        </FormSubmitButton>
                      </div>
                      <p className="text-xs leading-5 text-slate-500">
                        {t("assignmentDetail.privateNotesVisibility")}
                      </p>
                    </form>
                  </details>
                ))}
              </div>
            ) : null}
          </section>

          <details className="teacher-panel overflow-hidden">
            <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
              <span className="block text-lg font-bold text-slate-950">
                {t("assignmentDetail.assignmentItems")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                {t("assignmentDetail.assignmentItemsDescription")}
              </span>
            </summary>
            {assignment.items.length ? (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {assignment.items.map((item) => (
                  <article className="p-5" key={item.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          {t("assignmentDetail.itemSummary", {
                            order: formatNumber(locale, item.order_index),
                            type: itemTypeLabel(item.item_type),
                          })}
                        </p>
                        <h3 className="text-base font-bold text-slate-950">
                          {item.question ? (
                            <Link
                              className="underline-offset-4 hover:underline"
                              href={`/questions/${item.question.id}`}
                            >
                              {item.question.title}
                            </Link>
                          ) : (
                            t("assignmentDetail.questionItem")
                          )}
                        </h3>
                        {item.question ? (
                          <p className="text-sm leading-6 text-slate-600">
                            {item.question.question_code} - {questionTypeLabel(item.question.question_type)} - {t("assignmentDetail.difficulty", {
                              value: formatNumber(locale, item.question.difficulty_rating),
                            })}
                          </p>
                        ) : (
                          <p className="text-sm leading-6 text-slate-600">
                            {t("assignmentDetail.unavailableItem")}
                          </p>
                        )}
                        {item.bank_question_id ? (
                          <p className="text-xs font-semibold text-sky-700">
                            {t("assignmentDetail.deliveredFromLibrary")}
                          </p>
                        ) : null}
                      </div>
                      {item.points !== null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {t("assignmentDetail.points", { points: formatNumber(locale, item.points) })}
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  {t("assignmentDetail.noAssignmentItems")}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  {t("assignmentDetail.noAssignmentItemsDescription")}
                </p>
              </div>
            )}
          </details>
        </div>

        <aside>
          <details className="teacher-panel overflow-hidden">
            <summary className="teacher-focus-ring min-h-11 cursor-pointer list-none p-5">
              <span className="block text-lg font-bold text-slate-950">
                {t("assignmentDetail.assignmentSetupAndSource")}
              </span>
              <span className="mt-1 block text-sm leading-6 text-slate-600">
                {t("assignmentDetail.setupSourceDescription")}
              </span>
            </summary>
            <div className="space-y-5 border-t border-slate-100 p-5">
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t("assignmentDetail.state")}</dt>
                  <dd className="font-semibold capitalize text-slate-950">
                    {statusLabel(assignment.status)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t("assignmentDetail.assigned")}</dt>
                  <dd className="font-semibold text-slate-950">
                    {formatDateTime(assignment.assigned_at)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t("assignmentDetail.due")}</dt>
                  <dd className="font-semibold text-slate-950">
                    {formatDateTime(assignment.due_at)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t("assignmentDetail.items")}</dt>
                  <dd className="font-semibold text-slate-950">
                    {formatNumber(locale, assignment.itemCount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{t("assignmentDetail.source")}</dt>
                  <dd className="font-semibold text-slate-950">
                    {sourceKindLabel(assignment.source_kind)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t("assignmentDetail.studentAccess")}</dt>
                  <dd className="font-semibold text-slate-950">
                    {t("assignmentDetail.assignmentOnlyLibraryPrivate")}
                  </dd>
                </div>
              </dl>
              {assignment.instructions ? (
                <div className="border-t border-slate-100 pt-4">
                  <h2 className="text-sm font-bold text-slate-950">
                    {t("assignmentDetail.instructions")}
                  </h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {assignment.instructions}
                  </p>
                </div>
              ) : null}
              {assignment.source_kind === "question_bank" &&
              assignment.source_record_id ? (
                <Button asChild className="min-h-11 w-full" variant="outline">
                  <Link href={`/teacher/banks/${assignment.source_record_id}`}>
                    {t("assignmentDetail.openSourceLibrary")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </details>
        </aside>
      </div>
    </main>
  );
}
