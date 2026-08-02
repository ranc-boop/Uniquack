import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  listStudentAssignedWork,
  type StudentWorkSummary,
} from "@/lib/student-work";

export const dynamic = "force-dynamic";

type WorkGroup = {
  title: string;
  items: StudentWorkSummary[];
};

type UrgencyBucket =
  | "overdue"
  | "today"
  | "due_soon"
  | "in_progress"
  | "later";

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function startOfLocalDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calendarDaysUntil(value: string | null | undefined, now = new Date()) {
  if (!value) return null;
  const dueDay = startOfLocalDay(new Date(value)).getTime();
  const today = startOfLocalDay(now).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

function dueLabel(value: string | null | undefined, now = new Date()) {
  if (!value) return "No due date";
  const dueAt = new Date(value);
  const days = calendarDaysUntil(value, now);
  if (dueAt.getTime() < now.getTime()) {
    const overdueDays = Math.max(1, Math.abs(days ?? 0));
    return `Overdue by ${overdueDays} day(s)`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days !== null && days <= 7) return `Due in ${days} days`;
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

function urgencyBucket(
  assignment: StudentWorkSummary,
  now = new Date(),
): UrgencyBucket {
  if (assignment.due_at && new Date(assignment.due_at).getTime() < now.getTime()) {
    return "overdue";
  }
  const days = calendarDaysUntil(assignment.due_at, now);
  if (days === 0) return "today";
  if (days !== null && days > 0 && days <= 7) return "due_soon";
  if (assignment.progressStatus === "in_progress") return "in_progress";
  return "later";
}

const urgencyRank: Record<UrgencyBucket, number> = {
  overdue: 0,
  today: 1,
  due_soon: 2,
  in_progress: 3,
  later: 4,
};

function compareIncompleteWork(
  left: StudentWorkSummary,
  right: StudentWorkSummary,
  now: Date,
) {
  const rankDifference =
    urgencyRank[urgencyBucket(left, now)] - urgencyRank[urgencyBucket(right, now)];
  if (rankDifference !== 0) return rankDifference;

  const leftDue = left.due_at
    ? new Date(left.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  const rightDue = right.due_at
    ? new Date(right.due_at).getTime()
    : Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) return leftDue - rightDue;

  if (left.progressStatus !== right.progressStatus) {
    return left.progressStatus === "in_progress" ? -1 : 1;
  }
  return left.title.localeCompare(right.title);
}

function assignmentAction(assignment: StudentWorkSummary) {
  if (assignment.progressStatus === "completed") {
    return {
      href: `/student/work/${assignment.id}`,
      label: "Review work",
    };
  }
  if (assignment.itemCount > 0) {
    return {
      href: `/practice?assignmentId=${assignment.id}&returnTo=${encodeURIComponent("/student/work")}`,
      label: actionLabel(assignment.progressStatus),
    };
  }
  return {
    href: `/student/work/${assignment.id}`,
    label: "Open assignment",
  };
}

function AssignmentCard({ assignment }: { assignment: StudentWorkSummary }) {
  const action = assignmentAction(assignment);

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
          ) : null}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-slate-600">
            <span>{dueLabel(assignment.due_at)}</span>
            <span>{assignment.itemCount} question(s)</span>
          </div>
        </div>

        <Button asChild className="w-full lg:w-auto">
          <StudentPendingLink href={action.href}>{action.label}</StudentPendingLink>
        </Button>
      </div>
    </article>
  );
}

function NextAssignment({ assignment }: { assignment: StudentWorkSummary }) {
  const action = assignmentAction(assignment);

  return (
    <div className="mt-6 rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
            Do this next
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
            {assignment.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {assignment.classroomName}
            {assignment.classroomSubject ? ` - ${assignment.classroomSubject}` : ""}
            {" · "}
            {dueLabel(assignment.due_at)}
          </p>
          {assignment.instructions ? (
            <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-slate-600">
              {assignment.instructions}
            </p>
          ) : null}
        </div>
        <Button asChild className="w-full shrink-0 lg:w-auto">
          <StudentPendingLink href={action.href}>{action.label}</StudentPendingLink>
        </Button>
      </div>
    </div>
  );
}

function WorkSection({ group }: { group: WorkGroup }) {
  return (
    <section className="student-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{group.title}</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {group.items.length}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        {group.items.map((assignment) => (
          <AssignmentCard assignment={assignment} key={assignment.id} />
        ))}
      </div>
    </section>
  );
}

function CompletedSection({ assignments }: { assignments: StudentWorkSummary[] }) {
  return (
    <section className="student-panel overflow-hidden">
      <details>
        <summary className="student-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Completed</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            {assignments.length}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-5">
          {assignments.map((assignment) => (
            <AssignmentCard assignment={assignment} key={assignment.id} />
          ))}
        </div>
      </details>
    </section>
  );
}

export default async function StudentWorkPage() {
  const profile = await requireStudentWorkspace();
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });

  const now = new Date();
  const incomplete = assignments
    .filter((assignment) => assignment.progressStatus !== "completed")
    .sort((left, right) => compareIncompleteWork(left, right, now));
  const completed = assignments.filter(
    (assignment) => assignment.progressStatus === "completed",
  );
  const nextAssignment = incomplete[0] ?? null;
  const queuedIncomplete = nextAssignment
    ? incomplete.filter((assignment) => assignment.id !== nextAssignment.id)
    : incomplete;
  const groups: WorkGroup[] = [
    {
      title: "Overdue",
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "overdue",
      ),
    },
    {
      title: "Due today",
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "today",
      ),
    },
    {
      title: "Due soon",
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "due_soon",
      ),
    },
    {
      title: "In progress",
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "in_progress",
      ),
    },
    {
      title: "Ready later",
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "later",
      ),
    },
  ].filter((group) => group.items.length > 0);
  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Student workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              My Work
            </h1>
          </div>
          <Button asChild variant="outline">
            <StudentPendingLink href="/student/classrooms">My classes</StudentPendingLink>
          </Button>
        </div>

        {nextAssignment ? (
          <NextAssignment assignment={nextAssignment} />
        ) : assignments.length ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-900">
              All assigned work is complete.
            </p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              Finished assignments remain available below when you want to review them.
            </p>
          </div>
        ) : null}
      </section>

      {assignments.length ? (
        <>
          {groups.map((group) => (
            <WorkSection group={group} key={group.title} />
          ))}
          {completed.length ? <CompletedSection assignments={completed} /> : null}
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
                <StudentPendingLink href="/student/classrooms">
                  View my classes
                </StudentPendingLink>
              </Button>
              <Button asChild variant="outline">
                <StudentPendingLink href="/student/classrooms/join">
                  Join a class
                </StudentPendingLink>
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
