import Link from "next/link";
import { notFound } from "next/navigation";

import { ClipboardCheck, FileText, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  listBankImportBatches,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import { importBankJsonDrafts } from "../../actions";
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

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

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
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  let importBatches = [];

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    importBatches = await listBankImportBatches({ bankId, supabase });
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
          description="The bank that receives Review Drafts from this import."
          icon={FileText}
          label="Target bank"
          value={bank.name}
        />
        <BankMetricCard
          description="Recent source batches already scoped to this bank."
          icon={Upload}
          label="Recent imports"
          value={importBatches.length}
        />
        <BankMetricCard
          description="Owners and editors can create new bank Review Drafts."
          icon={ClipboardCheck}
          label="Import access"
          value={canImport ? "Owner/editor" : "Viewer only"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
        <article className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
          <BankSectionHeader
            description="Use the AI Parsing workflow for teacher-owned source material. Every output lands in Review Drafts before it can enter this bank."
            title="Import source material"
          />
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-950">
                    AI Parsing-first workflow
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
                    Upload private materials, extract draft questions, then
                    approve only the items that belong in this bank.
                  </p>
                </div>
                <Button asChild>
                  <Link className="inline-flex items-center gap-2" href="/admin/imports/pdf">
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    Open AI Parsing
                  </Link>
                </Button>
              </div>
              <p className="mt-4 rounded-lg border border-white/80 bg-white/75 p-3 text-sm leading-6 text-slate-700">
                Target bank context: {bank.name}. Bank-scoped Review Drafts
                remain private and are never assigned or globally published from
                import.
              </p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Review gate: no imported draft is assignable or globally published
              from this page.
            </div>

            <details className="rounded-xl border border-slate-200 bg-slate-50">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-slate-900">
                Advanced / developer import fixture
                <span className="text-xs font-semibold text-slate-500">
                  JSON is not the primary teacher flow
                </span>
              </summary>
              <form action={importBankJsonDrafts} className="space-y-4 border-t border-slate-200 bg-white p-5">
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
                  <Button type="submit">Create bank Review Drafts</Button>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Viewers can inspect bank content later, but only owners and
                    editors can import new drafts.
                  </p>
                )}
              </form>
            </details>
          </div>
        </article>

        <aside className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
          <BankSectionHeader title="Recent imports" />
          <div className="space-y-3 p-5">
            {importBatches.length ? (
              importBatches.map((batch) => (
                <div
                  className="rounded-xl border border-slate-200 bg-white p-4"
                  key={batch.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {batch.source_type}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(batch.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {batch.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                No bank-scoped imports yet. Start with AI Parsing or the
                advanced fixture, then review drafts before adding anything to
                the bank.
              </p>
            )}
          </div>
        </aside>
      </section>
    </BankWorkbenchPage>
  );
}
