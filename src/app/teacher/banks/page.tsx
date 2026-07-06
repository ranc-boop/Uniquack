import Link from "next/link";

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

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function SetupNeededState() {
  return (
    <section className="teacher-panel p-6">
      <p className="teacher-eyebrow">Setup needed</p>
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

export default async function TeacherBanksPage() {
  const profile = await requireTeacher();
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

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Banks / Library</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Your teacher-owned Question Banks.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Build private or shared libraries first, then deliver reviewed
              bank content through classrooms and assignments.
            </p>
          </div>
          <TeacherWorkspaceNav />
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/teacher/banks/new">Create Question Bank</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/review">Review Drafts</Link>
            </Button>
          </div>
        </div>
      </section>

      {setupNeeded ? (
        <SetupNeededState />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              ["Total banks", banks.length],
              [
                "Questions",
                banks.reduce((sum, bank) => sum + bank.questionCount, 0),
              ],
              [
                "Shared access",
                banks.filter((bank) => bank.visibility !== "private").length,
              ],
              [
                "Active banks",
                banks.filter((bank) => bank.status === "active").length,
              ],
            ].map(([label, value]) => (
              <div className="teacher-panel p-4" key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {value}
                </p>
              </div>
            ))}
          </section>

          {banks.length ? (
            <section className="space-y-3">
              {banks.map((bank) => (
                <article className="teacher-panel p-5" key={bank.id}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                          {questionBankVisibilityLabel(bank.visibility)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {questionBankStatusLabel(bank.status)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {bankMemberRoleLabel(bank.membershipRole)}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-950">
                          {bank.name}
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                          {bank.description ||
                            "No description yet. Add reviewed questions here before classroom delivery."}
                        </p>
                      </div>
                      <dl className="flex flex-wrap gap-4 text-sm text-slate-600">
                        <div>
                          <dt className="font-semibold text-slate-900">
                            Questions
                          </dt>
                          <dd>{bank.questionCount}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900">
                            Members
                          </dt>
                          <dd>{bank.activeMemberCount}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-900">
                            Updated
                          </dt>
                          <dd>{formatDate(bank.updated_at)}</dd>
                        </div>
                      </dl>
                    </div>
                    <Button asChild variant="outline">
                      <Link href={`/teacher/banks/${bank.id}`}>Open bank</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section className="teacher-panel p-8 text-center">
              <p className="teacher-eyebrow">Empty library</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                Create your first Question Bank.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Banks hold reviewed teacher content. Import, Review Drafts, and
                assignment flows will connect to this library in later slices.
              </p>
              <Button asChild className="mt-5">
                <Link href="/teacher/banks/new">Create Question Bank</Link>
              </Button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
