import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { formatDate, formatNumber, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
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

function dueLabel(locale: Locale, value: string | null | undefined, now = new Date()) {
  if (!value) return translate(locale, "work.noDueDate");
  const dueAt = new Date(value);
  const days = calendarDaysUntil(value, now);
  if (dueAt.getTime() < now.getTime()) {
    const overdueDays = Math.max(1, Math.abs(days ?? 0));
    return translate(locale, "work.overdueBy", { count: formatNumber(locale, overdueDays) });
  }
  if (days === 0) return translate(locale, "work.dueToday");
  if (days === 1) return translate(locale, "work.dueTomorrow");
  if (days !== null && days <= 7) return translate(locale, "work.dueInDays", { count: formatNumber(locale, days) });
  return translate(locale, "work.dueOn", { date: formatDate(locale, value) });
}

function statusLabel(locale: Locale, status: StudentWorkSummary["progressStatus"]) {
  if (status === "in_progress") return translate(locale, "student.inProgress");
  if (status === "completed") return translate(locale, "student.completed");
  return translate(locale, "work.notStarted");
}

function actionLabel(locale: Locale, status: StudentWorkSummary["progressStatus"]) {
  if (status === "in_progress") return translate(locale, "work.continuePractice");
  if (status === "completed") return translate(locale, "work.reviewWork");
  return translate(locale, "student.startPractice");
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

function assignmentAction(locale: Locale, assignment: StudentWorkSummary) {
  if (assignment.progressStatus === "completed") {
    return {
      href: `/student/work/${assignment.id}`,
      label: translate(locale, "work.reviewWork"),
    };
  }
  if (assignment.itemCount > 0) {
    return {
      href: `/practice?assignmentId=${assignment.id}&returnTo=${encodeURIComponent("/student/work")}`,
      label: actionLabel(locale, assignment.progressStatus),
    };
  }
  return {
    href: `/student/work/${assignment.id}`,
    label: translate(locale, "work.openAssignment"),
  };
}

function AssignmentCard({ assignment, locale }: { assignment: StudentWorkSummary; locale: Locale }) {
  const action = assignmentAction(locale, assignment);

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
              {statusLabel(locale, assignment.progressStatus)}
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
            <span>{dueLabel(locale, assignment.due_at)}</span>
            <span>{translate(locale, "work.questions", { count: formatNumber(locale, assignment.itemCount) })}</span>
          </div>
        </div>

        <Button asChild className="w-full lg:w-auto">
          <StudentPendingLink href={action.href}>{action.label}</StudentPendingLink>
        </Button>
      </div>
    </article>
  );
}

function NextAssignment({ assignment, locale }: { assignment: StudentWorkSummary; locale: Locale }) {
  const action = assignmentAction(locale, assignment);

  return (
    <div className="mt-6 rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
            {translate(locale, "work.doNext")}
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950">
            {assignment.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {assignment.classroomName}
            {assignment.classroomSubject ? ` - ${assignment.classroomSubject}` : ""}
            {" · "}
            {dueLabel(locale, assignment.due_at)}
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

function WorkSection({ group, locale }: { group: WorkGroup; locale: Locale }) {
  return (
    <section className="student-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{group.title}</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {formatNumber(locale, group.items.length)}
          </span>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        {group.items.map((assignment) => (
          <AssignmentCard assignment={assignment} key={assignment.id} locale={locale} />
        ))}
      </div>
    </section>
  );
}

function CompletedSection({ assignments, locale }: { assignments: StudentWorkSummary[]; locale: Locale }) {
  return (
    <section className="student-panel overflow-hidden">
      <details>
        <summary className="student-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{translate(locale, "student.completed")}</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
            {formatNumber(locale, assignments.length)}
          </span>
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-5">
          {assignments.map((assignment) => (
            <AssignmentCard assignment={assignment} key={assignment.id} locale={locale} />
          ))}
        </div>
      </details>
    </section>
  );
}

export default async function StudentWorkPage() {
  const [profile, locale] = await Promise.all([requireStudentWorkspace(), getRequestLocale()]);
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
      title: translate(locale, "work.overdue"),
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "overdue",
      ),
    },
    {
      title: translate(locale, "work.dueToday"),
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "today",
      ),
    },
    {
      title: translate(locale, "student.dueSoon"),
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "due_soon",
      ),
    },
    {
      title: translate(locale, "student.inProgress"),
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "in_progress",
      ),
    },
    {
      title: translate(locale, "work.readyLater"),
      items: queuedIncomplete.filter(
        (assignment) => urgencyBucket(assignment, now) === "later",
      ),
    },
  ].filter((group) => group.items.length > 0);
  return (
    <main className="space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {translate(locale, "student.myWork")}
            </h1>
          </div>
          <Button asChild variant="outline">
            <StudentPendingLink href="/student/classrooms">{translate(locale, "student.myClasses")}</StudentPendingLink>
          </Button>
        </div>

        {nextAssignment ? (
          <NextAssignment assignment={nextAssignment} locale={locale} />
        ) : assignments.length ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-bold text-emerald-900">
              {translate(locale, "work.allComplete")}
            </p>
            <p className="mt-1 text-sm leading-6 text-emerald-800">
              {translate(locale, "work.allCompleteDescription")}
            </p>
          </div>
        ) : null}
      </section>

      {assignments.length ? (
        <>
          {groups.map((group) => (
            <WorkSection group={group} key={group.title} locale={locale} />
          ))}
          {completed.length ? <CompletedSection assignments={completed} locale={locale} /> : null}
        </>
      ) : (
        <section className="student-panel flex min-h-72 items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {translate(locale, "work.emptyTitle")}
              </h2>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <StudentPendingLink href="/student/classrooms">
                  {translate(locale, "work.viewClasses")}
                </StudentPendingLink>
              </Button>
              <Button asChild variant="outline">
                <StudentPendingLink href="/student/classrooms/join">
                  {translate(locale, "work.joinClass")}
                </StudentPendingLink>
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
