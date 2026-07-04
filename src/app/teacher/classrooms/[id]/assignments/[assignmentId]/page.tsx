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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
                        {item.question?.title ?? "Question item"}
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

        <aside className="space-y-6">
          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Status</h2>
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
