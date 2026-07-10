import Link from "next/link";

import { ClipboardCheck, Upload } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  listBankImportBatches,
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  BankImportEntryPanel,
  BankTargetSelector,
  TeacherImportSafetyCallout,
  RecentBankImportsPanel,
} from "../banks/bank-import-ui";
import { BankWorkbenchPage } from "../banks/bank-ui";

export const dynamic = "force-dynamic";

function SetupNeededState() {
  return (
    <TeacherWorkspaceShell
      title="AI Parsing"
      description="Choose a Question Bank before importing. AI drafts stay private until reviewed."
    >
      <TeacherWorkspaceNav />
      <section className="teacher-panel p-6">
        <p className="teacher-eyebrow">Setup needed</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          Question Bank tables are not available yet.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply the clean Question Bank migrations before using teacher AI
          Parsing.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </TeacherWorkspaceShell>
  );
}

export default async function TeacherAiParsingPage({
  searchParams,
}: {
  searchParams: Promise<{ bankId?: string }>;
}) {
  const profile = await requireTeacher();
  const query = await searchParams;
  const supabase = await createClient();
  let banks: Awaited<ReturnType<typeof listTeacherQuestionBanks>> = [];

  try {
    banks = await listTeacherQuestionBanks({
      profileId: profile.id,
      supabase,
    });
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      return <SetupNeededState />;
    }

    throw error;
  }

  const importableBanks = banks.filter(
    (bank) => bank.status === "active" && canManageBankContent(bank.membershipRole),
  );
  const selectedBank =
    banks.find((bank) => bank.id === query.bankId) ??
    importableBanks[0] ??
    banks[0] ??
    null;
  const selectedCanImport = selectedBank
    ? selectedBank.status === "active" &&
      canManageBankContent(selectedBank.membershipRole)
    : false;
  const recentImports =
    selectedBank && selectedCanImport
      ? await listBankImportBatches({ bankId: selectedBank.id, supabase })
      : [];

  return (
    <BankWorkbenchPage>
      <TeacherWorkspaceShell
        actions={
          selectedBank ? (
            <>
              <Button asChild variant="outline">
                <Link href={`/teacher/banks/${selectedBank.id}/review`}>
                  <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
                  Review Drafts
                </Link>
              </Button>
              {selectedCanImport ? (
                <Button asChild>
                  <Link href={`/teacher/banks/${selectedBank.id}/imports`}>
                    <Upload aria-hidden="true" className="h-4 w-4" />
                    Import into selected bank
                  </Link>
                </Button>
              ) : (
                <Button disabled type="button">
                  Import requires owner/editor
                </Button>
              )}
            </>
          ) : (
            <Button asChild>
              <Link href="/teacher/banks/new">Create Question Bank</Link>
            </Button>
          )
        }
        description="Choose a Question Bank before importing. AI drafts stay private until reviewed."
        eyebrow="Teacher import workspace"
        title="AI Parsing"
      >
        <TeacherWorkspaceNav />
        <TeacherImportSafetyCallout />

        <section className="teacher-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">
            Bank-targeted import flow
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
            Teacher-owned material enters a selected Question Bank as private
            Review Drafts. Approved drafts enter that bank only; assignment and
            public publishing stay separate.
          </p>
        </section>

        <BankTargetSelector
          banks={banks}
          selectedBankId={selectedBank?.id}
        />

        {selectedBank ? (
          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
            <BankImportEntryPanel
              bank={selectedBank}
              canImport={selectedCanImport}
            />
            <RecentBankImportsPanel
              bankName={selectedBank.name}
              importBatches={recentImports}
            />
          </section>
        ) : null}
      </TeacherWorkspaceShell>
    </BankWorkbenchPage>
  );
}
