import Link from "next/link";
import { notFound } from "next/navigation";

import { ClipboardCheck } from "lucide-react";

import { AIJobStatusPanel } from "@/components/ai-jobs/ai-job-status-panel";
import { FormSubmitButton } from "@/components/form-submit-button";
import { TeacherPdfBurstUpload } from "@/components/teacher/teacher-pdf-burst-upload";
import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  AIProviderJobQueueSchemaMissingError,
  listAIProviderJobsForBank,
} from "@/lib/ai-jobs/queue";
import type { AIProviderJobSafeStatus } from "@/lib/ai-jobs/types";
import {
  listAIPdfBurstsForBank,
  type AIPdfBurstSafeSummary,
} from "@/lib/ai-pdf-import/burst-admission";
import { listTeacherAIPdfParsingProfileState } from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankImportBatches,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  importBankJsonDrafts,
  queueBankPdfCoverageRecovery,
} from "../../actions";
import {
  cancelTeacherAIProviderJob,
  retryTeacherAIProviderJob,
} from "../../../ai-jobs/actions";
import {
  BankImportEntryPanel,
  RecentBankImportsPanel,
  TeacherImportSafetyCallout,
} from "../../bank-import-ui";
import {
  BankBadge,
  BankHeroPanel,
  BankQuickAction,
  BankRouteTabs,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

const sampleJson = JSON.stringify(
  {
    questions: [
      {
        answer_spec: { kind: "exact_text", value: "2" },
        content_html: "<p>Solve: x + 3 = 5.</p>",
        content_source: "Solve: x + 3 = 5.",
        content_source_format: "plain_text",
        difficulty_rating: 320,
        options: [],
        question_code: `bank-draft-${Date.now()}`,
        question_type: "fill_blank",
        solution_html: "<p>Subtract 3 from both sides to get x = 2.</p>",
        solution_source: "Subtract 3 from both sides to get x = 2.",
        solution_source_format: "plain_text",
        tag_ids: [],
        title: "Bank draft equation",
      },
    ],
  },
  null,
  2,
);

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank import scope is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0027 before using teacher-private bank imports.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankImportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{ error?: string; job?: string; saved?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  let importBatches = [];
  let pdfBursts: AIPdfBurstSafeSummary[] = [];
  let pdfBurstSchemaAvailable = false;
  let queueJobs: AIProviderJobSafeStatus[] = [];
  let queueSetupNeeded = false;
  const parsingProfileState =
    await listTeacherAIPdfParsingProfileState(supabase);

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    importBatches = await listBankImportBatches({ bankId, supabase });
    const burstState = await listAIPdfBurstsForBank({ bankId, supabase });
    pdfBursts = burstState.bursts;
    pdfBurstSchemaAvailable = burstState.available;
    try {
      queueJobs = await listAIProviderJobsForBank({ bankId, supabase });
    } catch (error) {
      if (error instanceof AIProviderJobQueueSchemaMissingError) {
        queueSetupNeeded = true;
      } else {
        throw error;
      }
    }
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
  const canImport = canManageBankContent(currentUserRole);
  const canRunPdfImport = canImport && parsingProfileState.available;

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/review`}
              icon={ClipboardCheck}
            >
              Review Drafts
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
        eyebrow="AI Parsing into bank"
        title={`Import material into ${bank.name}`}
      >
        <p>
          Imported material creates Review Drafts for this bank. Drafts stay
          private until an owner or editor reviews them.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />
      <TeacherImportSafetyCallout />

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

      {queueSetupNeeded ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          Durable AI queue setup is needed before new bank AI Parsing runs can start. Existing sources and Review Drafts are unchanged.
        </section>
      ) : null}

      <AIJobStatusPanel
        cancelAction={cancelTeacherAIProviderJob}
        jobs={queueJobs}
        retryAction={retryTeacherAIProviderJob}
        returnTo={`/teacher/banks/${bankId}/imports`}
        reviewHref={`/teacher/banks/${bankId}/review`}
        title="Bank AI Parsing status"
      />

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="space-y-4">
          <BankImportEntryPanel
            bank={{
              ...bank,
              assignmentReadyCount: detail.assignmentReadyCount,
              importBatchCount: importBatches.length,
              membershipRole: currentUserRole,
              questionCount: detail.questionCount,
              reviewDraftCount: detail.reviewDraftCount,
            }}
            canImport={canImport}
            showImportAction={false}
            showChangeTarget
          />

          <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="teacher-eyebrow">Teacher PDF import</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Upload PDF to create bank Review Drafts
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                AI Parsing runs server-side and keeps generated questions as
                private drafts in this bank until review.
              </p>
            </div>
            {!parsingProfileState.available ? (
              <div className="border-t border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <p className="font-semibold">
                  AI PDF parsing is not enabled for this site or organization yet.
                </p>
                <p className="mt-1">
                  A platform admin must enable a shared AI provider in Admin / AI Settings.
                </p>
              </div>
            ) : null}
            <TeacherPdfBurstUpload
              bankId={bank.id}
              bankName={bank.name}
              canUpload={canRunPdfImport}
              initialBursts={pdfBursts}
              parsingProfile={parsingProfileState.defaultProfile}
              schemaAvailable={pdfBurstSchemaAvailable}
            />
            <div className="border-t border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Review is required before assignment. Uploading does not publish
              questions or expose the source Bank to students.
            </div>
          </section>

          <details className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-900">
                Advanced / Developer fixture
                <span className="text-xs font-semibold text-slate-500">
                  JSON is not the primary teacher flow
                </span>
              </summary>
              <form action={importBankJsonDrafts} className="space-y-4 border-t border-slate-200 bg-white p-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                  Developer fixture for smoke testing. Normal teachers should
                  use AI Parsing import.
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                  Review gate: no imported draft is assignable or globally
                  published from this page.
                </div>
                <input name="bankId" type="hidden" value={bank.id} />
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">
                    Draft question JSON
                  </span>
                  <textarea
                    className="mt-2 min-h-72 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    defaultValue={sampleJson}
                    name="jsonText"
                    readOnly={!canImport}
                  />
                </label>
                {canImport ? (
                  <FormSubmitButton pendingLabel="Creating drafts...">
                    Create bank Review Drafts
                  </FormSubmitButton>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Viewers can inspect bank content later, but only owners and
                    editors can import new drafts.
                  </p>
                )}
              </form>
            </details>
        </div>

          <RecentBankImportsPanel
            bankName={bank.name}
            canQueueCoverageRecovery={canImport}
            coverageRecoveryAction={queueBankPdfCoverageRecovery}
            importBatches={importBatches}
        />
      </section>
    </BankWorkbenchPage>
  );
}
