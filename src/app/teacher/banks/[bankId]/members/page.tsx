import Link from "next/link";
import { notFound } from "next/navigation";

import { KeyRound, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  bankMemberProfileLabel,
  bankMemberRoleLabel,
  canManageBankMembers,
  getTeacherQuestionBankDetail,
  listBankShareCodes,
  QuestionBankSchemaMissingError,
  questionBankVisibilityLabel,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

import {
  createBankShareCode,
  removeBankMember,
  revokeBankShareCode,
  updateBankMemberRole,
} from "../../actions";
import {
  BankBadge,
  BankHeroPanel,
  BankMetricCard,
  BankQuickAction,
  BankRouteTabs,
  BankSectionHeader,
  BankWorkbenchPage,
} from "../../bank-ui";

export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "Not set";

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
          Library sharing tables are not available yet.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Apply clean migration 0026, then return to this member workbench.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Libraries</Link>
        </Button>
      </section>
    </BankWorkbenchPage>
  );
}

export default async function TeacherBankMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ bankId: string }>;
  searchParams: Promise<{
    error?: string;
    newCode?: string;
    role?: string;
    saved?: string;
  }>;
}) {
  const profile = await requireTeacher();
  const { bankId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  let detail;
  let shareCodes = [];

  try {
    detail = await getTeacherQuestionBankDetail({
      bankId,
      profileId: profile.id,
      supabase,
    });
    shareCodes = await listBankShareCodes({ bankId, supabase });
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
  const canManage = canManageBankMembers(currentUserRole);
  const activeShareCodes = shareCodes.filter((code) => code.status === "active");
  const activeMembers = members.filter((member) => member.status === "active");

  return (
    <BankWorkbenchPage>
      <BankHeroPanel
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`/teacher/banks/${bank.id}`}>Back to Library</Link>
            </Button>
            <BankQuickAction href="/teacher/banks/join" icon={Share2}>
              Join another Library
            </BankQuickAction>
          </>
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
        eyebrow="Members and share codes"
        title={bank.name}
      >
        <p>
          Manage explicit Library membership. Classroom membership does not grant
          access to this Library.
        </p>
      </BankHeroPanel>

      <TeacherWorkspaceNav />
      <BankRouteTabs bankId={bank.id} />

      {query.saved ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {query.saved}
        </section>
      ) : null}
      {query.error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {query.error}
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <BankMetricCard
          description="Active teacher collaborators on this Library."
          icon={Users}
          label="Active members"
          value={activeMembers.length}
        />
        <BankMetricCard
          description="Current join codes that can add teachers."
          icon={KeyRound}
          label="Active codes"
          value={activeShareCodes.length}
        />
        <BankMetricCard
          description="Only owners can create codes or manage roles."
          icon={Share2}
          label="Your access"
          value={canManage ? "Owner controls" : "Read-only controls"}
        />
      </section>

      {query.newCode ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
          <p className="student-eyebrow">Copy now</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            New share code created
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Copy this code now. It is stored hashed and cannot be shown again.
            This code grants {query.role === "editor" ? "editor" : "viewer"} access.
          </p>
          <code className="mt-4 block rounded-lg border border-sky-200 bg-white px-4 py-3 text-lg font-bold tracking-wide text-slate-950">
            {query.newCode}
          </code>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <article className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
          <BankSectionHeader
            description="Owners can update collaborators between viewer and editor, or remove access. At least one owner must remain active."
            title="Members"
          />
          <div className="divide-y divide-slate-100">
            {members.map((member) => {
              const isOwner = member.role === "owner";
              const isCurrentUser = member.user_id === profile.id;

              return (
                <div className="space-y-3 p-5" key={member.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">
                          {bankMemberProfileLabel(member)}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {bankMemberRoleLabel(member.role)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {member.status}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {member.profile?.email || member.user_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Joined {formatDate(member.joined_at)}
                      </p>
                    </div>

                    {canManage && !isCurrentUser && !isOwner ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={updateBankMemberRole}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input name="userId" type="hidden" value={member.user_id} />
                          <input
                            name="role"
                            type="hidden"
                            value={member.role === "viewer" ? "editor" : "viewer"}
                          />
                          <Button type="submit" variant="outline">
                            Make {member.role === "viewer" ? "editor" : "viewer"}
                          </Button>
                        </form>
                        <form action={removeBankMember}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input name="userId" type="hidden" value={member.user_id} />
                          <Button type="submit" variant="outline">
                            Remove
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">
              Owner-controlled sharing
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Share codes are for teacher collaboration. Share codes are shown
              only once and stored only as hashes.
            </p>
            {canManage ? (
              <form action={createBankShareCode} className="mt-4 space-y-4">
                <input name="bankId" type="hidden" value={bank.id} />
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">
                    Granted role
                  </span>
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    defaultValue="viewer"
                    name="grantedRole"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </label>
                <Button type="submit">Create share code</Button>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Only Library owners can create or revoke share codes.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">
              Active share codes
            </h2>
            <div className="mt-4 space-y-3">
              {activeShareCodes.length ? (
                activeShareCodes.map((code) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-white p-3"
                    key={code.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {code.code_hint || "Hashed code"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Grants {bankMemberRoleLabel(code.role_granted)} access
                        </p>
                      </div>
                      {canManage ? (
                        <form action={revokeBankShareCode}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input
                            name="shareCodeId"
                            type="hidden"
                            value={code.id}
                          />
                          <Button type="submit" variant="outline">
                            Revoke
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Created {formatDate(code.created_at)}
                      {code.last_used_at
                        ? ` - Last used ${formatDate(code.last_used_at)}`
                        : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  No active share codes.
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>
    </BankWorkbenchPage>
  );
}
