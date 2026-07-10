import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
} from "@/app/teacher/classrooms/classroom-ui";
import {
  savePrivateTeacherFeedbackNote,
  sendTeacherFeedbackNote,
} from "@/app/teacher/classrooms/[id]/assignments/[assignmentId]/feedback-actions";
import { QuestionText } from "@/components/math-content";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherAssignmentDetail } from "@/lib/teacher-assignments";
import { listTeacherAssignmentFeedbackNotes } from "@/lib/teacher-feedback-notes";

export const dynamic = "force-dynamic";

type TeacherAssignmentDetailPageProps = {
  params: Promise<{ assignmentId: string; id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function summaryText(
  summary: unknown,
  key:
    | "assignmentVisibility"
    | "bankName"
    | "bankVisibility"
    | "eligibleQuestionCount"
    | "itemCount"
    | "sourceStatus"
    | "sourceTitle"
    | "unavailableQuestionCount",
) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const value = (summary as Record<string, unknown>)[key];
  return value === null || value === undefined ? null : String(value);
}

function sourceKindLabel(kind: string) {
  if (kind === "course_builder_run") return "Course Builder run";
  if (kind === "practice_framework") return "Practice framework";
  if (kind === "question_bank") return "Question Bank";
  return "Manual";
}

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

function formatPercent(value: number | null) {
  return value === null ? "Not set" : `${value}%`;
}

function attentionLabel(
  status: "mixed_results" | "needs_attention" | "no_attempts" | "on_track" | "unavailable",
) {
  if (status === "needs_attention") return "Needs attention";
  if (status === "mixed_results") return "Mixed results";
  if (status === "no_attempts") return "No attempts yet";
  if (status === "unavailable") return "Question unavailable";
  return "On track";
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

function attemptResultLabel(isCorrect: boolean | null, score: number | null) {
  if (isCorrect === true) return "Correct";
  if (isCorrect === false) return "Needs review";
  if (score !== null) return `Score ${score}`;
  return "Recorded";
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

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Assignment detail</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Delivery detail for {assignment.classroom.name}
              {assignment.classroom.subject ? ` - ${assignment.classroom.subject}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">Teacher Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${assignment.classroom.id}/assignments`}>
                Back to assignments
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/student/work/${assignment.id}`}>Student view</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={assignment.classroom.id} />
      <ClassroomSafetyStrip />

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Assignment-only visibility:</strong> this
        page tracks selected delivered items. It does not grant students access
        to the teacher&apos;s full bank.
      </section>

      <section className="teacher-panel overflow-hidden" aria-labelledby="assignment-evidence-heading">
        <div className="border-b border-slate-100 p-5">
          <p className="teacher-eyebrow">Assignment evidence</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950" id="assignment-evidence-heading">
            Evidence for this assignment only
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Review student attempts from linked assignment Practice sessions. Private student
            self-study is not included.
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">
          <ProgressStat
            helper="Students marked completed"
            label="Completion rate"
            value={formatPercent(assignment.evidenceSummary.completionRate)}
          />
          <ProgressStat
            helper={`${assignment.evidenceSummary.correctAttemptCount} correct, ${assignment.evidenceSummary.incorrectAttemptCount} missed`}
            label="Attempts"
            value={assignment.evidenceSummary.attemptCount}
          />
          <ProgressStat
            helper="Two or more attempts with more misses than correct"
            label="Students needing attention"
            value={assignment.evidenceSummary.studentsNeedingAttentionCount}
          />
          <ProgressStat
            helper={formatDateTime(assignment.evidenceSummary.latestActivityAt)}
            label="Latest activity"
            value={assignment.evidenceSummary.latestActivityAt ? "Recorded" : "None"}
          />
        </div>
      </section>

      {query.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <ProgressStat
          helper={statusLabel(assignment.status)}
          label="Assignment"
          value={assignment.status === "assigned" ? "Live" : "Draft"}
        />
        <ProgressStat
          helper="Active classroom students"
          label="Students"
          value={assignment.progressSummary.studentCount}
        />
        <ProgressStat
          helper="No practice started"
          label="Not started"
          value={assignment.progressSummary.notStartedCount}
        />
        <ProgressStat
          helper="Practice evidence exists"
          label="In progress"
          value={assignment.progressSummary.inProgressCount}
        />
        <ProgressStat
          helper="Marked completed"
          label="Completed"
          value={assignment.progressSummary.completedCount}
        />
        <ProgressStat
          helper={formatDateTime(assignment.progressSummary.latestPracticeSessionAt)}
          label="Latest activity"
          value={assignment.progressSummary.linkedPracticeSessionCount}
        />
      </section>

      {assignment.status === "draft" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-bold text-amber-950">
            Draft assignment is teacher-only.
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            Students will not see this assignment in My Work until it is assigned.
            Progress rows are shown for roster planning only.
          </p>
        </section>
      ) : (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-base font-bold text-blue-950">
            Assigned work is visible in Student My Work.
          </h2>
          <p className="mt-2 text-sm leading-6 text-blue-900">
            Active class members can open this assignment, start Practice, and
            send progress evidence back to this page.
          </p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                Student progress
              </h2>
              <p className="teacher-muted">
                One row per active classroom student. Attempts and results are limited to
                Practice sessions linked to this assignment.
              </p>
            </div>

            {assignment.progressSummary.studentCount === 0 ? (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  No active students yet.
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Add students to the classroom before expecting assignment
                  progress.
                </p>
              </div>
            ) : assignment.progressSummary.linkedPracticeSessionCount === 0 ? (
              <div className="border-b border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                Students are on the roster, but no linked Practice evidence has
                been created for this assignment yet.
              </div>
            ) : null}

            {assignment.studentProgressRows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Student</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Attempts</th>
                      <th className="px-5 py-3">Correct / total</th>
                      <th className="px-5 py-3">Latest activity</th>
                      <th className="px-5 py-3"><span className="sr-only">View evidence</span></th>
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
                          <p className="font-semibold">{row.practiceAttemptCount}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.practiceHintCount} hint{row.practiceHintCount === 1 ? "" : "s"} used
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          <p className="font-semibold">
                            {row.practiceCorrectCount} / {row.practiceAttemptCount}
                          </p>
                          {row.practiceIncorrectCount ? (
                            <p className="mt-1 text-xs text-rose-700">
                              {row.practiceIncorrectCount} missed
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-700">
                            {formatDateTime(row.latestPracticeSessionAt)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.linkedPracticeSessionCount} linked session{row.linkedPracticeSessionCount === 1 ? "" : "s"}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {row.recentAttempts.length ? (
                            <a
                              className="inline-flex rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 transition hover:bg-slate-50"
                              href={`#student-evidence-${row.studentId}`}
                            >
                              View evidence
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">Question performance</h2>
              <p className="teacher-muted">
                Performance across the selected assignment items. Source bank access remains
                teacher-private.
              </p>
            </div>
            {assignment.questionPerformanceRows.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Question</th>
                      <th className="px-5 py-3">Type / difficulty</th>
                      <th className="px-5 py-3">Attempted</th>
                      <th className="px-5 py-3">Correct</th>
                      <th className="px-5 py-3">Missed</th>
                      <th className="px-5 py-3">Attention signal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignment.questionPerformanceRows.map((row) => (
                      <tr className="align-top" key={row.assignmentItemId}>
                        <td className="min-w-[18rem] px-5 py-4">
                          <p className="font-semibold text-slate-950">
                            {row.question?.title || "Question unavailable"}
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
                              <p className="font-medium">{row.question.question_type}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                Difficulty {row.question.difficulty_rating}
                              </p>
                            </>
                          ) : (
                            <span className="text-slate-500">Not available</span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-slate-700">
                          {row.studentAttemptedCount} / {row.assignedStudentCount}
                        </td>
                        <td className="px-5 py-4 font-semibold text-emerald-700">
                          {row.correctAttemptCount}
                        </td>
                        <td className="px-5 py-4 font-semibold text-rose-700">
                          {row.incorrectAttemptCount}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ring-1 ${attentionBadgeClass(
                              row.attentionStatus,
                            )}`}
                          >
                            {attentionLabel(row.attentionStatus)}
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
                <h3 className="text-base font-bold text-slate-950">No selected questions yet.</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Add selected bank or published questions before assigning work to students.
                </p>
              </div>
            )}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">Attempt drilldown</h2>
              <p className="teacher-muted">
                Recent assignment-linked attempts only. Use feedback notes below to respond to
                evidence without exposing private student self-study.
              </p>
            </div>
            {assignment.studentProgressRows.some((row) => row.recentAttempts.length) ? (
              <div className="divide-y divide-slate-100">
                {assignment.studentProgressRows
                  .filter((row) => row.recentAttempts.length)
                  .map((row) => (
                    <details className="group p-5" id={`student-evidence-${row.studentId}`} key={row.studentId}>
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-slate-950">{row.displayName}</span>
                          <span className="mt-1 block text-sm text-slate-600">
                            {row.practiceAttemptCount} attempt{row.practiceAttemptCount === 1 ? "" : "s"}, {row.practiceCorrectCount} correct, {row.practiceHintCount} hint{row.practiceHintCount === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 group-open:bg-slate-50">
                          View recent attempts
                        </span>
                      </summary>
                      <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                        {row.recentAttempts.map((attempt) => (
                          <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={attempt.id}>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-950">{attempt.questionTitle}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {formatDateTime(attempt.createdAt)} - {attempt.gradingMode} grading - {attempt.hintCount} hint{attempt.hintCount === 1 ? "" : "s"}
                                </p>
                              </div>
                              <span
                                className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ring-1 ${statusBadgeClass(
                                  attempt.isCorrect === true ? "completed" : attempt.isCorrect === false ? "draft" : "assigned",
                                )}`}
                              >
                                {attemptResultLabel(attempt.isCorrect, attempt.score)}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                              <div className="rounded-md border border-slate-200 bg-white p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Student answer</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{attempt.answerPreview}</p>
                              </div>
                              <div className="rounded-md border border-slate-200 bg-white p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">System review</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                                  {attempt.feedbackSummary || "No written review result was recorded for this attempt."}
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
                <h3 className="text-base font-bold text-slate-950">Evidence is still pending.</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  When a student answers an assigned question in Practice, their recent attempt
                  will appear here for this assignment only.
                </p>
              </div>
            )}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <p className="teacher-eyebrow">Teacher feedback notes</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">Respond to assignment evidence</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Save a private teacher note or explicitly send feedback to one student. Sent
                feedback appears only in that student&apos;s assigned work.
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
                            {student?.displayName || "Assignment note"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {sent
                              ? `Sent ${formatDateTime(note.sent_at)}`
                              : `Private note updated ${formatDateTime(note.updated_at)}`}
                          </p>
                        </div>
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-bold ring-1 ${
                            sent
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {sent ? "Sent to student" : "Private teacher note"}
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
                No feedback notes yet. Start with a private observation or send a focused next step
                to a student.
              </div>
            )}

            {assignment.studentProgressRows.length ? (
              <div className="divide-y divide-slate-100">
                {assignment.studentProgressRows.map((row) => (
                  <details className="group p-5" key={row.studentId}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="block font-semibold text-slate-950">
                          Write feedback for {row.displayName}
                        </span>
                        <span className="mt-1 block text-sm text-slate-600">
                          {row.practiceAttemptCount
                            ? `${row.practiceCorrectCount}/${row.practiceAttemptCount} correct in assignment-linked Practice`
                            : "No assignment Practice attempt yet"}
                        </span>
                      </span>
                      <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 group-open:bg-slate-50">
                        Add note
                      </span>
                    </summary>

                    <form className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                      <input name="assignmentId" type="hidden" value={assignment.id} />
                      <input name="classroomId" type="hidden" value={assignment.classroom.id} />
                      <input name="studentId" type="hidden" value={row.studentId} />
                      <div className="space-y-2">
                        <Label htmlFor={`feedback-body-${row.studentId}`}>Feedback note</Label>
                        <Textarea
                          id={`feedback-body-${row.studentId}`}
                          maxLength={4000}
                          name="body"
                          placeholder="Name the evidence, then give the student one clear next step."
                          required
                          rows={4}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="space-y-2 text-sm font-medium text-slate-900">
                          Attach question (optional)
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            defaultValue=""
                            name="questionId"
                          >
                            <option value="">Assignment-level feedback</option>
                            {attachableQuestions.map((questionRow) => (
                              <option
                                key={questionRow.assignmentItemId}
                                value={questionRow.question?.id ?? ""}
                              >
                                {questionRow.question?.title || "Assignment question"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-sm font-medium text-slate-900">
                          Attach recent attempt (optional)
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            defaultValue=""
                            name="practiceAttemptId"
                          >
                            <option value="">No attempt attachment</option>
                            {row.recentAttempts.map((attempt) => (
                              <option key={attempt.id} value={attempt.id}>
                                {attempt.questionTitle} - {formatDateTime(attempt.createdAt)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button formAction={savePrivateTeacherFeedbackNote} variant="outline">
                          Save private note
                        </Button>
                        <Button formAction={sendTeacherFeedbackNote}>
                          Send to student
                        </Button>
                      </div>
                      <p className="text-xs leading-5 text-slate-500">
                        Private notes are visible only to classroom managers. Sending does not expose
                        source-bank content, internal evidence, or other students&apos; work.
                      </p>
                    </form>
                  </details>
                ))}
              </div>
            ) : null}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                Assignment items
              </h2>
              <p className="teacher-muted">
                These are the selected questions students receive in My Work.
                Bank-sourced assignments do not expose the full teacher bank.
              </p>
            </div>
            {assignment.items.length ? (
              <div className="divide-y divide-slate-100">
                {assignment.items.map((item) => (
                  <article className="p-5" key={item.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Item {item.order_index} - {item.item_type}
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
                            "Question item"
                          )}
                        </h3>
                        {item.question ? (
                          <p className="text-sm leading-6 text-slate-600">
                            {item.question.question_code} - {item.question.question_type} -
                            difficulty {item.question.difficulty_rating}
                          </p>
                        ) : (
                          <p className="text-sm leading-6 text-slate-600">
                            This item references content that is no longer
                            available.
                          </p>
                        )}
                        {item.bank_question_id ? (
                          <p className="text-xs font-semibold text-sky-700">
                            Delivered from selected Question Bank item.
                          </p>
                        ) : null}
                      </div>
                      {item.points !== null ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {item.points} pts
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  No assignment items yet.
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Create a new assignment with published questions to populate
                  this list.
                </p>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Status</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {assignment.status === "assigned"
                ? "Assigned = visible to students in My Work."
                : "Draft = not visible to students."}
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">State</dt>
                <dd className="font-semibold capitalize text-slate-950">
                  {statusLabel(assignment.status)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Assigned</dt>
                <dd className="font-semibold text-slate-950">
                  {formatDateTime(assignment.assigned_at)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Due</dt>
                <dd className="font-semibold text-slate-950">
                  {formatDateTime(assignment.due_at)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Items</dt>
                <dd className="font-semibold text-slate-950">
                  {assignment.itemCount}
                </dd>
              </div>
            </dl>
          </section>

          {assignment.source_kind !== "manual" ? (
            <section className="teacher-panel p-5">
              <h2 className="text-lg font-bold text-slate-950">Assignment source</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {assignment.source_kind === "question_bank"
                  ? "This assignment was created from selected approved Question Bank items."
                  : "This assignment was created from a reviewed planning source."}
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Source</dt>
                  <dd className="font-semibold text-slate-950">
                    {sourceKindLabel(assignment.source_kind)}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-slate-500">Title</dt>
                  <dd className="font-semibold text-slate-950">
                    {summaryText(assignment.source_summary, "bankName") ||
                      summaryText(assignment.source_summary, "sourceTitle") ||
                      "Assignment source"}
                  </dd>
                </div>
                {assignment.source_kind === "question_bank" ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Bank visibility</dt>
                      <dd className="font-semibold capitalize text-slate-950">
                        {summaryText(assignment.source_summary, "bankVisibility") ||
                          "bank-scoped"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-slate-500">Student access</dt>
                      <dd className="font-semibold capitalize text-slate-950">
                        {summaryText(assignment.source_summary, "assignmentVisibility") ||
                          "assignment_only"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Source status</dt>
                    <dd className="font-semibold capitalize text-slate-950">
                      {summaryText(assignment.source_summary, "sourceStatus") || "unknown"}
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">
                    {assignment.source_kind === "question_bank"
                      ? "Selected items"
                      : "Published items"}
                  </dt>
                  <dd className="font-semibold text-slate-950">
                    {summaryText(assignment.source_summary, "itemCount") ||
                      summaryText(assignment.source_summary, "eligibleQuestionCount") ||
                      assignment.itemCount}
                  </dd>
                </div>
                {assignment.source_kind !== "question_bank" ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Needs review</dt>
                    <dd className="font-semibold text-slate-950">
                      {summaryText(assignment.source_summary, "unavailableQuestionCount") ||
                        "0"}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {assignment.source_kind === "question_bank" && assignment.source_record_id ? (
                <Button asChild className="mt-4 w-full" variant="outline">
                  <Link href={`/teacher/banks/${assignment.source_record_id}`}>
                    Open source bank
                  </Link>
                </Button>
              ) : assignment.source_record_id ? (
                <p className="mt-4 break-all font-mono text-xs text-slate-400">
                  {assignment.source_record_id}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Student handoff</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Assigned status makes this work visible to active class members in
              My Work. Draft assignments remain teacher-only.
            </p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href={`/student/work/${assignment.id}`}>
                Open student view
              </Link>
            </Button>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Student progress</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Practice sessions started from this assignment update these counts.
            </p>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Students</dt>
                <dd className="font-semibold text-slate-950">
                  {assignment.progressSummary.studentCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Not started</dt>
                <dd className="font-semibold text-slate-950">
                  {assignment.progressSummary.notStartedCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">In progress</dt>
                <dd className="font-semibold text-slate-950">
                  {assignment.progressSummary.inProgressCount}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Completed</dt>
                <dd className="font-semibold text-slate-950">
                  {assignment.progressSummary.completedCount}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-slate-500">Latest practice evidence</dt>
                <dd className="font-semibold text-slate-950">
                  {formatDateTime(assignment.progressSummary.latestPracticeSessionAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Instructions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {assignment.instructions || "No extra instructions."}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
