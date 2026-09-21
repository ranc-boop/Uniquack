import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import {
  BankBadge,
  BankRouteTabs,
  BankWorkbenchPage,
} from "../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState({ locale }: { locale: Parameters<typeof translate>[0] }) {
  return (
    <BankWorkbenchPage>
      <section className="border-y border-rose-200 bg-white px-6 py-10">
        <h1 className="text-2xl font-bold text-slate-950">
          {translate(locale, "teacherLibrary.libraryUnavailable")}
        </h1>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">{translate(locale, "teacherLibrary.backToLibraries")}</Link>
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
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
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
      return <SetupNeededState locale={locale} />;
    }
    throw error;
  }

  if (!detail) notFound();

  const { bank, currentUserRole } = detail;
  const canManageContent = canManageBankContent(currentUserRole);
  const visibilityLabel =
    bank.visibility === "organization"
      ? t("teacherLibrary.visibilityOrganization")
      : bank.visibility === "private"
        ? t("teacherLibrary.visibilityPrivate")
        : bank.visibility === "public"
          ? t("teacherLibrary.visibilityLegacyPublic")
          : t("teacherLibrary.visibilityShared");
  const memberRoleLabel =
    currentUserRole === "owner"
      ? t("teacherLibrary.owner")
      : currentUserRole === "editor"
        ? t("teacherLibrary.editor")
        : t("teacherLibrary.viewer");
  const nextAction = detail.reviewDraftCount
    ? {
        href: `/teacher/banks/${bank.id}/review`,
        label: t("teacherLibrary.review"),
        title: t("teacherLibrary.draftCount", { count: formatNumber(locale, detail.reviewDraftCount) }),
      }
    : detail.questionCount
      ? {
          href: `/teacher/publish?sourceBankId=${bank.id}`,
          label: t("teacherLibrary.createAssignment"),
          title: t("teacherLibrary.readyCount", { count: formatNumber(locale, detail.questionCount) }),
        }
      : {
          href: `/teacher/banks/${bank.id}/imports`,
          label: t("teacherLibrary.import"),
          title: t("teacherLibrary.addQuestions"),
        };

  return (
    <BankWorkbenchPage>
      <header className="teacher-page-header">
        <div className="min-w-0">
          <h1 className="break-words text-3xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">
            {bank.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <BankBadge tone="sky">
              {visibilityLabel}
            </BankBadge>
            <BankBadge tone="blue">
              {memberRoleLabel}
            </BankBadge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/teacher/banks">{t("teacherLibrary.back")}</Link>
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
            <p className="text-sm font-semibold text-slate-500">{t("teacherLibrary.nextAction")}</p>
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
          aria-label={t("teacherLibrary.libraryWork")}
          className="grid border-t border-slate-200 md:grid-cols-3 md:divide-x md:divide-slate-200"
        >
          {[
            {
              count: detail.reviewDraftCount,
              href: `/teacher/banks/${bank.id}/review`,
              label: t("teacherLibrary.draft"),
            },
            {
              count: detail.questionCount,
              href: `/teacher/banks/${bank.id}/questions`,
              label: t("teacherLibrary.ready"),
            },
            {
              count: detail.activeMemberCount,
              href: `/teacher/banks/${bank.id}/members`,
              label: t("teacherLibrary.members"),
            },
          ].map((item) => (
            <Link
              className="flex min-h-20 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 md:border-b-0"
              href={item.href}
              key={item.label}
            >
              <span>{item.label}</span>
              <span className="tabular-nums text-slate-500">{formatNumber(locale, item.count)}</span>
            </Link>
          ))}
        </nav>
      </section>
    </BankWorkbenchPage>
  );
}
