import Link from "next/link";
import { notFound } from "next/navigation";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  getTeacherQuestionBankDetail,
  listBankImportBatches,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  BankBadge,
  BankHeroPanel,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Bank source lineage is not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migrations 0025 and 0027 before using bank source history.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
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
      return <SetupNeededState />;
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
        actions={
          <Button asChild variant="outline">
            <Link href={`/teacher/banks/${bank.id}`}>Back to bank</Link>
          </Button>
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
        eyebrow="Source lineage"
        title={`Sources for ${bank.name}`}
      >
        <p>
          Source material and import lineage for this bank stay visible here so
          teachers can trace reviewed questions back to their owned material.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="This list uses existing bank-scoped import batches only. It does not expose private files to students."
          title="Recent source activity"
        />
        <div className="divide-y divide-slate-100">
          {importBatches.length ? (
            importBatches.map((batch) => (
              <article className="flex flex-col gap-3 p-5 md:flex-row md:items-start md:justify-between" key={batch.id}>
                <div>
                  <p className="font-bold text-slate-950">{batch.source_type}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatDate(batch.created_at)}
                  </p>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    Source batch reference {batch.id}
                  </p>
                </div>
                <BankBadge>{batch.status}</BankBadge>
              </article>
            ))
          ) : (
            <div className="p-8 text-center">
              <FileText aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
              <h2 className="mt-4 text-2xl font-bold text-slate-950">
                No source activity yet.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Import private material into this bank to begin building source
                lineage.
              </p>
            </div>
          )}
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
