import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getManagedClassroom,
  listTeacherClassroomAssignments,
} from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

type TeacherAssignmentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
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

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Teacher assignments</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Assign published Question Bank items to this classroom. Students
              see assigned work in My Work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/teacher/classrooms/${classroom.id}/assignments/new`}>
                New assignment
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}`}>
                Back to roster
              </Link>
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

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-950">
            Classroom assignments
          </h2>
          <p className="student-muted">
            Drafts stay teacher-side. Assigned work is visible to active
            students in this class.
          </p>
        </div>

        {assignments.length ? (
          <div className="divide-y divide-slate-100">
            {assignments.map((assignment) => (
              <Link
                className="block p-5 transition hover:bg-slate-50"
                href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                key={assignment.id}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-950">
                        {assignment.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                        {statusLabel(assignment.status)}
                      </span>
                    </div>
                    {assignment.instructions ? (
                      <p className="line-clamp-2 text-sm leading-6 text-slate-600">
                        {assignment.instructions}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                      <span>{assignment.itemCount} item(s)</span>
                      <span>Due {formatDate(assignment.due_at)}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">
                    Open details
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-3">
              <h3 className="text-base font-bold text-slate-950">
                No assignments yet
              </h3>
              <p className="text-sm leading-6 text-slate-600">
                Create the first assignment from published questions, then
                students in this class will see it in My Work.
              </p>
              <Button asChild>
                <Link href={`/teacher/classrooms/${classroom.id}/assignments/new`}>
                  Create assignment
                </Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
