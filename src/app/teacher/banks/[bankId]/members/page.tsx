import Link from "next/link";
import { notFound } from "next/navigation";

import { KeyRound, Share2, Users } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDate as formatLocaleDate } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import {
  bankMemberProfileLabel,
  bankMemberRoleLabel,
  canManageBankMembers,
  getTeacherQuestionBankDetail,
  listBankShareCodes,
  QuestionBankSchemaMissingError,
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

function formatDate(locale: Parameters<typeof translate>[0], value: string | null) {
  return value ? formatLocaleDate(locale, value, { day: "numeric", month: "short", year: "numeric" }) : translate(locale, "teacherLibrary.notSet");
}

function SetupNeededState({ locale }: { locale: Parameters<typeof translate>[0] }) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  return (
    <BankWorkbenchPage>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <p className="student-eyebrow">{t("teacherLibrary.setupNeeded")}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">
          {t("teacherLibrary.sharingTablesUnavailable")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          {t("teacherLibrary.applyMemberMigration")}
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">{t("teacherLibrary.backToLibraries")}</Link>
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
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const roleLabel = (role: string) => role === "owner" ? t("teacherLibrary.owner") : role === "editor" ? t("teacherLibrary.editor") : t("teacherLibrary.viewer");
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
      return <SetupNeededState locale={locale} />;
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
          <BankQuickAction href="/teacher/banks/join" icon={Share2}>
            {t("teacherLibrary.joinLibrary")}
          </BankQuickAction>
        }
        subtitle={bank.name}
        title={t("teacherLibrary.members")}
      />

      <BankRouteTabs bankId={bank.id} currentUserRole={currentUserRole} />

      {query.saved ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {t("teacherLibrary.saved")}
        </section>
      ) : null}
      {query.error ? (
        <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {t("common.requestFailed")}
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <BankMetricCard
          description={t("teacherLibrary.activeCollaborators")}
          icon={Users}
          label={t("teacherLibrary.activeMembers")}
          value={activeMembers.length}
        />
        <BankMetricCard
          description={t("teacherLibrary.currentJoinCodes")}
          icon={KeyRound}
          label={t("teacherLibrary.activeCodes")}
          value={activeShareCodes.length}
        />
        <BankMetricCard
          description={t("teacherLibrary.onlyOwnersManage")}
          icon={Share2}
          label={t("teacherLibrary.yourAccess")}
          value={canManage ? t("teacherLibrary.ownerControls") : t("teacherLibrary.readOnlyControls")}
        />
      </section>

      {query.newCode ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-5 shadow-sm">
          <p className="student-eyebrow">{t("teacherLibrary.copyNow")}</p>
          <h2 className="mt-2 text-xl font-bold text-slate-950">
            {t("teacherLibrary.newShareCodeCreated")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("teacherLibrary.copyCodeWarning")}
            {t("teacherLibrary.codeGrantsAccess", { role: roleLabel(query.role === "editor" ? "editor" : "viewer") })}
          </p>
          <code className="mt-4 block rounded-lg border border-sky-200 bg-white px-4 py-3 text-lg font-bold tracking-wide text-slate-950">
            {query.newCode}
          </code>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <article className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
          <BankSectionHeader
            description={t("teacherLibrary.membersDescription")}
            title={t("teacherLibrary.members")}
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
                          {roleLabel(member.role)}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                          {member.status}
                        </span>
                      </div>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {member.profile?.email || member.user_id}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t("teacherLibrary.joined")} {formatDate(locale, member.joined_at)}
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
                          <FormSubmitButton
                            pendingLabel={t("teacherLibrary.updatingRole")}
                            variant="outline"
                          >
                            {t("teacherLibrary.makeRole", { role: roleLabel(member.role === "viewer" ? "editor" : "viewer") })}
                          </FormSubmitButton>
                        </form>
                        <form action={removeBankMember}>
                          <input name="bankId" type="hidden" value={bank.id} />
                          <input name="userId" type="hidden" value={member.user_id} />
                          <FormSubmitButton
                            pendingLabel={t("teacherLibrary.removingMember")}
                            variant="outline"
                          >
                            {t("teacherLibrary.remove")}
                          </FormSubmitButton>
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
              {t("teacherLibrary.ownerControlledSharing")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("teacherLibrary.sharingDescription")}
            </p>
            {canManage ? (
              <form action={createBankShareCode} className="mt-4 space-y-4">
                <input name="bankId" type="hidden" value={bank.id} />
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">
                    {t("teacherLibrary.grantedRole")}
                  </span>
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                    defaultValue="viewer"
                    name="grantedRole"
                  >
                    <option value="viewer">{t("teacherLibrary.viewer")}</option>
                    <option value="editor">{t("teacherLibrary.editor")}</option>
                  </select>
                </label>
                <FormSubmitButton pendingLabel={t("teacherLibrary.creatingShareCode")}>
                  {t("teacherLibrary.createShareCode")}
                </FormSubmitButton>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {t("teacherLibrary.onlyOwnersShareCodes")}
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
            <h2 className="text-lg font-bold text-slate-950">
              {t("teacherLibrary.activeShareCodes")}
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
                          {code.code_hint || t("teacherLibrary.hashedCode")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {t("teacherLibrary.grantsAccess", { role: roleLabel(code.role_granted) })}
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
                          <FormSubmitButton
                            pendingLabel={t("teacherLibrary.revokingCode")}
                            variant="outline"
                          >
                            {t("teacherLibrary.revoke")}
                          </FormSubmitButton>
                        </form>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {t("teacherLibrary.created")} {formatDate(locale, code.created_at)}
                      {code.last_used_at
                        ? ` - ${t("teacherLibrary.lastUsed")} ${formatDate(locale, code.last_used_at)}`
                        : ""}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {t("teacherLibrary.noActiveShareCodes")}
                </p>
              )}
            </div>
          </section>
        </aside>
      </section>
    </BankWorkbenchPage>
  );
}
