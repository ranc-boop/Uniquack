import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listCourseBuilderBridgeClassrooms,
  listCourseBuilderBridgeSources,
  type CourseBuilderBridgeClassroom,
  type CourseBuilderBridgeSource,
} from "@/lib/course-builder/assignment-bridge";
import { createClient } from "@/lib/supabase/server";

import { createAssignmentFromCourseBuilder } from "./actions";

export const dynamic = "force-dynamic";

type TeacherCourseBuilderPageProps = {
  searchParams: Promise<{
    classroomId?: string;
    error?: string;
    saved?: string;
  }>;
};

function sourceKindLabel(kind: CourseBuilderBridgeSource["kind"]) {
  return kind === "course_builder_run" ? "Course Builder run" : "Practice framework";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SourceCard({
  classrooms,
  defaultClassroomId,
  source,
}: {
  classrooms: CourseBuilderBridgeClassroom[];
  defaultClassroomId: string;
  source: CourseBuilderBridgeSource;
}) {
  const hasClassrooms = classrooms.length > 0;
  const canCreate = hasClassrooms && source.eligibleQuestionCount > 0;
  const defaultTitle = `${source.title} assignment`;

  return (
    <article className="student-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700">
                {sourceKindLabel(source.kind)}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-700">
                {source.status}
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950">
              {source.title}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">
              {source.description || "Course Builder source ready for teacher review."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-2xl font-bold text-slate-950">
                {source.eligibleQuestionCount}
              </p>
              <p className="text-xs font-semibold text-slate-500">Published</p>
            </div>
            <div className="rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-2xl font-bold text-slate-950">
                {source.unavailableQuestionCount}
              </p>
              <p className="text-xs font-semibold text-slate-500">Needs review</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-950">
              Assignable published questions
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
                      {question.question_code} - {question.question_type} -
                      difficulty {question.difficulty_rating}
                    </p>
                  </div>
                ))}
                {source.eligibleQuestions.length > 5 ? (
                  <p className="text-xs text-slate-500">
                    +{source.eligibleQuestions.length - 5} more published question(s)
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                No published Question Bank questions are available from this source yet.
              </p>
            )}
          </div>

          {source.unavailableQuestionCount > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Draft/unreviewed questions are unavailable for assignment. Open{" "}
              <Link className="font-bold underline" href="/admin/review">
                Review Drafts
              </Link>{" "}
              to approve them before assigning.
            </div>
          ) : null}

          <p className="text-xs text-slate-500">
            Last updated {formatDateTime(source.updatedAt)}. Source id:{" "}
            <span className="font-mono">{source.id}</span>
          </p>
        </div>

        <form action={createAssignmentFromCourseBuilder} className="rounded-lg border border-slate-200 p-4">
          <input name="sourceKind" type="hidden" value={source.kind} />
          <input name="sourceId" type="hidden" value={source.id} />
          <div className="space-y-4">
            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`classroom-${source.id}`}>
                Classroom
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue={defaultClassroomId}
                disabled={!hasClassrooms}
                id={`classroom-${source.id}`}
                name="classroomId"
                required
              >
                <option value="">Choose classroom</option>
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
                Assignment title
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
                Instructions
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                defaultValue={`Created from Course Builder: ${source.title}. Review before assigning.`}
                id={`instructions-${source.id}`}
                maxLength={4000}
                name="instructions"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-slate-950" htmlFor={`due-${source.id}`}>
                Due date
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
                Visibility
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                defaultValue="draft"
                id={`publish-${source.id}`}
                name="publishMode"
              >
                <option value="draft">Save draft (teacher-only)</option>
                <option value="assigned">Assign now (visible in My Work)</option>
              </select>
            </div>

            <Button className="w-full" disabled={!canCreate} type="submit">
              Create assignment
            </Button>
            {!canCreate ? (
              <p className="text-xs leading-5 text-slate-500">
                A classroom and at least one published source question are required.
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
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Course Builder bridge</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Course Builder will generate bank packages before assignment.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              This direct assignment bridge remains for compatibility. The
              bank-first Course Builder rebuild will create reviewed packages in
              a teacher bank before they become class work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">Teacher Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Banks / Library</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">Classrooms</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/review">Review Drafts</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Rebuild planned:</strong> Course Builder
        should generate bank packages before assignment. This page does not add
        new generation behavior or provider calls.
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

      {!classrooms.length ? (
        <section className="student-panel p-6">
          <h2 className="text-lg font-bold text-slate-950">Delivery classroom required.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            The current bridge still needs a teacher-managed classroom before it
            can save a delivery event. Bank-first package generation is next.
          </p>
          <Button asChild className="mt-4">
            <Link href="/teacher/classrooms">Open classrooms</Link>
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
            />
          ))}
        </div>
      ) : (
        <section className="student-panel p-8 text-center">
          <h2 className="text-lg font-bold text-slate-950">
            No Course Builder sources yet.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Course Builder runs and practice frameworks will appear here after they
            create reviewed source questions. Draft-only questions stay blocked until
            they are published through Review Drafts.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/admin/review">Open Review Drafts</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
