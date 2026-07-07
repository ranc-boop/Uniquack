import Link from "next/link";
import { notFound } from "next/navigation";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberRoleLabel,
  getTeacherQuestionBankDetail,
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

function SetupNeededState() {
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Question Bank tables are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0025 before using bank blueprint links.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankBlueprintsPage({
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
        eyebrow="Bank blueprints"
        title={`Blueprint links for ${bank.name}`}
      >
        <p>
          Blueprints generated from or linked to this bank will appear here.
          Blueprint output still flows through Review Drafts.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="This placeholder keeps the repository IA visible without adding Blueprint generation in this PR."
          title="Blueprints linked to this bank"
        />
        <div className="p-8 text-center">
          <Sparkles aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
          <h2 className="mt-4 text-2xl font-bold text-slate-950">
            No bank-linked blueprints yet.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Future blueprint extraction can reference this bank, but original
            question generation and approval remain separate review-gated flows.
          </p>
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
