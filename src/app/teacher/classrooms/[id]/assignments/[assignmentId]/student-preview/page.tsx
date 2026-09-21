import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

import { FocusWorkspaceShell } from "@/components/teacher/focus-workspace-shell";
import { QuestionText } from "@/components/math-content";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import {
  isDatabaseUuid,
  sanitizeTeacherAssignmentReturnTo,
} from "@/lib/teacher-focus-workspace";
import { getTeacherAssignmentStudentPreview } from "@/lib/teacher-assignments";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Student Assignment preview — EduStruct",
};

function assignmentStatusLabel(locale: Parameters<typeof translate>[0], status: string) {
  if (status === "assigned") return translate(locale, "assignmentDetail.assigned");
  if (status === "draft") return translate(locale, "assignmentDetail.draft");
  if (status === "archived") return translate(locale, "classroom.assignmentStatusArchived");
  return status;
}

function questionTypeLabel(locale: Parameters<typeof translate>[0], type: string) {
  if (type === "mcq") return translate(locale, "courseBuilder.questionTypeMcq");
  if (type === "fill_blank") return translate(locale, "courseBuilder.questionTypeFillBlank");
  if (type === "frq") return translate(locale, "courseBuilder.questionTypeFrq");
  if (type === "mixed") return translate(locale, "courseBuilder.questionTypeMixed");
  return type;
}

export default async function TeacherAssignmentStudentPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string; id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  noStore();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const [, routeParams, query, supabase] = await Promise.all([
    requireTeacher(),
    params,
    searchParams,
    createClient(),
  ]);
  const { assignmentId, id: classroomId } = routeParams;

  if (!isDatabaseUuid(classroomId) || !isDatabaseUuid(assignmentId)) {
    notFound();
  }

  const assignment = await getTeacherAssignmentStudentPreview({
    assignmentId,
    classroomId,
    supabase,
  });

  if (!assignment) {
    notFound();
  }

  const returnHref = sanitizeTeacherAssignmentReturnTo({
    assignmentId,
    classroomId,
    rawReturnTo: query.returnTo,
  });

  return (
    <FocusWorkspaceShell
      badges={
        <>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
            {assignment.classroom.name}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
            {assignmentStatusLabel(locale, assignment.status)}
          </span>
        </>
      }
      description={t("assignmentDetail.studentPreviewDescription")}
      eyebrow={t("assignmentDetail.studentPreviewEyebrow")}
      returnHref={returnHref}
      returnSurfaceLabel={t("assignmentDetail.assignmentDetailReturn")}
      title={assignment.title}
    >
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="font-semibold text-slate-500">{t("assignmentDetail.due")}</dt>
            <dd className="mt-1 font-bold text-slate-950">
              {assignment.due_at
                ? formatLocaleDateTime(locale, assignment.due_at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("assignments.noDueDate")}
            </dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="font-semibold text-slate-500">
              {t("assignmentDetail.questions")}
            </dt>
            <dd className="mt-1 font-bold text-slate-950">
              {formatNumber(locale, assignment.items.length)}
            </dd>
          </div>
        </dl>
        {assignment.instructions?.trim() ? (
          <div className="mt-5">
            <h2 className="text-base font-bold text-slate-950">
              {t("assignmentDetail.instructions")}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {assignment.instructions}
            </p>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="student-preview-items-heading"
        className="rounded-lg border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-100 p-5">
          <h2
            className="text-lg font-bold text-slate-950"
            id="student-preview-items-heading"
          >
            {t("assignmentDetail.assignedQuestions")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {t("assignmentDetail.studentVisiblePrompt")}
          </p>
        </div>
        {assignment.items.length ? (
          <ol className="divide-y divide-slate-100">
            {assignment.items.map((item) => (
              <li className="p-5" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                      {t("assignmentDetail.questionNumber", {
                        count: formatNumber(locale, item.order_index),
                      })}
                    </p>
                    <h3 className="mt-1 break-words text-base font-bold text-slate-950">
                      {item.question?.title ?? t("assignmentDetail.questionUnavailable")}
                    </h3>
                  </div>
                  {item.question ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {questionTypeLabel(locale, item.question.question_type)}
                    </span>
                  ) : null}
                </div>
                {item.question ? (
                  <QuestionText
                    className="mt-4 border-slate-200 bg-slate-50/70"
                    value={item.question.content_html}
                  />
                ) : (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {t("assignmentDetail.promptUnavailable")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="p-5 text-sm text-slate-600">
            {t("assignmentDetail.noStudentQuestions")}
          </p>
        )}
      </section>
    </FocusWorkspaceShell>
  );
}
