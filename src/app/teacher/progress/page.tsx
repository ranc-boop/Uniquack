import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  School,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherProgressSummary,
  type TeacherProgressAssignment,
  type TeacherProgressAttentionReason,
  type TeacherProgressSummary,
} from "@/lib/teacher-progress";

export const dynamic = "force-dynamic";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No activity yet";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function assignmentStatusLabel(status: TeacherProgressAssignment["status"]) {
  if (status === "assigned") return "Assigned";
  if (status === "draft") return "Draft";
  return "Archived";
}

function attentionReasonLabel(reason: TeacherProgressAttentionReason) {
  if (reason === "overdue") return "Overdue";
  if (reason === "due_soon") return "Due soon";
  if (reason === "high_wrong_rate") return "Wrong-answer pattern";
  return "Low completion";
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

function ProgressCounts({ assignment }: { assignment: TeacherProgressAssignment }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {assignment.completedCount}
        </span>
        <span className="text-xs text-slate-500">Done</span>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {assignment.inProgressCount}
        </span>
        <span className="text-xs text-slate-500">Active</span>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
        <span className="block font-bold tabular-nums text-slate-950">
          {assignment.notStartedCount}
        </span>
        <span className="text-xs text-slate-500">Not started</span>
      </div>
    </div>
  );
}

function AssignmentStatusBadge({ assignment }: { assignment: TeacherProgressAssignment }) {
  const isAssigned = assignment.status === "assigned";

  return (
    <span
      className={
        isAssigned
          ? "inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800"
          : "inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
      }
    >
      {assignmentStatusLabel(assignment.status)}
    </span>
  );
}

function AssignmentProgressSection({ progress }: { progress: TeacherProgressSummary }) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Assignment progress</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Cross-class completion from active rosters and assignment-linked Practice evidence.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/teacher/publish">Create assignment</Link>
        </Button>
      </div>

      {progress.assignments.length ? (
        <>
          <div className="hidden lg:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="w-[26%] px-5 py-3">Assignment</th>
                  <th className="w-[14%] px-3 py-3">Status / due</th>
                  <th className="w-[10%] px-3 py-3">Students</th>
                  <th className="w-[27%] px-3 py-3">Progress</th>
                  <th className="w-[15%] px-3 py-3">Latest activity</th>
                  <th className="w-[8%] px-3 py-3 text-right">Open</th>
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
                      <AssignmentStatusBadge assignment={assignment} />
                      <p className="mt-2 text-xs text-slate-500">
                        Due {formatDate(assignment.dueAt)}
                      </p>
                    </td>
                    <td className="px-3 py-4 font-semibold tabular-nums text-slate-950">
                      {assignment.studentCount}
                    </td>
                    <td className="px-3 py-4">
                      {assignment.status === "assigned" ? (
                        <ProgressCounts assignment={assignment} />
                      ) : (
                        <p className="text-xs leading-5 text-slate-500">
                          Draft work is not visible to students.
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4 text-xs leading-5 text-slate-600">
                      {formatDateTime(assignment.latestActivityAt)}
                    </td>
                    <td className="px-3 py-4 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                        >
                          View
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 lg:hidden">
            {progress.assignments.map((assignment) => (
              <article className="space-y-4 p-5" key={assignment.assignmentId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold text-slate-950">
                      {assignment.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-600">{assignment.classroomName}</p>
                  </div>
                  <AssignmentStatusBadge assignment={assignment} />
                </div>
                {assignment.status === "assigned" ? (
                  <ProgressCounts assignment={assignment} />
                ) : (
                  <p className="text-sm leading-6 text-slate-500">
                    Draft work is teacher-only and has no student evidence yet.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                  <span>Due {formatDate(assignment.dueAt)}</span>
                  <span>{assignment.studentCount} students</span>
                  <span>{formatDateTime(assignment.latestActivityAt)}</span>
                </div>
                <Button asChild className="w-full" size="sm" variant="outline">
                  <Link
                    href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                  >
                    Open assignment detail
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
            actionLabel="Create assignment"
            description="Select reviewed Library items and assign them to a classroom to begin collecting evidence."
            title="No assigned work yet"
          />
        </div>
      ) : (
        <div className="p-5">
          <EmptyState
            actionHref="/teacher/classrooms"
            actionLabel="Create classroom"
            description="Create a classroom roster before delivering reviewed Library content."
            title="No classrooms yet"
          />
        </div>
      )}
    </section>
  );
}

export default async function TeacherProgressPage() {
  await requireTeacher();
  const supabase = await createClient();
  const summary = await getTeacherProgressSummary({ supabase });
  const completionLabel =
    summary.overview.completionRate === null
      ? "No assigned roster yet"
      : `${summary.overview.completionRate}%`;
  const assignmentProgress = summary;

  return (
    <TeacherWorkspaceShell
      eyebrow="Teacher evidence"
      title="Progress / Feedback"
      description="Read classroom and assignment evidence after students work through teacher-delivered Practice."
      actions={
        <>
          <Button asChild>
            <Link href="/teacher/classrooms">Open classrooms</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/publish">Create assignment</Link>
          </Button>
        </>
      }
    >
      <TeacherWorkspaceNav />

      <section className="grid gap-3 md:grid-cols-3">
        {[
          "Assignment and classroom evidence only.",
          "Private student self-study is not included.",
          "Source Libraries remain private.",
        ].map((message) => (
          <div
            className="rounded-lg border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm font-semibold leading-6 text-sky-950"
            key={message}
          >
            {message}
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          detail="Active roster and delivery spaces"
          icon={School}
          label="Active classes"
          value={formatNumber(summary.overview.activeClassroomCount)}
        />
        <SummaryCard
          detail={`${formatNumber(summary.overview.draftAssignmentCount)} drafts saved`}
          icon={BookOpenCheck}
          label="Active assignments"
          value={formatNumber(summary.overview.activeAssignmentCount)}
        />
        <SummaryCard
          detail={`${formatNumber(summary.overview.completedStudentSlotCount)} of ${formatNumber(summary.overview.assignedStudentSlotCount)} student assignments complete`}
          icon={CheckCircle2}
          label="Completion rate"
          value={completionLabel}
        />
        <SummaryCard
          detail="Across assigned classroom work"
          icon={AlertTriangle}
          label="Students needing attention"
          value={formatNumber(summary.overview.studentsNeedingAttentionCount)}
        />
        <SummaryCard
          detail="Assignment-linked sessions in the last 14 days"
          icon={Activity}
          label="Recent evidence"
          value={formatNumber(summary.overview.recentEvidenceCount)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-950">Needs attention</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Due dates, low completion, and recent wrong-answer patterns across active classes.
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
                        {assignment.classroomName} · Due {formatDate(assignment.dueAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {assignment.reasons.map((reason) => (
                        <span
                          className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
                          key={reason}
                        >
                          {attentionReasonLabel(reason)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {assignment.inProgressCount + assignment.notStartedCount}
                      </span>
                      <span className="text-xs text-slate-500">Incomplete</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {assignment.completionRate ?? 0}%
                      </span>
                      <span className="text-xs text-slate-500">Completion</span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <span className="block font-bold tabular-nums text-slate-950">
                        {assignment.recentWrongCount}/{assignment.recentAttemptCount}
                      </span>
                      <span className="text-xs text-slate-500">Wrong / attempts</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-500">
                      {assignment.studentsNeedingAttentionCount} students in this signal
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
                      >
                        Open assignment detail
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
                actionLabel="Review classrooms"
                description="No current due-date, completion, or wrong-answer signals require attention."
                title="No attention signals right now"
              />
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                actionHref={summary.hasClassrooms ? "/teacher/publish" : "/teacher/classrooms"}
                actionLabel={summary.hasClassrooms ? "Create assignment" : "Create classroom"}
                description="Attention signals appear after reviewed Library content is assigned to active classroom students."
                title="No assigned work yet"
              />
            </div>
          )}
        </section>

        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-950">Recent evidence</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Latest assignment-linked Practice sessions, newest first.
            </p>
          </div>
          {summary.recentEvidence.length ? (
            <div className="divide-y divide-slate-100">
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
                      {evidence.correctCount}/{evidence.totalAttemptCount} correct
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{evidence.wrongCount} wrong</span>
                    <span>{formatDateTime(evidence.latestActivityAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                actionHref={summary.hasAssignedWork ? "/teacher/classrooms" : "/teacher/publish"}
                actionLabel={summary.hasAssignedWork ? "Open classrooms" : "Create assignment"}
                description="Evidence arrives here after students start Practice from assigned work."
                title="No evidence yet"
              />
            </div>
          )}
        </section>
      </section>

      <AssignmentProgressSection progress={assignmentProgress} />

      <section className="teacher-soft-panel p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-white text-sky-700">
            <Users aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-sky-950">Evidence boundary</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-sky-900">
              Progress here is limited to classroom assignments and their linked Practice sessions.
              Private student self-study stays private, and students never receive source Library access through this page.
              Open an assignment detail to save a private note or send feedback to an active student.
            </p>
          </div>
        </div>
      </section>
    </TeacherWorkspaceShell>
  );
}
