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

function statusLabel(status: "not_started" | "in_progress" | "completed") {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Not started";
}

function actionLabel(status: "not_started" | "in_progress" | "completed") {
  if (status === "in_progress") return "Continue Practice";
  if (status === "completed") return "Review Practice";
  return "Start Practice";
}

function stateCopy(status: "not_started" | "in_progress" | "completed") {
  if (status === "completed") {
    return {
      title: "Completed work history",
      body: "This assignment is finished. You can review the questions and reopen Practice if your teacher asks for more work.",
    };
  }
  if (status === "in_progress") {
    return {
      title: "Practice in progress",
      body: "Continue the assignment-linked Practice session. Your evidence updates this work item.",
    };
  }
  return {
    title: "Ready to start",
    body: "Open Practice when you are ready. Progress is saved back to this assignment.",
  };
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

  const usableQuestionItems = assignment.items.filter(
    (item) => item.item_type === "question" && item.question_id && item.question,
  );
  const hasPracticeEntry = usableQuestionItems.length > 0;
  const currentState = stateCopy(assignment.progressStatus);

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
              {assignment.classroomSubject ? ` - ${assignment.classroomSubject}` : ""}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/work">Back to My Work</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Status</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {statusLabel(assignment.progressStatus)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Due date</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {formatDateTime(assignment.due_at)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Practice items</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {usableQuestionItems.length} of {assignment.itemCount}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Last update</p>
          <p className="mt-2 text-lg font-bold text-slate-950">
            {formatDateTime(assignment.progress?.updated_at)}
          </p>
        </div>
      </section>

      {assignment.source_kind === "question_bank" ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
          <strong className="font-bold">Assigned from your teacher&apos;s bank:</strong>{" "}
          you can work on the selected questions here, but the full teacher
          bank stays private.
        </section>
      ) : null}

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
                        Item {item.order_index} - {item.item_type}
                      </p>
                      <h3 className="text-base font-bold text-slate-950">
                        {item.question?.title ?? "Question item unavailable"}
                      </h3>
                      {item.question ? (
                        <p className="break-words text-sm leading-6 text-slate-600">
                          {item.question.question_code} - {item.question.question_type} -
                          difficulty {item.question.difficulty_rating}
                        </p>
                      ) : (
                        <p className="text-sm leading-6 text-slate-600">
                          This item cannot open in Practice yet because it is
                          not linked to a usable question.
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
                No usable question items yet
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
            <h2 className="text-lg font-bold text-slate-950">
              {currentState.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {currentState.body}
            </p>
            {assignment.progress?.started_at ? (
              <p className="mt-3 text-xs font-medium text-slate-500">
                Started {formatDateTime(assignment.progress.started_at)}
              </p>
            ) : null}
            {assignment.progress?.completed_at ? (
              <p className="mt-1 text-xs font-medium text-slate-500">
                Completed {formatDateTime(assignment.progress.completed_at)}
              </p>
            ) : null}
          </section>

          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Practice entry</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Practice progress is saved back to this work item.
            </p>
            {hasPracticeEntry ? (
              <Button asChild className="mt-4 w-full">
                <Link href={`/practice?assignmentId=${assignment.id}`}>
                  {actionLabel(assignment.progressStatus)} for this assignment
                </Link>
              </Button>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                Practice entry unavailable because this assignment has no
                usable question items yet.
              </div>
            )}
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
