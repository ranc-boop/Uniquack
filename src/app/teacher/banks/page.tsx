import Link from "next/link";
import {
  BookOpen,
  ClipboardCheck,
  Layers,
  Plus,
  Share2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
  questionBankStatusLabel,
  questionBankVisibilityLabel,
  type TeacherQuestionBankSummary,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  bankActionIcons,
  BankBadge,
  BankHeroPanel,
  BankMetricCard,
  BankQuickAction,
  BankSectionHeader,
  BankWorkbenchPage,
} from "./bank-ui";

export const dynamic = "force-dynamic";

const filterOptions = [
  { label: "All", value: "all" },
  { label: "Private", value: "private" },
  { label: "Shared", value: "shared" },
  { label: "Organization", value: "organization" },
  { label: "Public", value: "public" },
  { label: "Needs Review", value: "needs-review" },
  { label: "Recently Updated", value: "recent" },
  { label: "Assignment Ready", value: "assignment-ready" },
] as const;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function applyFilter(
  banks: TeacherQuestionBankSummary[],
  filter: string | undefined,
) {
  switch (filter) {
    case "private":
    case "shared":
    case "organization":
    case "public":
      return banks.filter((bank) => bank.visibility === filter);
    case "needs-review":
      return banks.filter((bank) => bank.reviewDraftCount > 0);
    case "assignment-ready":
      return banks.filter((bank) => bank.assignmentReadyCount > 0);
    case "recent":
      return [...banks].sort(
        (first, second) =>
          new Date(second.updated_at).getTime() -
          new Date(first.updated_at).getTime(),
      );
    default:
      return banks;
  }
}

function SetupNeededState() {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
      <p className="student-eyebrow">Setup needed</p>
      <h2 className="mt-2 text-xl font-bold text-slate-950">
        Question Bank tables are not available yet.
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Apply clean migration 0025 to enable teacher-owned Question Banks.
        Classrooms and assignments remain delivery layers until bank content is
        reviewed and selected.
      </p>
    </section>
  );
}

export default async function TeacherBanksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireTeacher();
  const { filter } = await searchParams;
  const supabase = await createClient();
  let banks: TeacherQuestionBankSummary[];
  let setupNeeded = false;

  try {
    banks = await listTeacherQuestionBanks({
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      setupNeeded = true;
      banks = [];
    } else {
      throw error;
    }
  }

  const activeFilter = filter ?? "all";
  const filteredBanks = applyFilter(banks, activeFilter);
  const totals = {
    assignmentReady: banks.reduce(
      (sum, bank) => sum + bank.assignmentReadyCount,
      0,
    ),
    imports: banks.reduce((sum, bank) => sum + bank.importBatchCount, 0),
    questions: banks.reduce((sum, bank) => sum + bank.questionCount, 0),
    reviewDrafts: banks.reduce((sum, bank) => sum + bank.reviewDraftCount, 0),
  };

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild>
              <Link className="inline-flex items-center gap-2" href="/teacher/banks/new">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Create Question Bank
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link className="inline-flex items-center gap-2" href="/teacher/banks/join">
                <Share2 aria-hidden="true" className="h-4 w-4" />
                Join Bank by Code
              </Link>
            </Button>
          </>
        }
        badges={<BankBadge tone="sky">Teacher repository</BankBadge>}
        eyebrow="Question Bank Library"
        title="Question Bank Library"
      >
        <p>
          Banks are your teacher content repositories. Classrooms and assignments
          deliver selected approved items.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />

      {setupNeeded ? (
        <SetupNeededState />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              {
                description: "Private, shared, organization, and public-review repositories.",
                icon: Layers,
                label: "Total banks",
                value: banks.length,
              },
              {
                description: "Approved items already inside teacher banks.",
                icon: BookOpen,
                label: "Questions",
                value: totals.questions,
              },
              {
                description: "Drafts waiting for bank-level approval.",
                icon: ClipboardCheck,
                label: "Review Drafts",
                value: totals.reviewDrafts,
              },
              {
                description: "Approved items ready for classroom delivery.",
                icon: bankActionIcons.assignment,
                label: "Assignment Ready",
                value: totals.assignmentReady,
              },
            ].map((metric) => (
              <BankMetricCard key={metric.label} {...metric} />
            ))}
          </section>

          <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
            <BankSectionHeader
              action={
                <p className="text-sm font-semibold text-slate-500">
                  {filteredBanks.length} shown
                </p>
              }
              description="Filter by ownership, review work, source activity, or classroom readiness."
              title="Library workbench"
            />
            <div className="border-b border-slate-100 p-4">
              <div className="flex gap-2 overflow-x-auto">
                {filterOptions.map((option) => {
                  const selected = activeFilter === option.value;

                  return (
                    <Link
                      className={`inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 ${
                        selected
                          ? "border-sky-300 bg-sky-100 text-sky-900"
                          : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
                      }`}
                      href={
                        option.value === "all"
                          ? "/teacher/banks"
                          : `/teacher/banks?filter=${option.value}`
                      }
                      key={option.value}
                    >
                      {option.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            {banks.length ? (
              <div className="divide-y divide-slate-100">
                {filteredBanks.map((bank) => (
                  <article className="p-5" key={bank.id}>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
                      <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <BankBadge tone="sky">
                            {questionBankVisibilityLabel(bank.visibility)}
                          </BankBadge>
                          <BankBadge>
                            {questionBankStatusLabel(bank.status)}
                          </BankBadge>
                          <BankBadge tone="blue">
                            {bankMemberRoleLabel(bank.membershipRole)}
                          </BankBadge>
                          <BankBadge tone={bank.activeMemberCount > 1 ? "indigo" : "slate"}>
                            {bank.activeMemberCount > 1
                              ? `${bank.activeMemberCount} members`
                              : "Owner workspace"}
                          </BankBadge>
                        </div>
                        <div>
                          <h2 className="break-words text-2xl font-bold text-slate-950">
                            {bank.name}
                          </h2>
                          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
                            {bank.description ||
                              "No description yet. Add reviewed questions here before classroom delivery."}
                          </p>
                        </div>
                        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          {[
                            ["Questions", bank.questionCount],
                            ["Review Drafts", bank.reviewDraftCount],
                            ["Imports", bank.importBatchCount],
                            ["Assignment Ready", bank.assignmentReadyCount],
                            ["Updated", formatDate(bank.updated_at)],
                          ].map(([label, value]) => (
                            <div
                              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                              key={label}
                            >
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {label}
                              </dt>
                              <dd className="mt-1 break-words text-sm font-bold text-slate-950">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <BankQuickAction
                          href={`/teacher/banks/${bank.id}`}
                          icon={bankActionIcons.bank}
                          variant="default"
                        >
                          Open bank
                        </BankQuickAction>
                        <BankQuickAction
                          href={`/teacher/banks/${bank.id}/review`}
                          icon={bankActionIcons.review}
                        >
                          Review drafts
                        </BankQuickAction>
                        <BankQuickAction
                          href={`/teacher/banks/${bank.id}/imports`}
                          icon={Upload}
                        >
                          Import material
                        </BankQuickAction>
                        {bank.assignmentReadyCount ? (
                          <BankQuickAction
                            href={`/teacher/banks/${bank.id}/assignments/new`}
                            icon={bankActionIcons.assignment}
                          >
                            Create assignment
                          </BankQuickAction>
                        ) : (
                          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                            Create assignment appears after reviewed questions are
                            approved into this bank.
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}

                {!filteredBanks.length ? (
                  <div className="p-8 text-center">
                    <p className="student-eyebrow">No matching banks</p>
                    <h2 className="mt-2 text-2xl font-bold text-slate-950">
                      No banks match this filter yet.
                    </h2>
                    <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Switch filters or create a new bank for this workflow.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <section className="p-8 text-center">
                <p className="student-eyebrow">Empty library</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  No banks yet. Create your first Question Bank or join a shared
                  bank by code.
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Banks hold reviewed teacher content before it moves into
                  classroom delivery.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link className="inline-flex items-center gap-2" href="/teacher/banks/new">
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      Create Question Bank
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link className="inline-flex items-center gap-2" href="/teacher/banks/join">
                      <Share2 aria-hidden="true" className="h-4 w-4" />
                      Join Bank by Code
                    </Link>
                  </Button>
                </div>
              </section>
            )}
          </section>
        </>
      )}
    </BankWorkbenchPage>
  );
}
