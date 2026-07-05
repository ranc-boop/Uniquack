import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherAssignmentDetail } from "@/lib/teacher-assignments";

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
  key: "sourceTitle" | "sourceStatus" | "eligibleQuestionCount" | "unavailableQuestionCount",
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

function evidenceSummaryLine(summary: unknown) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return "No practice evidence yet.";
  }

  const record = summary as Record<string, unknown>;
  const attempted = Number(record.attemptedQuestionCount ?? 0);
  const total = Number(record.totalQuestionCount ?? 0);
  const completedIds = Array.isArray(record.completedQuestionIds)
    ? record.completedQuestionIds.length
    : 0;

  if (attempted || total || completedIds) {
    return `${attempted || completedIds}/${total || "?"} question(s) with practice evidence`;
  }

  return "Practice evidence saved, details pending.";
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

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Assignment detail</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {assignment.classroom.name}
              {assignment.classroom.subject ? ` - ${assignment.classroom.subject}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          <section className="student-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                Student progress
              </h2>
              <p className="student-muted">
                One row per active classroom student, using assignment progress
                and linked Practice evidence.
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
                      <th className="px-5 py-3">Started</th>
                      <th className="px-5 py-3">Completed</th>
                      <th className="px-5 py-3">Practice evidence</th>
                      <th className="px-5 py-3">Latest activity</th>
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
                        <td className="px-5 py-4 text-slate-600">
                          {formatDateTime(row.startedAt)}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {formatDateTime(row.completedAt)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-700">
                            {evidenceSummaryLine(row.evidenceSummary)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.linkedPracticeSessionCount} linked session(s) -
                            {" "}
                            {row.practiceAttemptCount} attempt(s)
                            {row.practiceAttemptCount
                              ? `, ${row.practiceCorrectCount} correct`
                              : ""}
                          </p>
                          {row.lastPracticeSessionId ? (
                            <p className="mt-1 break-all font-mono text-xs text-slate-400">
                              {row.lastPracticeSessionId}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {formatDateTime(row.latestPracticeSessionAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="student-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                Assignment items
              </h2>
              <p className="student-muted">
                These are the published questions students receive in My Work.
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
          <section className="student-panel p-5">
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
            <section className="student-panel p-5">
              <h2 className="text-lg font-bold text-slate-950">Course Builder source</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This assignment was created from a reviewed Course Builder source.
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
                    {summaryText(assignment.source_summary, "sourceTitle") ||
                      "Course Builder source"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Source status</dt>
                  <dd className="font-semibold capitalize text-slate-950">
                    {summaryText(assignment.source_summary, "sourceStatus") || "unknown"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Published items</dt>
                  <dd className="font-semibold text-slate-950">
                    {summaryText(assignment.source_summary, "eligibleQuestionCount") ||
                      assignment.itemCount}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Needs review</dt>
                  <dd className="font-semibold text-slate-950">
                    {summaryText(assignment.source_summary, "unavailableQuestionCount") ||
                      "0"}
                  </dd>
                </div>
              </dl>
              {assignment.source_record_id ? (
                <p className="mt-4 break-all font-mono text-xs text-slate-400">
                  {assignment.source_record_id}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="student-panel p-5">
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

          <section className="student-panel p-5">
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

          <section className="student-panel p-5">
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
