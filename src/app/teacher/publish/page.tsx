import { randomUUID } from "node:crypto";

import Link from "next/link";

import {
  BookOpenCheck,
  ClipboardList,
  Filter,
  Search,
  ShieldCheck,
} from "lucide-react";

import { publishQuestionBankAssignments } from "@/app/teacher/publish/actions";
import { AssignmentComposerFlow } from "@/components/teacher/assignment-composer-flow";
import { AssignmentSelectionSummary } from "@/components/teacher/assignment-selection-summary";
import { PublishSelectionControls } from "@/components/teacher/publish-selection-controls";
import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { readTeacherFocusSelectionReceipt } from "@/lib/teacher-focus-selection";
import { isDatabaseUuid } from "@/lib/teacher-focus-workspace";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  filterPublishableQuestions,
  listPublishableBankQuestions,
  normalizePublishDifficultyFilter,
  normalizePublishSourceType,
  summarizePublishableQuestions,
  type PublishableBankQuestion,
  type PublishContentSummary,
  type PublishDifficultyFilter,
  type PublishSourceType,
} from "@/lib/teacher-publish";
import {
  listTeacherClassroomSummaries,
  type TeacherClassroomSummary,
} from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherPublishPageProps = {
  searchParams: Promise<{
    blueprintId?: string;
    classroomId?: string;
    difficulty?: string;
    error?: string;
    q?: string;
    questionType?: string;
    saved?: string;
    selection?: string;
    source?: string;
    sourceBankId?: string;
  }>;
};

function SetupNeededState() {
  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-panel p-6">
        <p className="teacher-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Assignments need the Library assignment schema.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply the clean Library, classroom, and assignment migrations,
          then return to Assignments.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher">Back to Teacher Workspace</Link>
        </Button>
      </section>
    </main>
  );
}

function buildPublishHref({
  blueprintId,
  classroomId,
  difficulty,
  query,
  questionType,
  selection,
  source,
  sourceBankId,
}: {
  blueprintId?: string;
  classroomId?: string;
  difficulty?: PublishDifficultyFilter;
  query?: string;
  questionType?: string;
  selection?: string;
  source?: PublishSourceType;
  sourceBankId?: string;
}) {
  const params = new URLSearchParams();

  if (sourceBankId) params.set("sourceBankId", sourceBankId);
  if (classroomId) params.set("classroomId", classroomId);
  if (selection) params.set("selection", selection);
  if (source && source !== "bank") params.set("source", source);
  if (query) params.set("q", query);
  if (questionType) params.set("questionType", questionType);
  if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
  if (blueprintId) params.set("blueprintId", blueprintId);

  return params.size ? `/teacher/publish?${params.toString()}` : "/teacher/publish";
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

function shortId(value: string | null | undefined) {
  if (!value) return "none";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function SourceLibraryPicker({
  banks,
}: {
  banks: TeacherQuestionBankSummary[];
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <p className="teacher-eyebrow">Step 1 of 2</p>
        <h2 className="text-xl font-bold text-slate-950">
          Choose one source Library
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Only Libraries you own or edit are listed. Choosing one opens a clean
          Assignment builder; the Library remains private.
        </p>
      </div>

      <div className="grid gap-3 p-5 lg:grid-cols-3">
        {banks.map((bank) => (
          <Link
            className="teacher-focus-ring flex min-h-28 flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/70"
            href={buildPublishHref({ sourceBankId: bank.id })}
            key={bank.id}
          >
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                  {questionBankVisibilityLabel(bank.visibility)}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                  {bankMemberRoleLabel(bank.membershipRole)}
                </span>
              </span>
              <span className="mt-3 block break-words text-base font-bold text-slate-950">
                {bank.name}
              </span>
            </span>
            <span className="mt-3 text-sm font-semibold text-sky-800">
              {bank.assignmentReadyCount} assignment-ready
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PublishFilters({
  blueprintId,
  classroomId,
  contentStats,
  difficulty,
  query,
  questionType,
  selection,
  selectedBankId,
  selectedSource,
}: {
  blueprintId: string;
  classroomId?: string;
  contentStats: PublishContentSummary;
  difficulty: PublishDifficultyFilter;
  query: string;
  questionType: string;
  selection?: string;
  selectedBankId: string;
  selectedSource: PublishSourceType;
}) {
  const hasActiveFilters =
    Boolean(blueprintId || query || questionType) || difficulty !== "all";

  return (
    <details className="teacher-panel overflow-hidden" open={hasActiveFilters}>
      <summary className="teacher-focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Filter aria-hidden="true" className="size-5" />
          </span>
          <span>
            <span className="block font-bold text-slate-950">
              Filter questions
            </span>
            <span className="mt-0.5 block text-sm text-slate-600">
              {hasActiveFilters
                ? "Filters are applied to this checklist."
                : "Optional. Search, type, difficulty, or Blueprint source."}
            </span>
          </span>
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
          {hasActiveFilters ? "Applied" : "Optional"}
        </span>
      </summary>
      <div className="border-t border-slate-100 p-5">
        <p className="mb-4 text-sm leading-6 text-slate-600">
          Filters change only the visible checklist. The server rechecks Library,
          review, and classroom access before delivery.
        </p>
        <form action="/teacher/publish" className="grid gap-3 lg:grid-cols-5">
          <input name="source" type="hidden" value={selectedSource} />
          <input name="sourceBankId" type="hidden" value={selectedBankId} />
          {classroomId ? (
            <input name="classroomId" type="hidden" value={classroomId} />
          ) : null}
          {selection ? (
            <input name="selection" type="hidden" value={selection} />
          ) : null}
          <div className="lg:col-span-2">
            <Label className="sr-only" htmlFor="q">
              Search content
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <Input
                className="pl-9"
                defaultValue={query}
                id="q"
                name="q"
                placeholder="Search title, prompt, tag, blueprint..."
              />
            </div>
          </div>
          <div>
            <Label className="sr-only" htmlFor="questionType">
              Question type
            </Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              defaultValue={questionType}
              id="questionType"
              name="questionType"
            >
              <option value="">All types</option>
              {contentStats.questionTypeCounts.map((item) => (
                <option key={item.questionType} value={item.questionType}>
                  {item.questionType} ({item.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="sr-only" htmlFor="difficulty">
              Difficulty
            </Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              defaultValue={difficulty}
              id="difficulty"
              name="difficulty"
            >
              <option value="all">All difficulty</option>
              <option value="foundational">Foundational</option>
              <option value="practice">Practice</option>
              <option value="challenge">Challenge</option>
            </select>
          </div>
          <Button className="w-full" type="submit" variant="outline">
            Apply filters
          </Button>
          {contentStats.blueprintSources.length ? (
            <div className="lg:col-span-5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="blueprintId">
                Blueprint source
              </Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                defaultValue={blueprintId}
                id="blueprintId"
                name="blueprintId"
              >
                <option value="">All approved Blueprint-generated Library questions</option>
                {contentStats.blueprintSources.map((source) => (
                  <option
                    key={source.blueprintId ?? source.blueprintTitle}
                    value={source.blueprintId ?? ""}
                  >
                    {source.blueprintTitle} ({source.count})
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </form>
      </div>
    </details>
  );
}

function QuestionChecklist({
  bankId,
  defaultSelectedIds,
  questions,
  selectedSource,
  totalReadyCount,
}: {
  bankId: string;
  defaultSelectedIds: Set<string>;
  questions: PublishableBankQuestion[];
  selectedSource: PublishSourceType;
  totalReadyCount: number;
}) {
  const emptyTitle =
    selectedSource === "blueprint"
      ? "No approved Blueprint-generated Library questions match these filters."
      : selectedSource === "package"
        ? "Package publishing is not assignment-ready yet."
        : "No assignment-ready questions match these filters.";
  const emptyCopy =
    selectedSource === "blueprint"
      ? "Blueprint rows are not directly assignable. Generate questions from an approved Blueprint, send them through Review Drafts, approve them into this Library, then return here."
      : selectedSource === "package"
        ? "Package sources are visible for workflow clarity, but only approved Library questions can be assigned in this PR."
        : "Assignments cannot deliver raw AI drafts or unreviewed material. Approve usable Library Review Drafts, then return here.";

  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="teacher-eyebrow">Selectable content</p>
            <h2 className="text-xl font-bold text-slate-950">
              Select approved assignment-ready rows
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Every checked row is an active Library question. Students receive the
              assignment item, not the source Library, answer key, or Blueprint
              internals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PublishSelectionControls
              formId="publish-center-form"
              inputName="bankQuestionIds"
            />
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-800">
              {questions.length} visible / {totalReadyCount} ready
            </span>
          </div>
        </div>
      </div>

      {questions.length ? (
        <div className="divide-y divide-slate-100">
          {questions.map((row, index) => {
            const question = row.question!;
            const tags = row.tagSummaries.slice(0, 3);

            return (
              <label
                className="flex min-h-11 cursor-pointer gap-4 p-4 transition-colors hover:bg-sky-50/40"
                key={row.bankQuestionId}
              >
                <input
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600"
                  defaultChecked={defaultSelectedIds.has(row.bankQuestionId)}
                  form="publish-center-form"
                  name="bankQuestionIds"
                  type="checkbox"
                  value={row.bankQuestionId}
                />
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Student item {index + 1}
                      </span>
                      <span className="mt-1 block break-words text-base font-bold text-slate-950">
                        {question.title}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                        {question.question_type}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                        {row.difficultyLabel}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-1 ${statusClasses(
                          question.status,
                        )}`}
                      >
                        {question.status}
                      </span>
                      {row.isBlueprintApprovedContent ? (
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-violet-800">
                          Blueprint-approved
                        </span>
                      ) : null}
                    </span>
                  </span>

                  <span className="line-clamp-2 block text-sm leading-6 text-slate-700">
                    {row.promptPreview || "Prompt preview unavailable."}
                  </span>

                  <span className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        className="rounded-md border border-sky-100 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-900"
                        key={`${row.bankQuestionId}-${tag.tag_id}`}
                      >
                        {tag.label ?? tag.facet_key ?? "Taxonomy tag"}
                      </span>
                    ))}
                    {row.tagSummaries.length > tags.length ? (
                      <span className="px-2 py-1 text-xs font-semibold text-slate-500">
                        +{row.tagSummaries.length - tags.length} more
                      </span>
                    ) : null}
                  </span>

                  <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="teacher-focus-ring min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700">
                      Source and readiness details
                    </summary>
                    <dl className="mt-3 grid gap-2 text-xs text-slate-600 lg:grid-cols-2">
                      <div className="lg:col-span-2">
                        <dt className="font-semibold text-slate-500">Teacher source</dt>
                        <dd className="break-words">
                          {row.isBlueprintApprovedContent
                            ? row.blueprintLineage?.blueprintTitle ??
                              "Approved Blueprint-generated question"
                            : "Library"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Library question</dt>
                        <dd className="break-all">{shortId(row.bankQuestionId)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Question</dt>
                        <dd className="break-all">{shortId(question.id)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Review Draft</dt>
                        <dd className="break-all">
                          {shortId(row.blueprintLineage?.reviewItemId ?? question.source_review_item_id)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Blueprint</dt>
                        <dd className="break-all">
                          {shortId(row.blueprintLineage?.blueprintId)}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Published globally</dt>
                        <dd>{question.published_at ? "yes" : "no"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Readiness</dt>
                        <dd>
                          {row.readinessReasons.length
                            ? row.readinessReasons.join(" ")
                            : "Assignment-ready"}
                        </dd>
                      </div>
                    </dl>
                  </details>
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center">
          <p className="teacher-eyebrow">Nothing selectable</p>
          <h3 className="mt-2 text-xl font-bold text-slate-950">
            {emptyTitle}
          </h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {emptyCopy}
          </p>
          {selectedSource !== "package" ? (
            <Button asChild className="mt-5" variant="outline">
              <Link href={`/teacher/banks/${bankId}/review`}>
                Open Library Review Drafts
              </Link>
            </Button>
          ) : null}
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
        <p className="teacher-eyebrow">Target</p>
        <h2 className="text-xl font-bold text-slate-950">
          Choose one classroom
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          The standard path creates one recoverable delivery event at a time.
          Return here to assign the same content to another class.
        </p>
      </div>

      {classrooms.length ? (
        <div className="grid gap-3 p-5 lg:grid-cols-2">
          {classrooms.map((classroom) => (
            <label
              className="flex min-h-11 cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-sky-200 hover:bg-sky-50/60"
              key={classroom.id}
            >
              <input
                className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600"
                defaultChecked={classroom.id === preselectedClassroomId}
                form="publish-center-form"
                name="classroomIds"
                type="radio"
                value={classroom.id}
              />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-base font-bold text-slate-950">
                  {classroom.name}
                </span>
                <span className="mt-1 block text-sm text-slate-600">
                  {classroom.subject || "No subject set"}
                </span>
                <span className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
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
            Library items through Assignments.
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
  let sourceQuestions: PublishableBankQuestion[] = [];
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

  banks = banks.filter((bank) => canManageBankContent(bank.membershipRole));

  const requestedSource = normalizePublishSourceType(query.source);
  const selectedSource: PublishSourceType =
    requestedSource === "blueprint" ? "blueprint" : "bank";
  const selectedBank =
    banks.find((bank) => bank.id === query.sourceBankId) ?? null;
  const selectedBankId = selectedBank?.id ?? "";

  if (selectedBankId) {
    try {
      sourceQuestions = await listPublishableBankQuestions({
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

  const contentStats = summarizePublishableQuestions(sourceQuestions);
  const difficulty = normalizePublishDifficultyFilter(query.difficulty);
  const searchQuery = query.q?.trim() ?? "";
  const questionType = query.questionType?.trim() ?? "";
  const blueprintId = query.blueprintId?.trim() ?? "";
  const visibleQuestions = filterPublishableQuestions(sourceQuestions, {
    blueprintId,
    difficulty,
    query: searchQuery,
    questionType,
    source: selectedSource,
  });
  const totalReadyCount =
    selectedSource === "blueprint"
      ? contentStats.blueprintApprovedCount
      : contentStats.assignmentReadyCount;
  const clientRequestKey = randomUUID();
  const selectedQuestionIds =
    selectedBankId && query.selection && isDatabaseUuid(query.selection)
      ? new Set(
          (await readTeacherFocusSelectionReceipt({
            bankId: selectedBankId,
            receiptId: query.selection,
            supabase,
            surface: "questions",
          })) ?? [],
        )
      : new Set<string>();

  return (
    <TeacherWorkspaceShell
      eyebrow="Teacher assignment workflow"
      title={selectedBank ? "Create Assignment" : "Choose Assignment source"}
      description={
        selectedBank
          ? "Select reviewed Library questions, choose classroom delivery, then assign now or save a teacher-only draft."
          : "Start with one Library you own or edit. The next page focuses only on creating the Assignment."
      }
      actions={
        <Button asChild variant="outline">
          <Link href={selectedBank ? "/teacher/publish" : "/teacher/banks"}>
            {selectedBank ? "Change Library" : "Open Libraries"}
          </Link>
        </Button>
      }
    >
      <TeacherWorkspaceNav />

      {query.saved ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          id="assignment-server-error"
          role="alert"
          tabIndex={-1}
        >
          {query.error}
        </p>
      ) : null}

      {!banks.length ? (
        <section className="teacher-panel p-8 text-center">
          <p className="teacher-eyebrow">No manageable source Libraries</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            Create a Library or request editor access.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Assignment delivery requires owner or editor access to reviewed
            Library content. Viewer membership remains read-only.
          </p>
          <Button asChild className="mt-5">
            <Link href="/teacher/banks/new">Create Library</Link>
          </Button>
        </section>
      ) : !selectedBank ? (
        <SourceLibraryPicker banks={banks} />
      ) : (
        <>
          <section className="teacher-panel flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <BookOpenCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="teacher-eyebrow">Step 2 of 2 · Assignment source</p>
                <h2 className="break-words text-lg font-bold text-slate-950">
                  {selectedBank.name}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {questionBankVisibilityLabel(selectedBank.visibility)} ·{" "}
                  {bankMemberRoleLabel(selectedBank.membershipRole)} ·{" "}
                  {selectedBank.assignmentReadyCount} assignment-ready
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                className="min-h-11"
                variant={selectedSource === "bank" ? "default" : "outline"}
              >
                <Link
                  href={buildPublishHref({
                    classroomId: query.classroomId,
                    selection: query.selection,
                    source: "bank",
                    sourceBankId: selectedBankId,
                  })}
                >
                  All reviewed questions
                </Link>
              </Button>
              {contentStats.blueprintApprovedCount ? (
                <Button
                  asChild
                  className="min-h-11"
                  variant={
                    selectedSource === "blueprint" ? "default" : "outline"
                  }
                >
                  <Link
                    href={buildPublishHref({
                      classroomId: query.classroomId,
                      selection: query.selection,
                      source: "blueprint",
                      sourceBankId: selectedBankId,
                    })}
                  >
                    Blueprint-generated only
                  </Link>
                </Button>
              ) : null}
            </div>
          </section>

          <PublishFilters
            blueprintId={blueprintId}
            classroomId={query.classroomId}
            contentStats={contentStats}
            difficulty={difficulty}
            query={searchQuery}
            questionType={questionType}
            selection={query.selection}
            selectedBankId={selectedBankId}
            selectedSource={selectedSource}
          />

          <form
            action={publishQuestionBankAssignments}
            id="publish-center-form"
          >
            <input name="bankId" type="hidden" value={selectedBankId} />
            <input
              name="clientRequestKey"
              type="hidden"
              value={clientRequestKey}
            />
            <input name="sourceType" type="hidden" value={selectedSource} />
            <AssignmentComposerFlow
              content={
                <QuestionChecklist
                  bankId={selectedBankId}
                  defaultSelectedIds={selectedQuestionIds}
                  questions={visibleQuestions}
                  selectedSource={selectedSource}
                  totalReadyCount={totalReadyCount}
                />
              }
              initialStage={query.error ? "review" : "content"}
              target={
                <ClassroomTargets
                  classrooms={classrooms}
                  preselectedClassroomId={query.classroomId}
                />
              }
              review={
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
                  <section className="teacher-panel p-5">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                        <ClipboardList aria-hidden="true" className="size-5" />
                      </span>
                      <div>
                        <h2 className="text-lg font-bold text-slate-950">
                          Assignment details
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Add only what students need to understand this work.
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 space-y-4">
                      <AssignmentSelectionSummary
                        formId="publish-center-form"
                        helperText="Return to Content if you need to change the reviewed questions."
                        inputName="bankQuestionIds"
                        totalLabel="visible assignment-ready question(s)."
                        totalQuestions={visibleQuestions.length}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="title">Title</Label>
                        <Input
                          aria-describedby={
                            query.error ? "assignment-server-error" : undefined
                          }
                          aria-invalid={query.error ? true : undefined}
                          id="title"
                          maxLength={180}
                          name="title"
                          placeholder="Applications of Integration practice"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dueAt">Due date optional</Label>
                        <Input
                          aria-describedby={
                            query.error ? "assignment-server-error" : undefined
                          }
                          id="dueAt"
                          name="dueAt"
                          type="datetime-local"
                        />
                      </div>
                      <details className="rounded-lg border border-slate-200 bg-slate-50">
                        <summary className="teacher-focus-ring min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-slate-800">
                          Add optional instructions
                        </summary>
                        <div className="border-t border-slate-200 p-4">
                          <Label htmlFor="instructions">Instructions</Label>
                          <Textarea
                            className="mt-2"
                            id="instructions"
                            maxLength={4000}
                            name="instructions"
                            placeholder="Complete the selected questions. Start Practice from My Work if you need guided review."
                            rows={4}
                          />
                        </div>
                      </details>
                    </div>
                  </section>

                  <section className="teacher-panel p-5 xl:sticky xl:top-24 xl:self-start">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <ShieldCheck aria-hidden="true" className="size-5" />
                      </span>
                      <div>
                        <h2 className="text-lg font-bold text-slate-950">
                          Final review
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          One Library, one classroom, one delivery event.
                        </p>
                      </div>
                    </div>
                    <dl className="mt-5 space-y-3 text-sm">
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <dt className="font-semibold text-slate-500">
                          Source Library
                        </dt>
                        <dd className="mt-1 break-words font-bold text-slate-950">
                          {selectedBank.name}
                        </dd>
                      </div>
                      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                        <dt className="font-semibold text-sky-700">
                          Student visibility
                        </dt>
                        <dd className="mt-1 font-bold text-sky-950">
                          Assignment-only
                        </dd>
                      </div>
                    </dl>
                    <details className="mt-4 rounded-lg border border-slate-200">
                      <summary className="teacher-focus-ring min-h-11 cursor-pointer px-3 py-3 text-sm font-bold text-slate-800">
                        What students can and cannot see
                      </summary>
                      <div className="border-t border-slate-200 px-3 py-3 text-sm leading-6 text-slate-600">
                        <p>
                          Students see the title, instructions, due date, and
                          assigned prompts.
                        </p>
                        <p className="mt-2">
                          Answers, the full Library, Blueprint lineage, provider
                          data, and import metadata stay hidden.
                        </p>
                      </div>
                    </details>
                    <p className="mt-4 text-xs leading-5 text-slate-500">
                      Before creation, the server rechecks your Library role,
                      review status, question state, and classroom access.
                    </p>
                  </section>
                </div>
              }
            />
          </form>
        </>
      )}
    </TeacherWorkspaceShell>
  );
}
