import Link from "next/link";
import { notFound } from "next/navigation";

import { Settings } from "lucide-react";

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
          Library settings are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0025 before using Library settings.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankSettingsPage({
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
            <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
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
        eyebrow="Library settings"
        title={`Settings for ${bank.name}`}
      >
        <p>
          Library metadata and visibility controls will live here once safe mutation
          flows are added. This PR keeps settings read-only.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      <section className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
        <BankSectionHeader
          description="No visibility or ownership mutation is added in this UI remodel."
          title="Read-only settings snapshot"
        />
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {[
            ["Visibility", questionBankVisibilityLabel(bank.visibility)],
            ["Status", questionBankStatusLabel(bank.status)],
            ["Role", bankMemberRoleLabel(currentUserRole ?? "viewer")],
          ].map(([label, value]) => (
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4" key={label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-lg font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 p-8 text-center">
          <Settings aria-hidden="true" className="mx-auto h-10 w-10 text-sky-600" />
          <h2 className="mt-4 text-2xl font-bold text-slate-950">
            Settings mutation is intentionally deferred.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Visibility changes, archive controls, and public movement need their
            own review and ownership gates.
          </p>
        </div>
      </section>
    </BankWorkbenchPage>
  );
}
