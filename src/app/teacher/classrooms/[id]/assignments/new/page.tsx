import Link from "next/link";
import { notFound } from "next/navigation";

import { createTeacherAssignment } from "@/app/teacher/classrooms/[id]/assignments/actions";
import {
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AssignmentSelectionSummary } from "@/components/teacher/assignment-selection-summary";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getManagedClassroom,
  listAssignablePublishedQuestions,
} from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

type NewTeacherAssignmentPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    q?: string;
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTeacherAssignmentPage({
  params,
  searchParams,
}: NewTeacherAssignmentPageProps) {
  await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const search = (firstParam(query.q) ?? "").trim().slice(0, 80);
  const supabase = await createClient();

  let classroom;
  let questions;

  try {
    classroom = await getManagedClassroom({ classroomId: id, supabase });
    questions = await listAssignablePublishedQuestions({
      query: search,
      supabase,
    });
  } catch {
    notFound();
  }

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">New assignment</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Assign work to {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Select reviewed questions, write student-facing instructions,
              then save a teacher draft or assign it to class. The primary
              workflow now starts from Question Banks.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">Teacher Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/assignments`}>
                Back to assignments
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <ClassroomSafetyStrip />

      {classroom.status === "archived" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          This classroom is archived. Historical work remains readable, but new
          assignments are blocked until the classroom is reopened in Settings.
        </section>
      ) : null}

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Bank-first workflow:</strong> create new
        assignments from a Question Bank when possible. This direct classroom
        picker remains for published-question compatibility and regression
        checks.
        <Button asChild className="ml-3" size="sm" variant="outline">
          <Link href="/teacher/banks">Open Question Banks</Link>
        </Button>
      </section>

      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Step 1</p>
          <p className="mt-1 font-bold text-slate-950">Choose compatibility questions</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Step 2</p>
          <p className="mt-1 font-bold text-slate-950">Add instructions and due date</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Step 3</p>
          <p className="mt-1 font-bold text-slate-950">Save draft or assign now</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Published questions
                </h2>
                <p className="teacher-muted">
                  Compatibility path for globally published questions. Bank
                  assignments should start from selected approved bank items.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {questions.length} available
              </span>
            </div>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Label className="sr-only" htmlFor="question-search">
                Search published questions
              </Label>
              <Input
                className="h-11"
                defaultValue={search}
                id="question-search"
                name="q"
                placeholder="Search title or question code"
              />
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
          </div>

          <form action={createTeacherAssignment} id="assignment-create-form">
            <input name="classroomId" type="hidden" value={classroom.id} />
            {questions.length ? (
              <div className="divide-y divide-slate-100">
                {questions.map((question) => (
                  <label
                    className="flex cursor-pointer gap-4 p-5 transition hover:bg-slate-50"
                    key={question.id}
                  >
                    <input
                      className="mt-1 h-5 w-5 rounded border-slate-300"
                      name="questionIds"
                      type="checkbox"
                      value={question.id}
                    />
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="block break-words text-base font-bold text-slate-950">
                        {question.title}
                      </span>
                      <span className="block break-words text-sm leading-6 text-slate-600">
                        {question.question_code} - {question.question_type} -
                        difficulty {question.difficulty_rating}
                      </span>
                      {question.contentPreview ? (
                        <span className="line-clamp-2 block text-sm leading-6 text-slate-500">
                          {question.contentPreview}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  No published questions available
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Approve questions through bank review or adjust the search
                  before assigning work. Draft or unreviewed questions cannot be
                  assigned.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/teacher/banks">Open bank review</Link>
                </Button>
              </div>
            )}
          </form>
        </section>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Assignment details
            </h2>
            <div className="mt-5 space-y-4">
              <AssignmentSelectionSummary
                formId="assignment-create-form"
                totalQuestions={questions.length}
              />
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  form="assignment-create-form"
                  id="title"
                  maxLength={180}
                  name="title"
                  placeholder="Applications of Integration practice"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  form="assignment-create-form"
                  id="instructions"
                  maxLength={4000}
                  name="instructions"
                  placeholder="Complete each question and open Practice if you need extra review."
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueAt">Due date</Label>
                <Input
                  form="assignment-create-form"
                  id="dueAt"
                  name="dueAt"
                  type="datetime-local"
                />
              </div>
            </div>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Publish choice</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Save draft keeps the assignment teacher-only. Assign to class
              makes it visible in Student My Work immediately.
            </p>
            <div className="mt-4 grid gap-2">
              {classroom.status === "active" ? (
                <>
                  <Button
                    form="assignment-create-form"
                    name="publishMode"
                    type="submit"
                    value="assigned"
                  >
                    Assign to class
                  </Button>
                  <Button
                    form="assignment-create-form"
                    name="publishMode"
                    type="submit"
                    value="draft"
                    variant="outline"
                  >
                    Save draft
                  </Button>
                </>
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                    Reopen before assigning
                  </Link>
                </Button>
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              The server rechecks every selected question and rejects anything
              that is not published in this compatibility path.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
