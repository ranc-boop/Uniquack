import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { formatDateTime, formatNumber, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { listStudentSentAssignmentFeedbackNotes } from "@/lib/teacher-feedback-notes";
import { getStudentAssignedWorkDetail } from "@/lib/student-work";

export const dynamic = "force-dynamic";

type StudentWorkDetailPageProps = {
  params: Promise<{ id: string }>;
};

function formatDateTimeLabel(locale: Locale, value: string | null | undefined) {
  if (!value) return translate(locale, "classrooms.notSet");
  return formatDateTime(locale, value, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(locale: Locale, status: "not_started" | "in_progress" | "completed") {
  if (status === "in_progress") return translate(locale, "student.inProgress");
  if (status === "completed") return translate(locale, "student.completed");
  return translate(locale, "work.notStarted");
}

function actionLabel(locale: Locale, status: "not_started" | "in_progress" | "completed") {
  if (status === "in_progress") return translate(locale, "work.continuePractice");
  if (status === "completed") return translate(locale, "work.reviewWork");
  return translate(locale, "student.startPractice");
}

function stateCopy(locale: Locale, status: "not_started" | "in_progress" | "completed") {
  if (status === "completed") {
    return {
      title: translate(locale, "student.completed"),
    };
  }
  if (status === "in_progress") {
    return {
      title: translate(locale, "work.continueWhereStopped"),
    };
  }
  return {
    title: translate(locale, "work.readyToStart"),
  };
}

export default async function StudentWorkDetailPage({
  params,
}: StudentWorkDetailPageProps) {
  const [profile, locale] = await Promise.all([requireStudentWorkspace(), getRequestLocale()]);
  const { id } = await params;
  const supabase = await createClient();
  const assignment = await getStudentAssignedWorkDetail({
    assignmentId: id,
    studentId: profile.id,
    supabase,
  });

  if (!assignment) {
    return (
      <main className="space-y-6">
        <section className="student-hero">
          <p className="student-eyebrow">{translate(locale, "student.assignedWork")}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
            {translate(locale, "work.assignmentUnavailable")}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {translate(locale, "work.assignmentUnavailableDescription")}
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <StudentPendingLink href="/student/work">
                {translate(locale, "practice.backToMyWork")}
              </StudentPendingLink>
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
  const currentState = stateCopy(locale, assignment.progressStatus);

  return (
    <main className="space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="student-eyebrow">{translate(locale, "student.assignedWork")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {assignment.classroomName}
              {assignment.classroomSubject ? ` - ${assignment.classroomSubject}` : ""}
            </p>
          </div>
          <Button asChild variant="outline">
            <StudentPendingLink href="/student/work">
              {translate(locale, "practice.backToMyWork")}
            </StudentPendingLink>
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-sm font-semibold">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            {statusLabel(locale, assignment.progressStatus)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            {translate(locale, "work.dueAt", {
              date: formatDateTimeLabel(locale, assignment.due_at),
            })}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-slate-800">
            {translate(locale, "work.practiceQuestions", {
              count: formatNumber(locale, usableQuestionItems.length),
            })}
          </span>
        </div>

        {assignment.instructions ? (
          <div className="mt-5 max-w-3xl rounded-lg border border-slate-200 bg-white/80 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {translate(locale, "work.teacherInstructions")}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {assignment.instructions}
            </p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-sky-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{currentState.title}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-500">
              {assignment.progress?.started_at ? (
                <span>
                  {translate(locale, "work.startedAt", {
                    date: formatDateTimeLabel(locale, assignment.progress.started_at),
                  })}
                </span>
              ) : null}
              {assignment.progress?.completed_at ? (
                <span>
                  {translate(locale, "work.completedAt", {
                    date: formatDateTimeLabel(locale, assignment.progress.completed_at),
                  })}
                </span>
              ) : null}
              {assignment.progress?.updated_at ? (
                <span>
                  {translate(locale, "work.updatedAt", {
                    date: formatDateTimeLabel(locale, assignment.progress.updated_at),
                  })}
                </span>
              ) : null}
            </div>
          </div>
          {hasPracticeEntry ? (
            <Button asChild className="w-full shrink-0 sm:w-auto">
              <StudentPendingLink
                href={`/practice?assignmentId=${assignment.id}&returnTo=${encodeURIComponent(`/student/work/${assignment.id}`)}`}
              >
                {actionLabel(locale, assignment.progressStatus)}
              </StudentPendingLink>
            </Button>
          ) : (
            <div className="max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {translate(locale, "work.practiceUnavailable")}
            </div>
          )}
        </div>

      </section>

      {feedbackNotes.length ? (
        <section className="student-panel overflow-hidden">
          <details>
            <summary className="student-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-5 marker:content-none">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {translate(locale, "work.teacherFeedback")}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {translate(locale, "work.privateNotesNotShown")}
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                {formatNumber(locale, feedbackNotes.length)}
              </span>
            </summary>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {feedbackNotes.map((note) => (
                <article className="p-5" key={note.id}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">
                    {translate(locale, "work.sentFeedback")}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                    {note.body}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {translate(locale, "work.sentAt", {
                      date: formatDateTimeLabel(locale, note.sent_at || note.created_at),
                    })}
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
              <h2 className="text-lg font-bold text-slate-950">
                {translate(locale, "work.assignedQuestions")}
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {formatNumber(locale, assignment.items.length)}
            </span>
          </summary>
          {assignment.items.length ? (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {assignment.items.map((item) => (
                <article className="p-5" key={item.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        {translate(locale, "work.itemSummary", {
                          index: formatNumber(locale, item.order_index),
                          type: item.item_type,
                        })}
                      </p>
                      <h3 className="text-base font-bold text-slate-950">
                        {item.question?.title ?? translate(locale, "work.questionItemUnavailable")}
                      </h3>
                      {item.question ? (
                        <p className="break-words text-sm leading-6 text-slate-600">
                          {translate(locale, "work.questionDetails", {
                            code: item.question.question_code,
                            type: item.question.question_type,
                            difficulty: formatNumber(locale, item.question.difficulty_rating),
                          })}
                        </p>
                      ) : (
                        <p className="text-sm leading-6 text-slate-600">
                          {translate(locale, "work.questionItemCannotPractice")}
                        </p>
                      )}
                    </div>
                    {item.points !== null ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {translate(locale, "work.points", {
                          count: formatNumber(locale, item.points),
                        })}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="border-t border-slate-100 p-8 text-center">
              <h3 className="text-base font-bold text-slate-950">
                {translate(locale, "work.noUsableQuestionItems")}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {translate(locale, "work.itemListPreparing")}
              </p>
            </div>
          )}
        </details>
      </section>
    </main>
  );
}
