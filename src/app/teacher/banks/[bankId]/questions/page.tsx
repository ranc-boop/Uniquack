import Link from "next/link";
import { notFound } from "next/navigation";

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
          Bank questions are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migrations 0025 and 0027 before using bank questions.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </main>
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

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="student-eyebrow">Bank Questions</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {questionBankVisibilityLabel(bank.visibility)}
              </span>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                {bankMemberRoleLabel(currentUserRole ?? "viewer")}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Reviewed content in {bank.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              These questions are bank-scoped. Assignments expose selected
              items only.
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
              <Link href={`/teacher/banks/${bank.id}/review`}>Review Drafts</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">
            Active bank questions
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Students see assigned items only. Bank membership remains separate
            from assignment delivery.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {questions.length ? (
            questions.map((row) => {
              const question = row.question;

              return (
                <article className="space-y-3 p-5" key={row.bank_question_id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                          Bank-scoped
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {row.source_kind}
                        </span>
                        {question ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            {question.status}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-slate-950">
                        {question?.title ?? "Question unavailable"}
                      </h3>
                      {question ? (
                        <p className="mt-1 break-all text-xs text-slate-500">
                          {question.question_code} - {question.question_type} -
                          difficulty {question.difficulty_rating}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-slate-500">
                        Added {formatDate(row.added_at)}
                      </p>
                    </div>
                  </div>
                  {question?.source_review_item_id ? (
                    <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      Source Review Draft: {question.source_review_item_id}
                    </p>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="p-8 text-center">
              <p className="student-eyebrow">Empty bank</p>
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
    </main>
  );
}
