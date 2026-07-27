import Link from "next/link";
import { notFound } from "next/navigation";

import { BookOpen, ClipboardCheck, Upload, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberProfileLabel,
  bankMemberRoleLabel,
  canManageBankContent,
  getTeacherQuestionBankDetail,
  QuestionBankSchemaMissingError,
  questionBankStatusLabel,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  bankActionIcons,
  BankBadge,
  BankHeroPanel,
  BankMetricCard,
  BankQuickAction,
  BankRouteTabs,
  BankSafetyList,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../bank-ui";

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
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">Setup needed</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          Library tables are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0025, then return to this Library.
        </p>
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

  if (!detail) {
    notFound();
  }

  const { bank, currentUserRole, members } = detail;
  const canManageContent = canManageBankContent(currentUserRole);
  const activeMembers = members.filter((member) => member.status === "active");

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Back to Libraries</Link>
            </Button>
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/imports`}
              icon={Upload}
              variant={canManageContent ? "default" : "outline"}
            >
              Import Material
            </BankQuickAction>
            <BankQuickAction
              href={`/teacher/banks/${bank.id}/review`}
              icon={ClipboardCheck}
            >
              Review Drafts
            </BankQuickAction>
          </>
        }
        badges={
          <>
            <BankBadge tone="sky">
              {questionBankVisibilityLabel(bank.visibility)}
            </BankBadge>
            <BankBadge>{questionBankStatusLabel(bank.status)}</BankBadge>
            <BankBadge tone="blue">
              {bankMemberRoleLabel(currentUserRole ?? "viewer")}
            </BankBadge>
          </>
        }
        eyebrow="Library workspace"
        title={bank.name}
      >
        <p>
          {bank.description ||
            "This Library is ready for reviewed content. Import, approval, and assignment handoffs remain review-gated."}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          {activeMembers.length} active member
          {activeMembers.length === 1 ? "" : "s"} can access this repository.
          Classrooms deliver selected approved items; they do not expose the full
          Library.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />
      <BankSafetyList />

      <section className="grid gap-3 md:grid-cols-4">
        {[
          {
            description: "Approved Library items.",
            icon: BookOpen,
            label: "Questions",
            value: detail.questionCount,
          },
          {
            description: "Private drafts waiting for this Library.",
            icon: ClipboardCheck,
            label: "Review Drafts",
            value: detail.reviewDraftCount,
          },
          {
            description: "Source batches targeting this repository.",
            icon: Upload,
            label: "Imports",
            value: detail.importBatchCount,
          },
          {
            description: "Explicit Library collaborators.",
            icon: Users,
            label: "Members",
            value: detail.activeMemberCount,
          },
        ].map((metric) => (
          <BankMetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.8fr]">
        <article className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
          <BankSectionHeader
            description="Reviewed questions stay private to this Library. Assignments expose selected approved items, not the full Library."
            title="Library questions"
          />
          <div className="p-6 text-center">
            {detail.questionCount ? (
              <div className="mx-auto max-w-xl space-y-4">
                <p className="text-sm leading-6 text-slate-600">
                  This Library has approved content ready for classroom delivery.
                  Choose specific questions, then save a teacher draft or assign
                  them to a class. Create an Assignment from this Library.
                </p>
                <Button asChild>
                  <Link href={`/teacher/publish?sourceBankId=${bank.id}`}>
                    Create Assignment
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/teacher/banks/${bank.id}/questions`}>
                    Open question database
                  </Link>
                </Button>
              </div>
              ) : (
              <>
                <p className="teacher-eyebrow">Empty Library</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  No reviewed questions in this Library yet.
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Use Review Drafts after import, then add approved content to a
                  teacher-owned Library before classroom delivery.
                </p>
              </>
            )}
          </div>
        </article>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">
              Repository workflow
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Import private material, review drafts, then add approved content
              to this Library.
            </p>
            <div className="mt-4 grid gap-2">
              <BankQuickAction
                href={`/teacher/banks/${bank.id}/imports`}
                icon={bankActionIcons.import}
                variant={canManageContent ? "default" : "outline"}
              >
                Import Material
              </BankQuickAction>
              <BankQuickAction
                href={`/teacher/banks/${bank.id}/review`}
                icon={bankActionIcons.review}
              >
                Review Drafts
              </BankQuickAction>
              <BankQuickAction
                href={`/teacher/banks/${bank.id}/questions`}
                icon={bankActionIcons.questions}
              >
                Open questions
              </BankQuickAction>
              <BankQuickAction
                href={`/teacher/publish?sourceBankId=${bank.id}`}
                icon={bankActionIcons.assignment}
                variant={detail.questionCount ? "default" : "outline"}
              >
                Create assignment
              </BankQuickAction>
            </div>
            {!canManageContent ? (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                Viewers can use shared Library content for assignments they manage,
                but owners and editors handle import and approval.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">Members</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Explicit Library membership controls access. Classroom membership
              does not grant access to this Library.
            </p>
            <div className="mt-4 space-y-3">
              {activeMembers.map((member) => (
                <div
                  className="rounded-lg border border-slate-200 bg-white p-3"
                  key={member.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {bankMemberProfileLabel(member)}
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
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href={`/teacher/banks/${bank.id}/members`}>
                Manage members and share codes
              </Link>
            </Button>
          </section>

          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">
              Boundary notes
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Public pull and student visibility remain separate. Classroom
              assignments expose selected approved items only.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Created {formatDate(bank.created_at)} Â· Updated{" "}
              {formatDate(bank.updated_at)}
            </p>
          </section>
        </aside>
      </section>
    </BankWorkbenchPage>
  );
}
