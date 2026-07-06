import Link from "next/link";
import { notFound } from "next/navigation";

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

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function SetupNeededState() {
  return (
    <main className="student-shell space-y-6">
      <section className="student-panel p-6">
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
    </main>
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

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="student-eyebrow">Bank Review Drafts</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {questionBankVisibilityLabel(bank.visibility)}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {bankMemberRoleLabel(currentUserRole ?? "viewer")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Review Drafts for {bank.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Approving here adds reviewed content to this bank only. It does
              not publish to the global Question Bank and does not create an
              assignment.
            </p>
          </div>
          <TeacherWorkspaceNav />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}/imports`}>Import material</Link>
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

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">
            Pending private drafts
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Source lineage and taxonomy suggestions remain attached for review.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {draftQuestions.length ? (
            draftQuestions.map((question) => (
              <article className="space-y-4 p-5" key={question.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Review required
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {question.question_type}
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        Difficulty {question.difficulty_rating}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-950">
                      {question.title}
                    </h3>
                    <p className="break-all text-xs text-slate-500">
                      {question.question_code} - {formatDate(question.created_at)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {question.tagIds.length ? (
                        question.tagIds.slice(0, 8).map((tagId) => (
                          <span
                            className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100"
                            key={tagId}
                          >
                            {tagId}
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
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                  Approval adds this question to {bank.name}. It stays
                  bank-scoped and is not globally published.
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
    </main>
  );
}
