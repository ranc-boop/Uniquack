import Link from "next/link";
import { notFound } from "next/navigation";


import { AIJobStatusPanel } from "@/components/ai-jobs/ai-job-status-panel";
import { BatchImportJsonPanelLoader } from "@/components/batch-import-json-panel-loader";
import { TeacherBankImportTransition } from "@/components/teacher/teacher-bank-import-transition";
import { TeacherPdfBurstUpload } from "@/components/teacher/teacher-pdf-burst-upload";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { bankQuestionWorkspaceCapabilities } from "@/lib/questions/workspace";
import {
  AIProviderJobQueueSchemaMissingError,
  listAIProviderJobsForBank,
} from "@/lib/ai-jobs/queue";
import { listAIPdfBurstsForBank } from "@/lib/ai-pdf-import/burst-admission";
import { listTeacherAIPdfParsingProfileState } from "@/lib/ai-pdf-import/teacher-parsing-profiles";
import {
  canManageBankContent,
  getTeacherQuestionBankAccess,
  getTeacherBankImportWorkspace,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";

import {
  importBankJsonDraftsInteractive,
  previewBankJsonImport,
  queueBankPdfCoverageRecovery,
} from "../../actions";
import {
  cancelTeacherAIProviderJob,
  retryTeacherAIProviderJob,
} from "../../../ai-jobs/actions";
import {
  RecentBankImportsPanel,
} from "../../bank-import-ui";
import {
  BankRouteTabs,
  BankHeroPanel,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";
import { BankManualQuestionForm } from "../../bank-manual-question-form";

export const dynamic = "force-dynamic";

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Library import scope is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0027 before using teacher-private Library imports.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

async function listAIQueueState({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  try {
    return {
      jobs: await listAIProviderJobsForBank({ bankId, supabase }),
      setupNeeded: false,
    };
  } catch (error) {
    if (error instanceof AIProviderJobQueueSchemaMissingError) {
      return { jobs: [], setupNeeded: true };
    }
    throw error;
  }
}

export default async function TeacherBankImportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
    error?: string;
    job?: string;
    mode?: string;
    saved?: string;
  }>;
}) {
  const profilePromise = requireTeacher();
  const [{ bankId }, query, supabase] = await Promise.all([
    params,
    searchParams,
    createClient(),
  ]);
  const mode = ["manual", "json", "ai"].includes(query.mode ?? "")
    ? (query.mode as "manual" | "json" | "ai")
    : "manual";
  const taxonomyPromise =
    mode === "ai" ? Promise.resolve(null) : loadTaxonomyCatalog(supabase);
  const parsingProfilePromise =
    mode === "ai"
      ? listTeacherAIPdfParsingProfileState(supabase)
      : Promise.resolve(null);
  const burstPromise =
    mode === "ai"
      ? listAIPdfBurstsForBank({ bankId, supabase })
      : Promise.resolve(null);
  const queuePromise =
    mode === "ai"
      ? listAIQueueState({ bankId, supabase })
      : Promise.resolve(null);
  const importWorkspacePromise =
    mode === "ai"
      ? getTeacherBankImportWorkspace({
          bankId,
          resolveProfileId: async () => (await profilePromise).id,
          supabase,
        })
      : profilePromise.then(async (profile) => ({
          access: await getTeacherQuestionBankAccess({
            bankId,
            profileId: profile.id,
            supabase,
          }),
          importBatches: [],
          usedReadModel: false,
        }));
  const loadPageData = () =>
    Promise.all([
      importWorkspacePromise,
      taxonomyPromise,
      parsingProfilePromise,
      burstPromise,
      queuePromise,
    ] as const);
  let pageData: Awaited<ReturnType<typeof loadPageData>>;

  try {
    pageData = await loadPageData();
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  const [
    importWorkspace,
    taxonomyResult,
    parsingProfileState,
    burstState,
    queueState,
  ] = pageData;

  if (!importWorkspace.access) {
    notFound();
  }

  const { bank, currentUserRole } = importWorkspace.access;
  const importBatches = importWorkspace.importBatches;
  const taxonomyCatalog = taxonomyResult?.catalog ?? {
    facets: [],
    nodes: [],
  };
  const pdfBursts = burstState?.bursts ?? [];
  const pdfBurstSchemaAvailable = burstState?.available ?? false;
  const queueJobs = queueState?.jobs ?? [];
  const queueSetupNeeded = queueState?.setupNeeded ?? false;
  const canImport = canManageBankContent(currentUserRole);
  if (!canImport) {
    notFound();
  }
  const workspaceRole = currentUserRole ?? "viewer";
  const capabilities = bankQuestionWorkspaceCapabilities(workspaceRole);
  const canRunPdfImport = canImport && (parsingProfileState?.available ?? false);
  const parentTagIds = new Set(
    taxonomyCatalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );
  const importPromptTagIds = taxonomyCatalog.nodes
    .filter(
      (node) => node.is_assignable && !parentTagIds.has(node.tag_id),
    )
    .map((node) => node.tag_id)
    .sort();
  const previewJsonAction = previewBankJsonImport.bind(null, bank.id);
  const importJsonAction = importBankJsonDraftsInteractive.bind(null, bank.id);

  return (
    <BankWorkbenchPage>
      <BankHeroPanel subtitle={bank.name} title="Import" />

      <BankRouteTabs bankId={bank.id} currentUserRole={currentUserRole} />

      <TeacherBankImportTransition bankId={bank.id} mode={mode}>

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
          Durable AI queue setup is needed before new Library AI Parsing runs can start. Existing sources and Review Drafts are unchanged.
        </section>
      ) : null}

      {mode === "ai" ? (
        <AIJobStatusPanel
          cancelAction={cancelTeacherAIProviderJob}
          jobs={queueJobs}
          retryAction={retryTeacherAIProviderJob}
          returnTo={`/teacher/banks/${bankId}/imports?mode=ai`}
          reviewHref={`/teacher/banks/${bankId}/review`}
          title="Library AI Parsing status"
        />
      ) : null}

      <section
        className={
          mode === "ai"
            ? "grid gap-4 lg:grid-cols-[1.3fr_0.8fr]"
            : "grid gap-4"
        }
      >
        <div className="space-y-4">
          {mode === "manual" ? (
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="teacher-eyebrow">Manual</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Create question
                </h2>
              </div>
              <div className="p-5">
                <BankManualQuestionForm
                  bankId={bank.id}
                  canImport={canImport}
                  taxonomyCatalog={taxonomyCatalog}
                />
              </div>
            </section>
          ) : null}

          {mode === "json" ? (
            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="teacher-eyebrow">JSON</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">
                  Validate and import structured drafts
                </h2>
              </div>
              <div className="p-5">
                <BatchImportJsonPanelLoader
                  capabilities={capabilities}
                  importAction={importJsonAction}
                  previewAction={previewJsonAction}
                  questionsHref={`/teacher/banks/${bank.id}/questions`}
                  resultDescription={`Imported questions are private Review Drafts in ${bank.name}. Review is required before assignment.`}
                  reviewHref={`/teacher/banks/${bank.id}/review`}
                  scope={{ kind: "bank", bankId: bank.id, role: workspaceRole }}
                  scopeLabel={bank.name}
                  tagIds={importPromptTagIds}
                />
              </div>
            </section>
          ) : null}

          {mode === "ai" ? (
          <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="teacher-eyebrow">Teacher PDF import</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                Upload PDF to create Library Review Drafts
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                AI Parsing runs server-side and keeps generated questions as
                private drafts in this Library until review.
              </p>
            </div>
            {!parsingProfileState?.available ? (
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
              parsingProfile={parsingProfileState?.defaultProfile ?? "standard"}
              schemaAvailable={pdfBurstSchemaAvailable}
            />
            <div className="border-t border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Review is required before assignment. Uploading does not publish
              questions or expose the source Library to students.
            </div>
          </section>
          ) : null}
        </div>

        {mode === "ai" ? (
          <RecentBankImportsPanel
              bankName={bank.name}
              canQueueCoverageRecovery={canImport}
              coverageRecoveryAction={queueBankPdfCoverageRecovery}
              importBatches={importBatches}
          />
        ) : null}
      </section>
      </TeacherBankImportTransition>
    </BankWorkbenchPage>
  );
}
