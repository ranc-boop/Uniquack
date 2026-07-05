import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  listStudentAssignedWork,
  type StudentWorkSummary,
} from "@/lib/student-work";

export const dynamic = "force-dynamic";

type WorkGroup = {
  title: string;
  description: string;
  empty: string;
  items: StudentWorkSummary[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  const due = new Date(value).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today.getTime()) / 86_400_000);
}

function dueLabel(value: string | null | undefined) {
  const days = daysUntil(value);
  if (days === null) return "No due date";
  if (days < 0) return `Overdue by ${Math.abs(days)} day(s)`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 7) return `Due in ${days} days`;
  return `Due ${formatDate(value)}`;
}

function statusLabel(status: StudentWorkSummary["progressStatus"]) {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Not started";
}

function actionLabel(status: StudentWorkSummary["progressStatus"]) {
  if (status === "in_progress") return "Continue Practice";
  if (status === "completed") return "Review work";
  return "Start Practice";
}

function statusClasses(status: StudentWorkSummary["progressStatus"]) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "in_progress") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function isDueSoon(assignment: StudentWorkSummary) {
  const days = daysUntil(assignment.due_at);
  return (
    assignment.progressStatus !== "completed" &&
    assignment.progressStatus !== "in_progress" &&
    days !== null &&
    days <= 7
  );
}

function AssignmentCard({ assignment }: { assignment: StudentWorkSummary }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full overflow-hidden text-ellipsis text-base font-bold text-slate-950">
              {assignment.title}
            </h3>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(
                assignment.progressStatus,
              )}`}
            >
              {statusLabel(assignment.progressStatus)}
            </span>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            {assignment.classroomName}
            {assignment.classroomSubject ? ` - ${assignment.classroomSubject}` : ""}
          </p>

          {assignment.instructions ? (
            <p className="line-clamp-2 text-sm leading-6 text-slate-600">
              {assignment.instructions}
            </p>
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              No extra instructions from the teacher.
            </p>
          )}

          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Due
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {dueLabel(assignment.due_at)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Items
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {assignment.itemCount} question(s)
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Progress
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {statusLabel(assignment.progressStatus)}
              </dd>
            </div>
          </dl>
        </div>

        <Button asChild className="w-full lg:w-auto">
          <Link href={`/student/work/${assignment.id}`}>
            {actionLabel(assignment.progressStatus)}
          </Link>
        </Button>
      </div>
    </article>
  );
}

function WorkSection({ group }: { group: WorkGroup }) {
  return (
    <section className="student-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{group.title}</h2>
            <p className="student-muted">{group.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {group.items.length}
          </span>
        </div>
      </div>
      {group.items.length ? (
        <div className="grid gap-4 p-5">
          {group.items.map((assignment) => (
            <AssignmentCard assignment={assignment} key={assignment.id} />
          ))}
        </div>
      ) : (
        <div className="p-5 text-sm leading-6 text-slate-600">{group.empty}</div>
      )}
    </section>
  );
}

export default async function StudentWorkPage() {
  const profile = await requireStudent();
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });

  const dueSoon = assignments.filter(isDueSoon);
  const dueSoonIds = new Set(dueSoon.map((assignment) => assignment.id));
  const inProgress = assignments.filter(
    (assignment) => assignment.progressStatus === "in_progress",
  );
  const notStarted = assignments.filter(
    (assignment) =>
      assignment.progressStatus === "not_started" && !dueSoonIds.has(assignment.id),
  );
  const completed = assignments.filter(
    (assignment) => assignment.progressStatus === "completed",
  );
  const groups: WorkGroup[] = [
    {
      title: "Due soon",
      description: "Assignments that need attention this week.",
      empty: "No urgent due dates right now.",
      items: dueSoon,
    },
    {
      title: "In progress",
      description: "Pick up where your last Practice session stopped.",
      empty: "No assignments are currently in progress.",
      items: inProgress,
    },
    {
      title: "Not started",
      description: "Ready assignments that have not entered Practice yet.",
      empty: "No not-started assignments.",
      items: notStarted,
    },
    {
      title: "Completed",
      description: "Finished work stays here for review.",
      empty: "Completed work history will appear here.",
      items: completed,
    },
  ];

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Student workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              My Work
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Start, continue, and review classroom assignments from one place.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/classrooms">My classes</Link>
          </Button>
        </div>
      </section>

      {assignments.length ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["Due soon", dueSoon.length],
              ["In progress", inProgress.length],
              ["Not started", notStarted.length],
              ["Completed", completed.length],
            ].map(([label, count]) => (
              <div
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                key={label}
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{count}</p>
              </div>
            ))}
          </section>

          {groups.map((group) => (
            <WorkSection group={group} key={group.title} />
          ))}
        </>
      ) : (
        <section className="student-panel flex min-h-72 items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                No assigned work yet
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                When a teacher assigns classroom work, it will appear here with
                due dates, progress, and a Practice entry point.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/student/classrooms">View my classes</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/student/classrooms/join">Join a class</Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
