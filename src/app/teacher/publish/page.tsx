import Link from "next/link";
import type { ComponentType } from "react";

import {
  BookOpenCheck,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Megaphone,
  School,
  Sparkles,
  Users,
  type LucideProps,
} from "lucide-react";

import { publishQuestionBankAssignments } from "@/app/teacher/publish/actions";
import { AssignmentSelectionSummary } from "@/components/teacher/assignment-selection-summary";
import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  listBankApprovedQuestions,
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
  type BankApprovedQuestion,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  listTeacherClassroomSummaries,
  type TeacherClassroomSummary,
} from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherPublishPageProps = {
  searchParams: Promise<{
    classroomId?: string;
    error?: string;
    saved?: string;
    sourceBankId?: string;
  }>;
};

type SourceOption = {
  description: string;
  icon: ComponentType<LucideProps>;
  label: string;
  status: string;
  tone: "active" | "planned";
};

const sourceOptions: SourceOption[] = [
  {
    description: "Select approved active questions from a bank and deliver them as assignment-only work.",
    icon: BookOpenCheck,
    label: "Question Bank",
    status: "Working now",
    tone: "active",
  },
  {
    description: "Blueprints will become publishable after package generation and Review Draft approval.",
    icon: Sparkles,
    label: "Blueprint",
    status: "Coming next",
    tone: "planned",
  },
  {
    description: "Packages will publish after generated items are reviewed and approved into a bank.",
    icon: Boxes,
    label: "Package",
    status: "Coming next",
    tone: "planned",
  },
];

function SetupNeededState() {
  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-panel p-6">
        <p className="teacher-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Publish Center needs the bank assignment schema.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply the clean Question Bank, classroom, and assignment migrations,
          then return to Publish.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher">Back to Teacher Workspace</Link>
        </Button>
      </section>
    </main>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function sourceStatusClasses(tone: SourceOption["tone"]) {
  return tone === "active"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-slate-200 bg-slate-50 text-slate-600";
}

function statusClasses(status: string | null | undefined) {
  if (status === "published" || status === "review") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "draft") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function SourceTypeCards() {
  return (
    <section className="grid gap-3 lg:grid-cols-3">
      {sourceOptions.map(({ description, icon: Icon, label, status, tone }) => (
        <article
          className={`rounded-lg border p-4 ${
            tone === "active"
              ? "border-sky-200 bg-white/95 shadow-sm ring-1 ring-sky-100"
              : "border-slate-200 bg-white/70"
          }`}
          key={label}
        >
          <div className="flex items-start gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                tone === "active"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              <Icon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-950">{label}</h2>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sourceStatusClasses(
                    tone,
                  )}`}
                >
                  {status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {description}
              </p>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function BankPicker({
  banks,
  selectedBankId,
}: {
  banks: TeacherQuestionBankSummary[];
  selectedBankId: string;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="teacher-eyebrow">Source step</p>
            <h2 className="text-xl font-bold text-slate-950">
              Choose a source bank
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Pick one accessible bank. Publish uses only approved active bank
              questions and keeps the source bank private.
            </p>
          </div>
          <form action="/teacher/publish" className="flex flex-wrap gap-2">
            <Label className="sr-only" htmlFor="sourceBankId">
              Source bank
            </Label>
            <select
              className="h-11 min-w-64 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              defaultValue={selectedBankId}
              id="sourceBankId"
              name="sourceBankId"
            >
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Load bank
            </Button>
          </form>
        </div>
      </div>

      <div className="grid gap-3 p-5 lg:grid-cols-3">
        {banks.slice(0, 6).map((bank) => {
          const selected = bank.id === selectedBankId;

          return (
            <Link
              className={`rounded-lg border p-4 transition hover:bg-sky-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                selected
                  ? "border-sky-300 bg-sky-50"
                  : "border-slate-200 bg-white"
              }`}
              href={`/teacher/publish?sourceBankId=${encodeURIComponent(bank.id)}`}
              key={bank.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                  {questionBankVisibilityLabel(bank.visibility)}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                  {bankMemberRoleLabel(bank.membershipRole)}
                </span>
              </div>
              <h3 className="mt-3 break-words text-base font-bold text-slate-950">
                {bank.name}
              </h3>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-white/80 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ready
                  </dt>
                  <dd className="font-bold text-slate-950">
                    {bank.assignmentReadyCount}
                  </dd>
                </div>
                <div className="rounded-md bg-white/80 px-3 py-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Drafts
                  </dt>
                  <dd className="font-bold text-slate-950">
                    {bank.reviewDraftCount}
                  </dd>
                </div>
              </dl>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function QuestionChecklist({
  bankId,
  questions,
}: {
  bankId: string;
  questions: BankApprovedQuestion[];
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="teacher-eyebrow">Question Bank source</p>
            <h2 className="text-xl font-bold text-slate-950">
              Select approved bank questions
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              These rows are active bank questions. The server rechecks that
              selected items are assignable before creating any delivery event.
            </p>
          </div>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
            {questions.length} assignment-ready
          </span>
        </div>
      </div>

      {questions.length ? (
        <div className="divide-y divide-slate-100">
          {questions.map((row) => {
            const question = row.question!;
            const tags = row.tagSummaries.slice(0, 4);

            return (
              <label
                className="flex cursor-pointer gap-4 p-5 transition hover:bg-sky-50/40"
                key={row.bank_question_id}
              >
                <input
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600"
                  form="publish-center-form"
                  name="bankQuestionIds"
                  type="checkbox"
                  value={row.bank_question_id}
                />
                <span className="min-w-0 flex-1 space-y-3">
                  <span className="block break-words text-base font-bold text-slate-950">
                    {question.title}
                  </span>
                  <span className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                      {question.question_type}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                      Difficulty {question.difficulty_rating ?? "not set"}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-1 ${statusClasses(
                        question.status,
                      )}`}
                    >
                      {question.status}
                    </span>
                    <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-cyan-800">
                      Assignment-only
                    </span>
                  </span>
                  <span className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                    <span className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Taxonomy / knowledge point
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {tags.length ? (
                          tags.map((tag) => (
                            <span
                              className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900"
                              key={`${row.bank_question_id}-${tag.tag_id}`}
                            >
                              {tag.label ?? tag.facet_key ?? "Taxonomy tag"}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">
                            Not tagged yet
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Source lineage
                      </span>
                      <span className="mt-1 block break-words text-sm font-semibold text-slate-900">
                        {question.source_kind || row.source_kind}
                      </span>
                      <span className="mt-1 block break-all text-xs text-slate-500">
                        {question.source_review_item_id
                          ? `Review Draft ${question.source_review_item_id}`
                          : "No Review Draft reference attached"}
                      </span>
                    </span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="teacher-eyebrow">No assignment-ready questions</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            Approve bank content before publishing.
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Publish cannot deliver raw AI drafts or unreviewed material. Open
            Review Drafts for this bank, approve usable questions, then return
            here.
          </p>
          <Button asChild className="mt-5" variant="outline">
            <Link href={`/teacher/banks/${bankId}/review`}>
              Open bank Review Drafts
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function ClassroomTargets({
  classrooms,
  preselectedClassroomId,
}: {
  classrooms: TeacherClassroomSummary[];
  preselectedClassroomId?: string;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <p className="teacher-eyebrow">Target step</p>
        <h2 className="text-xl font-bold text-slate-950">
          Choose classroom targets
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Publish creates one assignment per selected classroom. Individual
          student targeting is coming later.
        </p>
      </div>

      {classrooms.length ? (
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {classrooms.map((classroom) => (
            <label
              className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-200 hover:bg-sky-50/60"
              key={classroom.id}
            >
              <input
                className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600"
                defaultChecked={classroom.id === preselectedClassroomId}
                form="publish-center-form"
                name="classroomIds"
                type="checkbox"
                value={classroom.id}
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-bold text-slate-950">
                  {classroom.name}
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  {classroom.subject || "No subject set"}
                </span>
                <span className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <span className="rounded-md bg-slate-50 px-3 py-2">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Students
                    </span>
                    <span className="font-bold text-slate-950">
                      {classroom.studentCount}
                    </span>
                  </span>
                  <span className="rounded-md bg-slate-50 px-3 py-2">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Active
                    </span>
                    <span className="font-bold text-slate-950">
                      {classroom.activeAssignmentCount}
                    </span>
                  </span>
                  <span className="rounded-md bg-slate-50 px-3 py-2">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Latest
                    </span>
                    <span className="font-bold text-slate-950">
                      {formatDate(classroom.latestActivityAt)}
                    </span>
                  </span>
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="teacher-eyebrow">No classrooms yet</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            Create a class before publishing.
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Classrooms are roster and delivery spaces. They receive selected
            bank items through Publish.
          </p>
          <Button asChild className="mt-5" variant="outline">
            <Link href="/teacher/classrooms">Open classrooms</Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export default async function TeacherPublishPage({
  searchParams,
}: TeacherPublishPageProps) {
  const profile = await requireTeacher();
  const query = await searchParams;
  const supabase = await createClient();
  let banks: TeacherQuestionBankSummary[] = [];
  let classrooms: TeacherClassroomSummary[] = [];
  let selectedQuestions: BankApprovedQuestion[] = [];
  let dataError: unknown = null;

  try {
    [banks, classrooms] = await Promise.all([
      listTeacherQuestionBanks({ profileId: profile.id, supabase }),
      listTeacherClassroomSummaries({ supabase }),
    ]);
  } catch (error) {
    dataError = error;
  }

  if (dataError) {
    if (dataError instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw dataError;
  }

  const selectedBankId =
    banks.find((bank) => bank.id === query.sourceBankId)?.id ??
    banks.find((bank) => bank.assignmentReadyCount > 0)?.id ??
    banks[0]?.id ??
    "";

  if (selectedBankId) {
    try {
      selectedQuestions = await listBankApprovedQuestions({
        bankId: selectedBankId,
        supabase,
      });
    } catch (error) {
      if (error instanceof QuestionBankSchemaMissingError) {
        return <SetupNeededState />;
      }

      throw error;
    }
  }

  const assignableQuestions = selectedQuestions.filter(
    (row) =>
      row.status === "active" &&
      row.question &&
      row.question.status !== "draft",
  );
  const selectedBank = banks.find((bank) => bank.id === selectedBankId) ?? null;

  return (
      <TeacherWorkspaceShell
        eyebrow="Teacher publish workflow"
        title="Publish"
        description="Publish distributes selected bank content to classes. Students see assigned items only, not the full source bank."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Open banks</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">Open classrooms</Link>
            </Button>
          </>
        }
      >
        <TeacherWorkspaceNav />

        {query.saved ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {query.saved}
          </p>
        ) : null}
        {query.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
            {query.error}
          </p>
        ) : null}

        <SourceTypeCards />

        {!banks.length ? (
          <section className="teacher-panel p-8 text-center">
            <p className="teacher-eyebrow">No source banks</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Create or join a Question Bank first.
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Publish starts from reviewed bank content. Classrooms are selected
              after the source bank is ready.
            </p>
            <Button asChild className="mt-5">
              <Link href="/teacher/banks/new">Create Question Bank</Link>
            </Button>
          </section>
        ) : (
          <>
            <BankPicker banks={banks} selectedBankId={selectedBankId} />

            <form
              action={publishQuestionBankAssignments}
              className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]"
              id="publish-center-form"
            >
              <input name="bankId" type="hidden" value={selectedBankId} />
              <div className="space-y-6">
                <QuestionChecklist
                  bankId={selectedBankId}
                  questions={assignableQuestions}
                />
                <ClassroomTargets
                  classrooms={classrooms}
                  preselectedClassroomId={query.classroomId}
                />
              </div>

              <aside className="space-y-6">
                <section className="teacher-panel p-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                      <ClipboardList aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">
                        Details
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Configure the assignment students will see in My Work.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-4">
                    <AssignmentSelectionSummary
                      formId="publish-center-form"
                      helperText="Choose approved bank questions before saving or assigning."
                      inputName="bankQuestionIds"
                      totalLabel="assignment-ready question(s) in this bank."
                      totalQuestions={assignableQuestions.length}
                    />
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input
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
                        id="instructions"
                        maxLength={4000}
                        name="instructions"
                        placeholder="Complete the selected questions. Start Practice from My Work if you need guided review."
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="dueAt">Due date optional</Label>
                      <Input id="dueAt" name="dueAt" type="datetime-local" />
                    </div>
                  </div>
                </section>

                <section className="teacher-panel p-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <Megaphone aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">
                        Review boundary
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Confirm the source, target, and visibility before
                        creating classroom delivery.
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">
                        Source bank
                      </dt>
                      <dd className="mt-1 break-words font-bold text-slate-950">
                        {selectedBank?.name ?? "No bank selected"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">
                        Selected item count
                      </dt>
                      <dd className="mt-1 font-bold text-slate-950">
                        Reviewed at submit
                      </dd>
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                      <dt className="font-semibold text-sky-700">
                        Student visibility
                      </dt>
                      <dd className="mt-1 font-bold text-sky-950">
                        Assignment-only. No full source bank access.
                      </dd>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <dt className="font-semibold text-amber-800">
                        Blueprint / Package
                      </dt>
                      <dd className="mt-1 text-amber-950">
                        Planning sources only until generated material enters
                        Review Drafts and a bank.
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5 grid gap-2">
                    <Button
                      disabled={!assignableQuestions.length || !classrooms.length}
                      name="publishMode"
                      type="submit"
                      value="assigned"
                    >
                      Assign now
                    </Button>
                    <Button
                      disabled={!assignableQuestions.length || !classrooms.length}
                      name="publishMode"
                      type="submit"
                      value="draft"
                      variant="outline"
                    >
                      Save draft
                    </Button>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-slate-500">
                    Multi-class publishing validates every selected classroom
                    before each assignment is created. If a later class fails,
                    Publish reports the partial result instead of hiding it.
                  </p>
                </section>

                <section className="teacher-soft-panel p-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700">
                      <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">
                        What this does not do
                      </h2>
                      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                        <li>No global question publishing.</li>
                        <li>No Review Draft bypass.</li>
                        <li>No student bank browsing.</li>
                        <li>No provider or AI calls.</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </aside>
            </form>
          </>
        )}

        <section className="grid gap-3 md:grid-cols-3">
          <div className="teacher-panel p-4">
            <div className="flex items-start gap-3">
              <School aria-hidden="true" className="mt-1 h-5 w-5 text-sky-700" />
              <div>
                <h2 className="font-bold text-slate-950">Classroom target</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Classrooms receive delivery events. They do not become the
                  source of content ownership.
                </p>
              </div>
            </div>
          </div>
          <div className="teacher-panel p-4">
            <div className="flex items-start gap-3">
              <Users aria-hidden="true" className="mt-1 h-5 w-5 text-sky-700" />
              <div>
                <h2 className="font-bold text-slate-950">Students later</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Individual-student targeting is planned after class-level
                  delivery is stable.
                </p>
              </div>
            </div>
          </div>
          <div className="teacher-panel p-4">
            <div className="flex items-start gap-3">
              <CalendarClock
                aria-hidden="true"
                className="mt-1 h-5 w-5 text-sky-700"
              />
              <div>
                <h2 className="font-bold text-slate-950">Scheduling later</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Due dates are supported. Future scheduling is separate from
                  save draft and assign now.
                </p>
              </div>
            </div>
          </div>
        </section>
      </TeacherWorkspaceShell>
  );
}
