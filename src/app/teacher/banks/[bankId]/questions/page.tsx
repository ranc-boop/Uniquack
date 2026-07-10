import Link from "next/link";
import { notFound } from "next/navigation";

import { BookOpen, ClipboardCheck, Tags, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  getTeacherQuestionBankDetail,
  listBankApprovedQuestions,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  bankActionIcons,
  BankBadge,
  BankHeroPanel,
  BankMetricCard,
  BankQuickAction,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank questions are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migrations 0025 and 0027 before using bank questions.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankQuestionsPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const supabase = await createClient();
  let detail;
  let questions = [];

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    questions = await listBankApprovedQuestions({ bankId, supabase });
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
  const assignmentReadyCount = questions.filter(
    (row) => row.status === "active" && row.question?.status === "draft",
  ).length;
  const taggedCount = questions.filter((row) => row.tagSummaries.length).length;

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <BankQuickAction
              href={`/teacher/publish?sourceBankId=${bank.id}`}
              icon={bankActionIcons.assignment}
              variant={questions.length ? "default" : "outline"}
            >
              Publish selected work
            </BankQuickAction>
          </>
        }
        badges={
          <>
            <BankBadge tone="sky">
              {questionBankVisibilityLabel(bank.visibility)}
            </BankBadge>
            <BankBadge tone="blue">
              {bankMemberRoleLabel(currentUserRole ?? "viewer")}
            </BankBadge>
          </>
        }
        eyebrow="Question database"
        title={`Reviewed content in ${bank.name}`}
      >
        <p>
          These questions belong to this bank through explicit bank membership.
          They are not public/global questions, and unreviewed drafts are not
          assignment-ready.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      <section className="grid gap-3 md:grid-cols-4">
        <BankMetricCard
          description="Active approved rows in this repository."
          icon={BookOpen}
          label="Bank questions"
          value={questions.length}
        />
        <BankMetricCard
          description="Rows that can be selected for delivery."
          icon={ClipboardCheck}
          label="Assignment Ready"
          value={assignmentReadyCount}
        />
        <BankMetricCard
          description="Questions with taxonomy grounding attached."
          icon={Tags}
          label="Tagged"
          value={taggedCount}
        />
        <BankMetricCard
          description="Private bank, shared, organization, or public review."
          icon={bankActionIcons.bank}
          label="Visibility"
          value={questionBankVisibilityLabel(bank.visibility)}
        />
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          action={
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/imports`}
              icon={Upload}
            >
              Import material
            </BankQuickAction>
          }
          description="Use this as the bank question database. Source lineage, taxonomy status, and assignment readiness stay visible before classroom delivery."
          title="Active bank questions"
        />
        <div className="divide-y divide-slate-100">
          {questions.length ? (
            questions.map((row) => {
              const question = row.question;
              const difficulty = question?.difficulty_rating
                ? `Difficulty ${question.difficulty_rating}`
                : "Not set";

              return (
                <article className="space-y-3 p-5" key={row.bank_question_id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <BankBadge tone="sky">Bank-scoped</BankBadge>
                        <BankBadge>{row.source_kind}</BankBadge>
                        {question ? (
                          <BankBadge tone="blue">{question.status}</BankBadge>
                        ) : null}
                        <BankBadge tone="indigo">Assignment ready</BankBadge>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        {question?.title ?? "Question unavailable"}
                      </h3>
                      {question ? (
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ["Type", question.question_type],
                            ["Difficulty", difficulty],
                            ["Visibility", question.visibility],
                            ["Added", formatDate(row.added_at)],
                          ].map(([label, value]) => (
                            <div
                              className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"
                              key={label}
                            >
                              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {label}
                              </dt>
                              <dd className="mt-1 break-words text-sm font-semibold text-slate-950">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                    {question ? (
                      <Button asChild variant="outline">
                        <Link href={`/teacher/publish?sourceBankId=${bank.id}`}>
                          Use in assignment
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Taxonomy / knowledge point
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {row.tagSummaries.length ? (
                          row.tagSummaries.slice(0, 8).map((tag) => (
                            <span
                              className="inline-flex max-w-full flex-col rounded-lg border border-sky-100 bg-sky-50 px-2.5 py-1 text-xs text-sky-950"
                              key={`${row.bank_question_id}-${tag.tag_id}`}
                            >
                              <span className="font-semibold">
                                {tag.label ?? "Taxonomy tag"}
                              </span>
                              <span className="max-w-xs overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-sky-700">
                                {tag.facet_key ?? "facet"} Â· {tag.review_status}
                              </span>
                            </span>
                          ))
                        ) : (
                          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Not tagged yet
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Source lineage
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {question?.source_kind || row.source_kind}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {question?.source_review_item_id
                          ? `Review Draft reference ${question.source_review_item_id}`
                          : "Source Review Draft not attached"}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="p-8 text-center">
              <p className="teacher-eyebrow">Empty bank</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                No reviewed questions in this bank yet.
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Import private material, review the drafts, then approve
                questions into this bank.
              </p>
              <Button asChild className="mt-5" variant="outline">
                <Link href={`/teacher/banks/${bank.id}/imports`}>
                  Import material
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
