import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ClassroomPublishCta,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getAssignmentDeliveryQuarantine,
  getManagedClassroom,
  listTeacherClassroomAssignments,
  type TeacherAssignmentSummary,
} from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

type TeacherAssignmentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

type AssignmentGroup = {
  description: string;
  empty: string;
  items: TeacherAssignmentSummary[];
  title: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
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

function statusLabel(status: string) {
  if (status === "assigned") return "Assigned";
  if (status === "draft") return "Draft";
  if (status === "archived") return "Archived";
  return status.replace(/_/g, " ");
}

function statusClasses(status: string) {
  if (status === "assigned") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "draft") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function AssignmentCard({
  assignment,
  classroomId,
}: {
  assignment: TeacherAssignmentSummary;
  classroomId: string;
}) {
  const progressSummary = assignment.progressSummary;
  const isDeliveryPaused = Boolean(
    getAssignmentDeliveryQuarantine(assignment.source_summary),
  );
  const displayStatus = isDeliveryPaused ? "paused" : assignment.status;

  return (
    <Link
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      href={`/teacher/classrooms/${classroomId}/assignments/${assignment.id}`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full break-words text-base font-bold text-slate-950">
              {assignment.title}
            </h3>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(
                displayStatus,
              )}`}
            >
              {isDeliveryPaused ? "Delivery paused" : statusLabel(assignment.status)}
            </span>
          </div>
          {assignment.instructions ? (
            <p className="line-clamp-2 text-sm leading-6 text-slate-600">
              {assignment.instructions}
            </p>
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              No student instructions yet.
            </p>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Due
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatDate(assignment.due_at)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Items
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {assignment.itemCount}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Completed
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {progressSummary.completedCount}/{progressSummary.studentCount}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Latest activity
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatDateTime(progressSummary.latestPracticeSessionAt)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="grid min-w-full grid-cols-3 gap-2 text-center xl:min-w-56">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {progressSummary.notStartedCount}
            </span>
            <span className="text-xs text-slate-500">Not started</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {progressSummary.inProgressCount}
            </span>
            <span className="text-xs text-slate-500">Active</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {progressSummary.completedCount}
            </span>
            <span className="text-xs text-slate-500">Done</span>
          </div>
          <span className="col-span-3 text-sm font-semibold text-blue-700">
            Open progress
          </span>
        </div>
      </div>
    </Link>
  );
}

function AssignmentSection({
  classroomId,
  group,
}: {
  classroomId: string;
  group: AssignmentGroup;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{group.title}</h2>
            <p className="teacher-muted">{group.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {group.items.length}
          </span>
        </div>
      </div>
      {group.items.length ? (
        <div className="grid gap-4 p-5">
          {group.items.map((assignment) => (
            <AssignmentCard
              assignment={assignment}
              classroomId={classroomId}
              key={assignment.id}
            />
          ))}
        </div>
      ) : (
        <div className="p-5 text-sm leading-6 text-slate-600">{group.empty}</div>
      )}
    </section>
  );
}

export default async function TeacherAssignmentsPage({
  params,
  searchParams,
}: TeacherAssignmentsPageProps) {
  await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  let classroom;
  let assignments;

  try {
    classroom = await getManagedClassroom({ classroomId: id, supabase });
    assignments = await listTeacherClassroomAssignments({
      classroomId: id,
      supabase,
    });
  } catch {
    notFound();
  }

  const paused = assignments.filter((assignment) =>
    Boolean(getAssignmentDeliveryQuarantine(assignment.source_summary)),
  );
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const draft = assignments.filter(
    (assignment) =>
      assignment.status === "draft" &&
      !getAssignmentDeliveryQuarantine(assignment.source_summary),
  );
  const archived = assignments.filter((assignment) => assignment.status === "archived");
  const groups: AssignmentGroup[] = [
    {
      title: "Delivery paused",
      description:
        "Review-gated work withdrawn from students without deleting progress. Open an item for recovery steps.",
      empty: "No Assignment delivery is paused.",
      items: paused,
    },
    {
      title: "Assigned",
      description: "Visible in Student My Work for active class members.",
      empty: "No assigned work is live for students yet.",
      items: assigned,
    },
    {
      title: "Draft",
      description: "Teacher-only assignments that are not visible to students.",
      empty: "No teacher-side drafts.",
      items: draft,
    },
    {
      title: "Archived",
      description: "Older assignments kept for reference.",
      empty: "No archived assignments.",
      items: archived,
    },
  ];
  const latestActivity =
    assignments
      .map((assignment) => assignment.progressSummary.latestPracticeSessionAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Teacher assignments</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Assignments are class delivery history. Publish new bank work from
              the top-level Publish module, or use the compatibility shortcut
              when needed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">Teacher Studio</Link>
            </Button>
            {classroom.status === "active" ? (
              <>
                <ClassroomPublishCta classroomId={classroom.id} />
                <Button asChild>
                  <Link href={`/teacher/publish?classroomId=${classroom.id}`}>
                    Publish new work
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                  Reopen before publishing
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}`}>
                Back to roster
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Assignment visibility:</strong> these
        assignments expose selected question items to students. Assignment
        visibility is not global publishing. Use Publish for the primary
        distribute-work path.
      </section>
      {classroom.status === "archived" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This classroom is archived. Historical assignments remain readable,
          but new publishing targets are blocked until the classroom is reopened.
        </section>
      ) : null}

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

      {assignments.length ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["Assigned", assigned.length],
              ["Paused", paused.length],
              ["Draft", draft.length],
              ["Archived", archived.length],
              ["Latest activity", formatDateTime(latestActivity)],
            ].map(([label, value]) => (
              <div
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                key={label}
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 break-words text-2xl font-bold text-slate-950">
                  {value}
                </p>
              </div>
            ))}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                Classroom assignments
              </h2>
              <p className="teacher-muted">
                Drafts stay teacher-side. Assigned work is visible only to
                active students in this class.
              </p>
            </div>
            <div className="p-5 text-sm leading-6 text-slate-600">
              Use the status sections below to review live work, teacher drafts,
              and archived assignments.
            </div>
          </section>

          {groups.map((group) => (
            <AssignmentSection
              classroomId={classroom.id}
              group={group}
              key={group.title}
            />
          ))}
        </>
      ) : (
        <section className="teacher-panel flex min-h-72 items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                No assignments yet
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Create the first assignment from published questions, then
                students in this class will see assigned work in My Work.
              </p>
            </div>
            {classroom.status === "active" ? (
              <Button asChild>
                <Link href={`/teacher/publish?classroomId=${classroom.id}`}>
                  Publish new work
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                  Reopen before publishing
                </Link>
              </Button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
