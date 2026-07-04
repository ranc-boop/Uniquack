import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getStudentAssignedWorkDetail } from "@/lib/student-work";

export const dynamic = "force-dynamic";

type StudentWorkDetailPageProps = {
  params: Promise<{ id: string }>;
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

export default async function StudentWorkDetailPage({
  params,
}: StudentWorkDetailPageProps) {
  const profile = await requireStudent();
  const { id } = await params;
  const supabase = await createClient();
  const assignment = await getStudentAssignedWorkDetail({
    assignmentId: id,
    studentId: profile.id,
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
            <p className="student-eyebrow">Assigned work</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {assignment.classroomName}
              {assignment.classroomSubject ? ` · ${assignment.classroomSubject}` : ""}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/work">Back to My Work</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="student-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Assignment items
            </h2>
            <p className="student-muted">
              Review the assigned questions, then enter Practice when you are
              ready to work.
            </p>
          </div>
          {assignment.items.length ? (
            <div className="divide-y divide-slate-100">
              {assignment.items.map((item) => (
                <article className="p-5" key={item.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        Item {item.order_index} · {item.item_type}
                      </p>
                      <h3 className="text-base font-bold text-slate-950">
                        {item.question?.title ?? "Question item"}
                      </h3>
                      {item.question ? (
                        <p className="text-sm leading-6 text-slate-600">
                          {item.question.question_code} ·{" "}
                          {item.question.question_type} · difficulty{" "}
                          {item.question.difficulty_rating}
                        </p>
                      ) : (
                        <p className="text-sm leading-6 text-slate-600">
                          This item is ready for a future content type.
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
                Your teacher has assigned this work, but the item list is still
                being prepared.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Progress</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold capitalize text-slate-950">
                  {statusLabel(assignment.progressStatus)}
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
            <h2 className="text-lg font-bold text-slate-950">Practice entry</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Practice integration coming next. For now, open Practice with this
              assignment context and continue from the learning engine.
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href={`/practice?assignmentId=${assignment.id}`}>
                Open Practice
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
