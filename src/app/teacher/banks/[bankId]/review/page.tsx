import Link from "next/link";
import { notFound } from "next/navigation";

import { AlertTriangle, ClipboardCheck, FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankReviewDraftQuestions,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import { approveBankReviewQuestion } from "../../actions";
import {
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
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank Review Draft scope is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0027 before approving drafts into a bank.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  let draftQuestions = [];

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    draftQuestions = await listBankReviewDraftQuestions({ bankId, supabase });
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
  const canApprove = canManageBankContent(currentUserRole);
  const warningCount = draftQuestions.reduce(
    (sum, question) => sum + question.warningCount,
    0,
  );

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/imports`}
              icon={Upload}
            >
              Import material
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
        eyebrow="Teacher QA queue"
        title={`Review Drafts for ${bank.name}`}
      >
        <p>
          Approve drafts into this bank. This does not publish them to the
          public library.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Approval adds reviewed content to this bank only and does not create
          an assignment.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      {query.saved ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {query.saved}
        </section>
      ) : null}
      {query.error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {query.error}
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <BankMetricCard
          description="Draft questions scoped to this bank."
          icon={ClipboardCheck}
          label="Pending drafts"
          value={draftQuestions.length}
        />
        <BankMetricCard
          description="Warnings to inspect before approval."
          icon={AlertTriangle}
          label="Warnings"
          value={warningCount}
        />
        <BankMetricCard
          description="Only owners and editors can approve into a bank."
          icon={FileText}
          label="Review role"
          value={canApprove ? "Can approve" : "Read-only"}
        />
      </section>

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="Source lineage, taxonomy suggestions, and validation warnings remain attached for bank-level review."
          title="Pending private drafts"
        />
        <div className="divide-y divide-slate-100">
          {draftQuestions.length ? (
            draftQuestions.map((question) => (
              <article className="space-y-4 p-5" key={question.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <BankBadge tone="amber">Review required</BankBadge>
                      <BankBadge>{question.question_type}</BankBadge>
                      <BankBadge tone="slate">
                        Difficulty {question.difficulty_rating}
                      </BankBadge>
                      {question.warningCount ? (
                        <BankBadge tone="rose">
                          {question.warningCount} warning
                          {question.warningCount === 1 ? "" : "s"}
                        </BankBadge>
                      ) : null}
                    </div>
                    <h3 className="text-lg font-bold text-slate-950">
                      {question.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {question.question_code || "Code pending"} ·{" "}
                      {formatDate(question.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {question.tagIds.length ? (
                        question.tagIds.slice(0, 8).map((tagId) => (
                          <span
                            className="max-w-full rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100"
                            key={tagId}
                            title={tagId}
                          >
                            Taxonomy suggestion
                          </span>
                        ))
                      ) : (
                        <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
                          No taxonomy tags yet
                        </span>
                      )}
                    </div>
                  </div>
                  {canApprove ? (
                    <form action={approveBankReviewQuestion}>
                      <input name="bankId" type="hidden" value={bank.id} />
                      <input
                        name="questionId"
                        type="hidden"
                        value={question.id}
                      />
                      <Button type="submit">Approve into bank</Button>
                    </form>
                  ) : null}
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_0.8fr]">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Approval adds this question to {bank.name}. It stays
                  bank-scoped and is not globally published.
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                    Source lineage:{" "}
                    <span className="font-semibold">
                      {question.source_kind || question.source || "import"}
                    </span>
                    {question.source_review_item_id ? (
                      <span className="mt-1 block break-all text-xs text-slate-500">
                        Review item {question.source_review_item_id}
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="student-eyebrow">No pending drafts</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                This bank has no private Review Drafts waiting.
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Import material into the bank to create review-gated draft
                questions.
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
