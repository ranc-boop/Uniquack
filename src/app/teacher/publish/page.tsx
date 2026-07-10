import Link from "next/link";
import type { ComponentType } from "react";

import {
  BookOpenCheck,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Filter,
  Megaphone,
  School,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideProps,
} from "lucide-react";

import { publishQuestionBankAssignments } from "@/app/teacher/publish/actions";
import { AssignmentSelectionSummary } from "@/components/teacher/assignment-selection-summary";
import { PublishSelectionControls } from "@/components/teacher/publish-selection-controls";
import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
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
    source?: string;
    sourceBankId?: string;
  }>;
};

type SourceOption = {
  count: number;
  description: string;
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  label: string;
  source: PublishSourceType;
  status: string;
};

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

function buildPublishHref({
  blueprintId,
  difficulty,
  query,
  questionType,
  source,
  sourceBankId,
}: {
  blueprintId?: string;
  difficulty?: PublishDifficultyFilter;
  query?: string;
  questionType?: string;
  source?: PublishSourceType;
  sourceBankId?: string;
}) {
  const params = new URLSearchParams();

  if (sourceBankId) params.set("sourceBankId", sourceBankId);
  if (source && source !== "bank") params.set("source", source);
  if (query) params.set("q", query);
  if (questionType) params.set("questionType", questionType);
  if (difficulty && difficulty !== "all") params.set("difficulty", difficulty);
  if (blueprintId) params.set("blueprintId", blueprintId);

  return params.size ? `/teacher/publish?${params.toString()}` : "/teacher/publish";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function sourceCardClass({
  disabled,
  selected,
}: {
  disabled?: boolean;
  selected: boolean;
}) {
  if (selected) {
    return "border-sky-300 bg-sky-50 shadow-sm ring-1 ring-sky-100";
  }

  if (disabled) {
    return "border-slate-200 bg-slate-50/80 text-slate-600";
  }

  return "border-slate-200 bg-white/95 shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60";
}

function sourceBadgeClass({ disabled, selected }: { disabled?: boolean; selected: boolean }) {
  if (selected) return "border-sky-200 bg-white text-sky-800";
  if (disabled) return "border-slate-200 bg-white text-slate-600";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
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

function makeSourceOptions(summary: PublishContentSummary): SourceOption[] {
  return [
    {
      count: summary.bankQuestionCount,
      description:
        "Choose approved active questions from a bank and deliver selected items as assignment-only work.",
      icon: BookOpenCheck,
      label: "Question Bank",
      source: "bank",
      status: `${summary.bankQuestionCount} ready`,
    },
    {
      count: summary.blueprintApprovedCount,
      description:
        "Use only Blueprint-generated questions after they pass Review Draft approval and enter this bank.",
      disabled: summary.blueprintApprovedCount === 0,
      icon: Sparkles,
      label: "Blueprint",
      source: "blueprint",
      status: summary.blueprintApprovedCount
        ? `${summary.blueprintApprovedCount} approved`
        : "No approved generated questions",
    },
    {
      count: summary.packageReadyCount,
      description:
        "Packages are visible in the workflow, but package publishing is not assignment-ready yet.",
      disabled: true,
      icon: Boxes,
      label: "Package",
      source: "package",
      status: "Not ready",
    },
  ];
}

function SourceTypeCards({
  contentStats,
  selectedBankId,
  selectedSource,
}: {
  contentStats: PublishContentSummary;
  selectedBankId: string;
  selectedSource: PublishSourceType;
}) {
  const options = makeSourceOptions(contentStats);

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      {options.map(({ description, disabled, icon: Icon, label, source, status }) => {
        const selected = selectedSource === source;
        const content = (
          <article
            className={`h-full rounded-lg border p-4 ${sourceCardClass({
              disabled,
              selected,
            })}`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  selected
                    ? "bg-white text-sky-700"
                    : disabled
                      ? "bg-white text-slate-500"
                      : "bg-sky-100 text-sky-700"
                }`}
              >
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-slate-950">{label}</h2>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(
                      {
                        disabled,
                        selected,
                      },
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
        );

        return disabled ? (
          <div aria-disabled="true" key={source}>
            {content}
          </div>
        ) : (
          <Link
            href={buildPublishHref({
              source,
              sourceBankId: selectedBankId,
            })}
            key={source}
          >
            {content}
          </Link>
        );
      })}
    </section>
  );
}

function BankPicker({
  banks,
  selectedBankId,
  selectedSource,
}: {
  banks: TeacherQuestionBankSummary[];
  selectedBankId: string;
  selectedSource: PublishSourceType;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="teacher-eyebrow">Source bank</p>
            <h2 className="text-xl font-bold text-slate-950">
              Choose the content owner
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Publish can deliver selected reviewed items from one accessible
              bank at a time. The bank itself stays private unless separately
              shared.
            </p>
          </div>
          <form action="/teacher/publish" className="flex flex-wrap gap-2">
            <input name="source" type="hidden" value={selectedSource} />
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
              href={buildPublishHref({
                source: selectedSource,
                sourceBankId: bank.id,
              })}
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

function PublishFilters({
  blueprintId,
  contentStats,
  difficulty,
  query,
  questionType,
  selectedBankId,
  selectedSource,
}: {
  blueprintId: string;
  contentStats: PublishContentSummary;
  difficulty: PublishDifficultyFilter;
  query: string;
  questionType: string;
  selectedBankId: string;
  selectedSource: PublishSourceType;
}) {
  return (
    <section className="teacher-panel p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <Filter aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Find assignment-ready content
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Filters affect the visible checklist only. Submit still rechecks
            approved status, bank scope, classroom access, and source lineage.
          </p>
        </div>
      </div>
      <form action="/teacher/publish" className="mt-5 grid gap-3 lg:grid-cols-5">
        <input name="source" type="hidden" value={selectedSource} />
        <input name="sourceBankId" type="hidden" value={selectedBankId} />
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
        <div>
          <Button className="w-full" type="submit" variant="outline">
            Apply filters
          </Button>
        </div>
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
              <option value="">All approved Blueprint-generated bank questions</option>
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
    </section>
  );
}

function QuestionChecklist({
  bankId,
  questions,
  selectedSource,
  totalReadyCount,
}: {
  bankId: string;
  questions: PublishableBankQuestion[];
  selectedSource: PublishSourceType;
  totalReadyCount: number;
}) {
  const emptyTitle =
    selectedSource === "blueprint"
      ? "No approved Blueprint-generated bank questions match these filters."
      : selectedSource === "package"
        ? "Package publishing is not assignment-ready yet."
        : "No assignment-ready questions match these filters.";
  const emptyCopy =
    selectedSource === "blueprint"
      ? "Blueprint rows are not directly publishable. Generate questions from an approved Blueprint, send them through Review Drafts, approve them into this bank, then return here."
      : selectedSource === "package"
        ? "Package sources are visible for workflow clarity, but only approved bank questions can be assigned in this PR."
        : "Publish cannot deliver raw AI drafts or unreviewed material. Approve usable bank Review Drafts, then return here.";

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
              Every checked row is an active bank question. Students receive the
              assignment item, not the source bank, answer key, or Blueprint
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
            const tags = row.tagSummaries.slice(0, 5);

            return (
              <label
                className="flex cursor-pointer gap-4 p-5 transition hover:bg-sky-50/40"
                key={row.bankQuestionId}
              >
                <input
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-sky-600"
                  form="publish-center-form"
                  name="bankQuestionIds"
                  type="checkbox"
                  value={row.bankQuestionId}
                />
                <span className="min-w-0 flex-1 space-y-3">
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

                  <span className="block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">
                    {row.promptPreview || "Prompt preview unavailable."}
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
                              key={`${row.bankQuestionId}-${tag.tag_id}`}
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
                        Source visible to teacher
                      </span>
                      <span className="mt-1 block break-words text-sm font-semibold text-slate-900">
                        {row.isBlueprintApprovedContent
                          ? row.blueprintLineage?.blueprintTitle ??
                            "Approved Blueprint-generated question"
                          : "Question Bank"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Student preview hides this source context.
                      </span>
                    </span>
                  </span>

                  <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Expand source and readiness details
                    </summary>
                    <dl className="mt-3 grid gap-2 text-xs text-slate-600 lg:grid-cols-2">
                      <div>
                        <dt className="font-semibold text-slate-500">Bank question</dt>
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
                Open bank Review Drafts
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
          Choose classroom delivery
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Class-level delivery is supported. Selected-student delivery is shown
          below as a future targeting option.
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
          <article className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-slate-600">
            <div className="flex items-start gap-3">
              <Users aria-hidden="true" className="mt-1 h-5 w-5" />
              <div>
                <h3 className="font-bold text-slate-800">Selected students</h3>
                <p className="mt-1 text-sm leading-6">
                  Future option. V2 publishes to whole classrooms so assignment
                  access remains easy to audit.
                </p>
              </div>
            </div>
          </article>
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

function StudentPreviewPanel({
  selectedSource,
}: {
  selectedSource: PublishSourceType;
}) {
  return (
    <section className="teacher-panel p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-slate-950">Student preview</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Students see title, instructions, due date, and selected prompts in
            order.
          </p>
        </div>
      </div>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <dt className="font-semibold text-emerald-700">Hidden from students</dt>
          <dd className="mt-1 text-emerald-950">
            Answers, solutions, full source bank, Blueprint internals, provider
            metadata, and import metadata.
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <dt className="font-semibold text-slate-500">Current source mode</dt>
          <dd className="mt-1 font-bold capitalize text-slate-950">
            {selectedSource === "blueprint"
              ? "Blueprint-approved bank questions"
              : selectedSource}
          </dd>
        </div>
      </dl>
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

  const selectedSource = normalizePublishSourceType(query.source);
  const selectedBankId =
    banks.find((bank) => bank.id === query.sourceBankId)?.id ??
    banks.find((bank) => bank.assignmentReadyCount > 0)?.id ??
    banks[0]?.id ??
    "";

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
  const selectedBank = banks.find((bank) => bank.id === selectedBankId) ?? null;
  const totalReadyCount =
    selectedSource === "blueprint"
      ? contentStats.blueprintApprovedCount
      : selectedSource === "package"
        ? 0
        : contentStats.assignmentReadyCount;

  return (
    <TeacherWorkspaceShell
      eyebrow="Teacher publish workflow"
      title="Publish"
      description="Publish distributes selected approved bank content to classes. Students see assigned items only, not the full source bank."
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

      <SourceTypeCards
        contentStats={contentStats}
        selectedBankId={selectedBankId}
        selectedSource={selectedSource}
      />

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
          <BankPicker
            banks={banks}
            selectedBankId={selectedBankId}
            selectedSource={selectedSource}
          />

          <PublishFilters
            blueprintId={blueprintId}
            contentStats={contentStats}
            difficulty={difficulty}
            query={searchQuery}
            questionType={questionType}
            selectedBankId={selectedBankId}
            selectedSource={selectedSource}
          />

          <form
            action={publishQuestionBankAssignments}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_25rem]"
            id="publish-center-form"
          >
            <input name="bankId" type="hidden" value={selectedBankId} />
            <input name="sourceType" type="hidden" value={selectedSource} />
            <div className="space-y-6">
              <QuestionChecklist
                bankId={selectedBankId}
                questions={visibleQuestions}
                selectedSource={selectedSource}
                totalReadyCount={totalReadyCount}
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
                      Assignment details
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Configure the work students will see in My Work.
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-4">
                  <AssignmentSelectionSummary
                    formId="publish-center-form"
                    helperText="Choose approved bank questions before saving or assigning."
                    inputName="bankQuestionIds"
                    totalLabel="visible assignment-ready question(s)."
                    totalQuestions={visibleQuestions.length}
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

              <StudentPreviewPanel selectedSource={selectedSource} />

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
                      Confirm source, target, and visibility before creating
                      classroom delivery.
                    </p>
                  </div>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="font-semibold text-slate-500">Source bank</dt>
                    <dd className="mt-1 break-words font-bold text-slate-950">
                      {selectedBank?.name ?? "No bank selected"}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="font-semibold text-slate-500">
                      Approved content
                    </dt>
                    <dd className="mt-1 font-bold text-slate-950">
                      {totalReadyCount} item(s) available in this source mode
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
                      Blueprint rows must generate reviewed bank questions.
                      Package publishing remains not ready.
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 grid gap-2">
                  <Button
                    disabled={!visibleQuestions.length || !classrooms.length}
                    name="publishMode"
                    type="submit"
                    value="assigned"
                  >
                    Assign now
                  </Button>
                  <Button
                    disabled={!visibleQuestions.length || !classrooms.length}
                    name="publishMode"
                    type="submit"
                    value="draft"
                    variant="outline"
                  >
                    Save draft
                  </Button>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  The server re-loads selected questions and classrooms before
                  creating assignments. Stale, draft, archived, or unapproved
                  selections are blocked.
                </p>
              </section>

              <section className="teacher-soft-panel p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700">
                    <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">
                      Safety gates
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
              <h2 className="font-bold text-slate-950">Selected students later</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Individual targeting stays disabled until roster-level policy is
                stable.
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
              <h2 className="font-bold text-slate-950">Draft or assign now</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Save a teacher-only draft or assign immediately to the selected
                class.
              </p>
            </div>
          </div>
        </div>
      </section>
    </TeacherWorkspaceShell>
  );
}
