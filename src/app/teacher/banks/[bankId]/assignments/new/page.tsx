import Link from "next/link";
import { notFound } from "next/navigation";

import { createAssignmentFromBankQuestions } from "@/app/teacher/banks/actions";
import { AssignmentSelectionSummary } from "@/components/teacher/assignment-selection-summary";
import { LazyTeacherQuestionPreview } from "@/components/teacher/lazy-teacher-question-preview";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankDetail,
  listBankApprovedQuestions,
  canManageBankContent,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { listManagedClassrooms } from "@/lib/teacher-assignments";
import { readTeacherFocusSelectionReceipt } from "@/lib/teacher-focus-selection";
import { isDatabaseUuid } from "@/lib/teacher-focus-workspace";

export const dynamic = "force-dynamic";

type NewBankAssignmentPageProps = {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
    error?: string;
    selection?: string;
  }>;
};

function SetupNeededState() {
  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-panel p-6">
        <p className="teacher-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank assignment tables are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0028, then return to this Library assignment page.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function NewBankAssignmentPage({
  params,
  searchParams,
}: NewBankAssignmentPageProps) {
  await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  let detail;
  let questions;
  let classrooms;

  try {
    detail = await getTeacherQuestionBankDetail({ bankId, supabase });
    questions = await listBankApprovedQuestions({ bankId, supabase });
    classrooms = await listManagedClassrooms({ supabase });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const { bank, currentUserRole } = detail;
  if (!canManageBankContent(currentUserRole)) {
    notFound();
  }
  const usableQuestions = questions.filter((row) => row.question);
  const selectedIds =
    query.selection && isDatabaseUuid(query.selection)
      ? ((await readTeacherFocusSelectionReceipt({
          bankId,
          receiptId: query.selection,
          supabase,
          surface: "questions",
        })) ?? [])
      : [];
  const usableQuestionIds = new Set(
    usableQuestions.map((row) => row.bank_question_id),
  );
  const selectedQuestionIds = new Set(
    selectedIds.filter((id) => usableQuestionIds.has(id)),
  );

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="teacher-eyebrow">Library assignment</p>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {questionBankVisibilityLabel(bank.visibility)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {currentUserRole ?? "member"}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Assign from {bank.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Select active approved Library questions, choose a class you manage,
              then save a draft or assign it. Students receive only these
              selected items, not access to the full Library.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/teacher/publish?sourceBankId=${bank.id}`}>
                Open Assignments
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">Classrooms</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Assignment-only delivery:</strong> this
        creates a classroom delivery event from selected approved Library items.
        It does not publish questions globally or expose bank browsing to
        students. The top-level Assignments workspace is now the primary workflow for
        publishing selected bank work to one or more classes.
      </section>

      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["Library", bank.name],
          ["Approved items", usableQuestions.length],
          ["Available classes", classrooms.length],
          ["Updated", formatDate(bank.updated_at)],
        ].map(([label, value]) => (
          <div className="teacher-panel p-4" key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 break-words text-lg font-bold text-slate-950">
              {value}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Approved Library questions
                </h2>
                <p className="teacher-muted">
                  These questions are approved inside this Library. They can be
                  delivered to a class without becoming Central Public Library
                  results.
                </p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                {usableQuestions.length} assignable
              </span>
            </div>
          </div>

          <form action={createAssignmentFromBankQuestions} id="bank-assignment-create-form">
            <input name="bankId" type="hidden" value={bank.id} />
            {selectedQuestionIds.size ? (
              <p
                className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900"
                role="status"
              >
                {selectedQuestionIds.size} question
                {selectedQuestionIds.size === 1 ? "" : "s"} carried forward
                from the Library selection. You can still change the selection
                here.
              </p>
            ) : null}
            {usableQuestions.length ? (
              <div className="divide-y divide-slate-100">
                {usableQuestions.map((row) => {
                  const question = row.question!;

                  return (
                    <article
                      className="p-5 transition hover:bg-slate-50"
                      key={row.bank_question_id}
                    >
                      <label className="flex cursor-pointer gap-4">
                        <input
                          className="mt-1 h-5 w-5 rounded border-slate-300"
                          defaultChecked={selectedQuestionIds.has(
                            row.bank_question_id,
                          )}
                          name="bankQuestionIds"
                          type="checkbox"
                          value={row.bank_question_id}
                        />
                        <span className="min-w-0 flex-1 space-y-2">
                          <span className="block break-words text-base font-semibold text-slate-950">
                            {question.title}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                            {question.question_type}
                          </span>
                          <span className="block break-words text-sm leading-6 text-slate-600">
                            {question.question_code || "Question code pending"}
                          </span>
                        </span>
                      </label>
                      <LazyTeacherQuestionPreview
                        bankId={bank.id}
                        className="mt-2"
                        id={row.bank_question_id}
                        kind="assignment-selection"
                      />
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center">
                <h3 className="text-base font-bold text-slate-950">
                  No approved Library questions yet.
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Import material and approve Review Drafts into this Library
                  before creating assignments for students.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/review`}>
                    Open Library Review Drafts
                  </Link>
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
                bankId={bank.id}
                formId="bank-assignment-create-form"
                helperText="Choose at least one approved Library question before saving or assigning."
                inputName="bankQuestionIds"
                totalLabel="approved Library question(s) available in this view."
                totalQuestions={usableQuestions.length}
              />
              <div className="space-y-2">
                <Label htmlFor="classroomId">Classroom</Label>
                <select
                  className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  form="bank-assignment-create-form"
                  id="classroomId"
                  name="classroomId"
                  required
                >
                  <option value="">Choose a class you manage</option>
                  {classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                      {classroom.subject ? ` - ${classroom.subject}` : ""}
                    </option>
                  ))}
                </select>
                {!classrooms.length ? (
                  <p className="text-xs leading-5 text-amber-700">
                    Create a classroom before assigning selected Library content.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  form="bank-assignment-create-form"
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
                  form="bank-assignment-create-form"
                  id="instructions"
                  maxLength={4000}
                  name="instructions"
                  placeholder="Complete each question. Start Practice from My Work when you need guided review."
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueAt">Due date</Label>
                <Input
                  form="bank-assignment-create-form"
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
              makes selected items visible in Student My Work.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                disabled={!usableQuestions.length || !classrooms.length}
                form="bank-assignment-create-form"
                name="publishMode"
                type="submit"
                value="assigned"
              >
                Assign to class
              </Button>
              <Button
                disabled={!usableQuestions.length || !classrooms.length}
                form="bank-assignment-create-form"
                name="publishMode"
                type="submit"
                value="draft"
                variant="outline"
              >
                Save draft
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              The server rechecks Library membership, classroom management, and
              every selected active Library question before creating the
              assignment.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
