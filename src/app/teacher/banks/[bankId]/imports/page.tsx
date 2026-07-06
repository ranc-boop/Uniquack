import Link from "next/link";
import { notFound } from "next/navigation";

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
    <main className="student-shell space-y-6">
      <section className="student-panel p-6">
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
    </main>
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
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="student-eyebrow">Bank Import</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {questionBankVisibilityLabel(bank.visibility)}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {bankMemberRoleLabel(currentUserRole ?? "viewer")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Import material into {bank.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Imported material creates Review Drafts for this bank. Drafts
              stay private until an owner or editor reviews them.
            </p>
          </div>
          <TeacherWorkspaceNav />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}/review`}>Review Drafts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}/questions`}>
                Bank questions
              </Link>
            </Button>
          </div>
        </div>
      </section>

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

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
        <article className="student-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Start bank-scoped draft import
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use normalized question JSON for this first private-bank import
              slice. AI PDF imports can target the same bank scope once wired.
            </p>
          </div>
          <form action={importBankJsonDrafts} className="space-y-4 p-5">
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              Review gate: no imported draft is assignable or globally
              published from this page.
            </div>
            {canImport ? (
              <Button type="submit">Create bank Review Drafts</Button>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Viewers can inspect bank content later, but only owners and
                editors can import new drafts.
              </p>
            )}
          </form>
        </article>

        <aside className="student-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-lg font-bold text-slate-950">Recent imports</h2>
          </div>
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
                No bank-scoped imports yet.
              </p>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
