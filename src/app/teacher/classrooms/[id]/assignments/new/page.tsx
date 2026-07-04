import Link from "next/link";
import { notFound } from "next/navigation";

import { createTeacherAssignment } from "@/app/teacher/classrooms/[id]/assignments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">New assignment</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Assign work to {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Choose published Question Bank items only. Review Drafts and
              unpublished questions stay out of student work.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classrooms/${classroom.id}/assignments`}>
              Back to assignments
            </Link>
          </Button>
        </div>
      </section>

      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="student-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Published questions
            </h2>
            <p className="student-muted">
              Select one or more approved/published questions for this
              assignment.
            </p>
            <form className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input
                className="h-11"
                defaultValue={search}
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
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      name="questionIds"
                      type="checkbox"
                      value={question.id}
                    />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-base font-bold text-slate-950">
                        {question.title}
                      </span>
                      <span className="block text-sm leading-6 text-slate-600">
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
                  No published questions found
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Publish questions from Review Drafts or adjust the search
                  before assigning work.
                </p>
              </div>
            )}
          </form>
        </section>

        <aside className="student-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">
            Assignment details
          </h2>
          <div className="mt-5 space-y-4">
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
            <div className="grid gap-2">
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
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Assigned work appears immediately in active students&apos; My Work list.
            Drafts stay teacher-side.
          </p>
        </aside>
      </div>
    </main>
  );
}
