import Link from "next/link";
import { notFound } from "next/navigation";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  getTeacherQuestionBankDetail,
  listBankImportBatches,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import {
  BankBadge,
  BankHeroPanel,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState({ locale }: { locale: Parameters<typeof translate>[0] }) {
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">{t("teacherLibrary.setupNeeded")}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          {t("teacherLibrary.sourceLineageUnavailable")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {t("teacherLibrary.sourceLineageMigrationNotice")}
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">{t("teacherLibrary.backToLibraries")}</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankSourcesPage({
  params,
}: {
  params: Promise<{ bankId: string }>;
}) {
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const profile = await requireTeacher();
  const { bankId } = await params;
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
      return <SetupNeededState locale={locale} />;
    }

    throw error;
  }

  if (!detail) {
    notFound();
  }

  const { bank, currentUserRole } = detail;

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        subtitle={bank.name}
        title={t("teacherLibrary.sources")}
      />

      <BankRouteTabs bankId={bank.id} currentUserRole={currentUserRole} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description={t("teacherLibrary.sourceActivityDescription")}
          title={t("teacherLibrary.recentSourceActivity")}
        />
        <div className="divide-y divide-slate-100">
          {importBatches.length ? (
            importBatches.map((batch) => (
              <article className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between" key={batch.id}>
                <div>
                  <p className="font-bold text-slate-950">{batch.source_type}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {batch.created_at ? formatDate(locale, batch.created_at) : t("teacherLibrary.unknown")}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    {t("teacherLibrary.sourceBatchReference", { id: batch.id })}
                  </p>
                </div>
                <BankBadge>{batch.status}</BankBadge>
              </article>
            ))
          ) : (
            <div className="p-8 text-center">
              <FileText aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
              <h2 className="mt-4 text-2xl font-bold text-slate-950">
                {t("teacherLibrary.noSourceActivity")}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("teacherLibrary.noSourceActivityDescription")}
              </p>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
