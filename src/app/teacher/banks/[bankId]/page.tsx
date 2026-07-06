import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
  questionBankStatusLabel,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function SetupNeededState() {
  return (
    <main className="student-shell space-y-6">
      <section className="student-panel p-6">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Question Bank tables are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0025, then return to this bank detail page.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </main>
  );
}

export default async function TeacherBankDetailPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  await requireTeacher();
  const { bankId } = await params;
  const supabase = await createClient();
  let detail;

  try {
    detail = await getTeacherQuestionBankDetail({ bankId, supabase });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const { bank, members, questionCount } = detail;

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="student-eyebrow">Question Bank / Library</span>
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                {questionBankVisibilityLabel(bank.visibility)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {questionBankStatusLabel(bank.status)}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {bank.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {bank.description ||
                "This bank is ready for reviewed content. Import, approval, and assignment handoffs are intentionally separate review-gated slices."}
            </p>
          </div>
          <TeacherWorkspaceNav />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Back to Banks</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/review">Review Drafts</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["Questions", questionCount],
          ["Members", detail.activeMemberCount],
          ["Created", formatDate(bank.created_at)],
          ["Updated", formatDate(bank.updated_at)],
        ].map(([label, value]) => (
          <div className="student-panel p-4" key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <article className="student-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Bank questions
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Approved questions will appear here before they are assigned to a
              class.
            </p>
          </div>
          <div className="p-6 text-center">
            {questionCount ? (
              <p className="text-sm text-slate-600">
                Question rows are connected to this bank. The full bank question
                organizer comes in the next slice.
              </p>
            ) : (
              <>
                <p className="student-eyebrow">Empty bank</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  No reviewed questions in this bank yet.
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Use Review Drafts after import, then add approved content to a
                  teacher-owned bank before classroom delivery.
                </p>
              </>
            )}
          </div>
        </article>

        <aside className="space-y-4">
          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Members</h2>
            <div className="mt-4 space-y-3">
              {members.map((member) => (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-3"
                  key={member.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {member.user_id}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {bankMemberRoleLabel(member.role)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Joined {formatDate(member.joined_at)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Future actions</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              These remain disabled until their review-gated slices land.
            </p>
            <div className="mt-4 grid gap-2">
              {[
                "Import material into this bank",
                "Add approved Review Drafts",
                "Pull from public library",
                "Create assignment from bank",
              ].map((label) => (
                <button
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-500"
                  disabled
                  key={label}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
