import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listStudentSentAssignmentFeedbackNotes } from "@/lib/teacher-feedback-notes";
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
      title: "Completed",
      body: "Review your assignment-linked Practice history whenever you need it.",
    };
  }
  if (status === "in_progress") {
    return {
      title: "Continue where you stopped",
      body: "Your next attempt stays linked to this assignment for teacher feedback.",
    };
  }
  return {
    title: "Ready to start",
    body: "Practice progress is saved back to this assignment automatically.",
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
    return (
      <main className="student-shell space-y-6">
        <section className="student-hero">
          <p className="student-eyebrow">Assigned work</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            This work is currently unavailable
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            The Assignment may be paused for teacher review, archived, or not
            available to your account. No private Library details are shown.
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link href="/student/work">Back to My Work</Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const feedbackNotes = await listStudentSentAssignmentFeedbackNotes({
    assignmentId: assignment.id,
    studentId: profile.id,
    supabase,
  });
  const usableQuestionItems = assignment.items.filter(
    (item) => item.item_type === "question" && item.question_id && item.question,
  );
  const hasPracticeEntry = usableQuestionItems.length > 0;
  const currentState = stateCopy(assignment.progressStatus);

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
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

        <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            {statusLabel(assignment.progressStatus)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            Due {formatDateTime(assignment.due_at)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            {usableQuestionItems.length} practice question(s)
          </span>
        </div>

        {assignment.instructions ? (
          <div className="mt-5 max-w-3xl rounded-lg border border-slate-200 bg-white/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Teacher instructions
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {assignment.instructions}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-sky-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{currentState.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              {currentState.body}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
              {assignment.progress?.started_at ? (
                <span>Started {formatDateTime(assignment.progress.started_at)}</span>
              ) : null}
              {assignment.progress?.completed_at ? (
                <span>Completed {formatDateTime(assignment.progress.completed_at)}</span>
              ) : null}
              {assignment.progress?.updated_at ? (
                <span>Updated {formatDateTime(assignment.progress.updated_at)}</span>
              ) : null}
            </div>
          </div>
          {hasPracticeEntry ? (
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <Link href={`/practice?assignmentId=${assignment.id}`}>
                {actionLabel(assignment.progressStatus)}
              </Link>
            </Button>
          ) : (
            <div className="max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              Practice is unavailable until this assignment has a usable question.
            </div>
          )}
        </div>

        {assignment.source_kind === "question_bank" ? (
          <p className="mt-4 text-xs leading-5 text-slate-500">
            You can access only the questions assigned here. Your teacher&apos;s
            full private Library remains unavailable.
          </p>
        ) : null}
      </section>

      {feedbackNotes.length ? (
        <section className="student-panel overflow-hidden">
          <details>
            <summary className="student-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Teacher feedback</h2>
                <p className="student-muted">
                  Feedback your teacher explicitly sent for this assignment.
                  Private teacher notes are not shown here.
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                {feedbackNotes.length}
              </span>
            </summary>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {feedbackNotes.map((note) => (
                <article className="p-5" key={note.id}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">
                    Sent feedback
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {note.body}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Sent {formatDateTime(note.sent_at || note.created_at)}
                  </p>
                </article>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <section className="student-panel overflow-hidden">
        <details>
          <summary className="student-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Assigned questions</h2>
              <p className="student-muted">
                Preview item metadata without opening your teacher&apos;s Library.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {assignment.items.length}
            </span>
          </summary>
          {assignment.items.length ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
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
                          This item cannot open in Practice yet because it is not
                          linked to a usable question.
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
            <div className="border-t border-slate-100 p-8 text-center">
              <h3 className="text-base font-bold text-slate-950">
                No usable question items yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Your teacher has assigned this work, but the item list is still
                being prepared.
              </p>
            </div>
          )}
        </details>
      </section>
    </main>
  );
}
