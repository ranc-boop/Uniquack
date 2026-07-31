import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  BankBadge,
  BankRouteTabs,
  BankWorkbenchPage,
} from "../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="border-y border-rose-200 bg-white px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-950">
          Library unavailable
        </h1>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankDetailPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const supabase = await createClient();
  let detail;

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }
    throw error;
  }

  if (!detail) notFound();

  const { bank, currentUserRole } = detail;
  const canManageContent = canManageBankContent(currentUserRole);
  const nextAction = detail.reviewDraftCount
    ? {
        href: `/teacher/banks/${bank.id}/review`,
        label: "Review",
        title: `${detail.reviewDraftCount} Draft${detail.reviewDraftCount === 1 ? "" : "s"}`,
      }
    : detail.questionCount
      ? {
          href: `/teacher/publish?sourceBankId=${bank.id}`,
          label: "Create Assignment",
          title: `${detail.questionCount} Ready`,
        }
      : {
          href: `/teacher/banks/${bank.id}/imports`,
          label: "Import",
          title: "Add questions",
        };

  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            {bank.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <BankBadge tone="sky">
              {questionBankVisibilityLabel(bank.visibility)}
            </BankBadge>
            <BankBadge tone="blue">
              {bankMemberRoleLabel(currentUserRole ?? "viewer")}
            </BankBadge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/teacher/banks">Back</Link>
          </Button>
          {canManageContent ? (
            <Button asChild>
              <Link href={nextAction.href}>{nextAction.label}</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <BankRouteTabs bankId={bank.id} currentUserRole={currentUserRole} />

      <section className="border-y border-slate-200 bg-white">
        <div className="flex flex-col gap-6 px-5 py-7 md:px-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500">Next action</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              {nextAction.title}
            </h2>
          </div>
          {canManageContent ? (
            <Button asChild>
              <Link href={nextAction.href}>{nextAction.label}</Link>
            </Button>
          ) : null}
        </div>

        <nav
          aria-label="Library work"
          className="grid border-t border-slate-200 md:grid-cols-3 md:divide-x md:divide-slate-200"
        >
          {[
            {
              count: detail.reviewDraftCount,
              href: `/teacher/banks/${bank.id}/review`,
              label: "Draft",
            },
            {
              count: detail.questionCount,
              href: `/teacher/banks/${bank.id}/questions`,
              label: "Ready",
            },
            {
              count: detail.activeMemberCount,
              href: `/teacher/banks/${bank.id}/members`,
              label: "Members",
            },
          ].map((item) => (
            <Link
              className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 md:border-b-0"
              href={item.href}
              key={item.label}
            >
              <span>{item.label}</span>
              <span className="tabular-nums text-slate-500">{item.count}</span>
            </Link>
          ))}
        </nav>
      </section>
    </BankWorkbenchPage>
  );
}
