import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listStudentAssignedWork } from "@/lib/student-work";

export const dynamic = "force-dynamic";

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export default async function StudentWorkPage() {
  const profile = await requireStudent();
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });

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
              See assigned classroom work here. Practice stays the learning
              engine; My Work tells you what to do next.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/classrooms">My classes</Link>
          </Button>
        </div>
      </section>

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <h2 className="text-lg font-bold text-slate-950">Assigned work</h2>
          <p className="student-muted">
            Work appears only for classrooms where your membership is active.
          </p>
        </div>

        {assignments.length ? (
          <div className="divide-y divide-slate-100">
            {assignments.map((assignment) => (
              <article className="p-5" key={assignment.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-950">
                        {assignment.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                        {statusLabel(assignment.progressStatus)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">
                      {assignment.classroomName}
                      {assignment.classroomSubject
                        ? ` · ${assignment.classroomSubject}`
                        : ""}
                    </p>
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
                  <Button asChild>
                    <Link href={`/student/work/${assignment.id}`}>Open work</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-3">
              <h3 className="text-base font-bold text-slate-950">
                No assigned work yet
              </h3>
              <p className="text-sm leading-6 text-slate-600">
                When a teacher assigns classroom work, it will appear here with
                due dates, progress, and a Practice entry point.
              </p>
              <Button asChild variant="outline">
                <Link href="/student/classrooms">View my classes</Link>
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
