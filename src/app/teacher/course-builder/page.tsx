import Link from "next/link";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listCourseBuilderBridgeClassrooms,
  listCourseBuilderBridgeSources,
  type CourseBuilderBridgeClassroom,
  type CourseBuilderBridgeSource,
} from "@/lib/course-builder/assignment-bridge";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import { createAssignmentFromCourseBuilder } from "./actions";

export const dynamic = "force-dynamic";

type TeacherCourseBuilderPageProps = {
  searchParams: Promise<{
    classroomId?: string;
    error?: string;
    saved?: string;
  }>;
};

type Translate = (
  key: Parameters<typeof translate>[1],
  values?: Parameters<typeof translate>[2],
) => string;

function sourceStatusLabel(t: Translate, status: string) {
  const labels: Record<string, string> = {
    active: t("courseBuilder.sourceStatusActive"),
    archived: t("courseBuilder.sourceStatusArchived"),
    draft: t("courseBuilder.sourceStatusDraft"),
    published: t("courseBuilder.published"),
  };

  return labels[status] ?? status;
}

function questionTypeLabel(
  t: Translate,
  questionType: string | null | undefined,
) {
  const labels: Record<string, string> = {
    fill_blank: t("courseBuilder.questionTypeFillBlank"),
    frq: t("courseBuilder.questionTypeFrq"),
    mcq: t("courseBuilder.questionTypeMcq"),
    mixed: t("courseBuilder.questionTypeMixed"),
  };

  return questionType ? (labels[questionType] ?? questionType) : "";
}

function SourceCard({
  classrooms,
  defaultClassroomId,
  source,
  locale,
  t,
}: {
  classrooms: CourseBuilderBridgeClassroom[];
  defaultClassroomId: string;
  source: CourseBuilderBridgeSource;
  locale: Parameters<typeof translate>[0];
  t: Translate;
}) {
  const hasClassrooms = classrooms.length > 0;
  const canCreate = hasClassrooms && source.eligibleQuestionCount > 0;
  const defaultTitle = t("courseBuilder.defaultAssignmentTitle", {
    title: source.title,
  });

  return (
    <article className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">
                {source.kind === "course_builder_run" ? t("courseBuilder.courseBuilderRun") : t("courseBuilder.practiceFramework")}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                {sourceStatusLabel(t, source.status)}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">
              {source.title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              {source.description || t("courseBuilder.sourceReadyForReview")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-2xl font-bold text-slate-950">
                {formatNumber(locale, source.eligibleQuestionCount)}
              </p>
              <p className="text-xs font-semibold text-slate-500">{t("courseBuilder.published")}</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-2xl font-bold text-slate-950">
                {formatNumber(locale, source.unavailableQuestionCount)}
              </p>
              <p className="text-xs font-semibold text-slate-500">{t("courseBuilder.needsReview")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-950">
              {t("courseBuilder.assignablePublishedQuestions")}
            </h3>
            {source.eligibleQuestions.length ? (
              <div className="mt-3 space-y-2">
                {source.eligibleQuestions.slice(0, 5).map((question) => (
                  <div
                    className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                    key={question.id}
                  >
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {question.title}
                    </p>
                    <p className="text-xs text-slate-500">
                      {question.question_code} - {questionTypeLabel(t, question.question_type)} - {t("courseBuilder.difficulty")} {formatNumber(locale, question.difficulty_rating)}
                    </p>
                  </div>
                ))}
                {source.eligibleQuestions.length > 5 ? (
                  <p className="text-xs text-slate-500">
                    {t("courseBuilder.morePublishedQuestions", { count: formatNumber(locale, source.eligibleQuestions.length - 5) })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("courseBuilder.noAssignableQuestions")}
              </p>
            )}
          </div>

          {source.unavailableQuestionCount > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              {t("courseBuilder.draftsUnavailableForAssignment")}
              <Link className="font-bold underline" href="/teacher/banks">
                {t("courseBuilder.libraryReview")}
              </Link>
              {t("courseBuilder.toApproveBeforeAssigning")}
            </div>
          ) : null}

          <p className="text-xs text-slate-500">
            {t("courseBuilder.lastUpdated", { date: source.updatedAt ? formatDateTime(locale, source.updatedAt) : t("courseBuilder.notSet") })}. {t("courseBuilder.sourceId")} {" "}
            <span className="font-mono">{source.id}</span>
          </p>
        </div>

        <form action={createAssignmentFromCourseBuilder} className="rounded-lg border border-slate-200 p-4">
          <input name="sourceKind" type="hidden" value={source.kind} />
          <input name="sourceId" type="hidden" value={source.id} />
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`classroom-${source.id}`}>
                {t("courseBuilder.classroom")}
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue={defaultClassroomId}
                disabled={!hasClassrooms}
                id={`classroom-${source.id}`}
                name="classroomId"
                required
              >
                <option value="">{t("courseBuilder.chooseClassroom")}</option>
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                    {classroom.subject ? ` - ${classroom.subject}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`title-${source.id}`}>
                {t("courseBuilder.assignmentTitle")}
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                defaultValue={defaultTitle}
                id={`title-${source.id}`}
                maxLength={180}
                name="title"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`instructions-${source.id}`}>
                {t("courseBuilder.instructions")}
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                defaultValue={t("courseBuilder.defaultAssignmentInstructions", {
                  title: source.title,
                })}
                id={`instructions-${source.id}`}
                maxLength={4000}
                name="instructions"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`due-${source.id}`}>
                {t("courseBuilder.dueDate")}
              </label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                id={`due-${source.id}`}
                name="dueAt"
                type="datetime-local"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`publish-${source.id}`}>
                {t("courseBuilder.visibility")}
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue="draft"
                id={`publish-${source.id}`}
                name="publishMode"
              >
                <option value="draft">{t("courseBuilder.saveDraftTeacherOnly")}</option>
                <option value="assigned">{t("courseBuilder.assignNowVisible")}</option>
              </select>
            </div>

            <FormSubmitButton
              className="w-full"
              disabled={!canCreate}
              pendingLabel={t("courseBuilder.creatingAssignment")}
            >
              {t("courseBuilder.createAssignment")}
            </FormSubmitButton>
            {!canCreate ? (
              <p className="text-xs leading-5 text-slate-500">
                {t("courseBuilder.classroomAndQuestionRequired")}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </article>
  );
}

export default async function TeacherCourseBuilderPage({
  searchParams,
}: TeacherCourseBuilderPageProps) {
  const query = await searchParams;
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const supabase = await createClient();
  const [classrooms, sources] = await Promise.all([
    listCourseBuilderBridgeClassrooms({ supabase }),
    listCourseBuilderBridgeSources({ supabase }),
  ]);
  const defaultClassroomId =
    query.classroomId && classrooms.some((classroom) => classroom.id === query.classroomId)
      ? query.classroomId
      : classrooms[0]?.id ?? "";

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            {t("courseBuilder.title")}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/banks">{t("courseBuilder.libraries")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">{t("courseBuilder.classrooms")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {query.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {t("courseBuilder.actionSaved")}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {t("courseBuilder.actionFailed")}
        </p>
      ) : null}

      {!classrooms.length ? (
        <section className="teacher-panel p-6">
          <h2 className="text-lg font-bold text-slate-950">{t("courseBuilder.deliveryClassroomRequired")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("courseBuilder.createClassroomBeforeAssigning")}
          </p>
          <Button asChild className="mt-4">
            <Link href="/teacher/classrooms">{t("courseBuilder.openClassrooms")}</Link>
          </Button>
        </section>
      ) : null}

      {sources.length ? (
        <div className="space-y-6">
          {sources.map((source) => (
            <SourceCard
              classrooms={classrooms}
              defaultClassroomId={defaultClassroomId}
              key={`${source.kind}:${source.id}`}
              source={source}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      ) : (
        <section className="teacher-panel p-8 text-center">
          <h2 className="text-lg font-bold text-slate-950">
            {t("courseBuilder.noSourcesAvailable")}
          </h2>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/teacher/banks">{t("courseBuilder.libraryReview")}</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
