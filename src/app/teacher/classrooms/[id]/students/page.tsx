import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ClipboardCheck, UserMinus, Users } from "lucide-react";

import {
  removeClassroomStudent,
  restoreClassroomStudent,
} from "@/app/teacher/classrooms/actions";
import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherClassroomWorkspace,
  type TeacherClassroomRosterMember,
} from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomStudentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function formatStudentActivity(
  locale: Parameters<typeof formatLocaleDateTime>[0],
  value: string | null | undefined,
  fallback: string,
) {
  return value ? formatLocaleDateTime(locale, value, { dateStyle: "medium", timeStyle: "short" }) : fallback;
}

function StudentCard({
  classroomId,
  classroomStatus,
  locale,
  member,
}: {
  classroomId: string;
  classroomStatus: string;
  locale: Parameters<typeof formatLocaleDateTime>[0];
  member: TeacherClassroomRosterMember;
}) {
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const summary = member.assignmentSummary;
  const statusLabel =
    member.status === "active"
      ? t("classroomStudents.statusActive")
      : member.status === "removed"
        ? t("classroomStudents.statusRemoved")
        : member.status;
  const joinedAt = formatStudentActivity(
    locale,
    member.joined_at ?? member.created_at,
    t("classroomStudents.noActivityYet"),
  );
  const latestActivityAt = formatStudentActivity(
    locale,
    summary.latestActivityAt,
    t("classroomStudents.noActivityYet"),
  );

  return (
    <article className="p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-bold text-slate-950">
              {member.displayName}
            </h3>
            <ClassroomBadge tone={member.status === "active" ? "sky" : "amber"}>
              {statusLabel}
            </ClassroomBadge>
            {summary.needsAttention && member.status === "active" ? (
              <ClassroomBadge tone="amber">
                {t("classroomStudents.needsAttention")}
              </ClassroomBadge>
            ) : null}
          </div>
          <p className="break-words text-sm leading-6 text-slate-600">
            {member.email || member.profile?.username || member.user_id}
          </p>
          <p className="text-xs text-slate-500">
            {t("classroomStudents.joined", { date: joinedAt })}
          </p>
          <p className="text-sm leading-6 text-slate-600">
            {t("classroomStudents.latestAssignmentActivity", {
              date: latestActivityAt,
            })}
          </p>
        </div>

        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">
                {t("classroomStudents.assigned")}
              </dt>
              <dd className="text-base font-bold text-slate-950">
                {formatNumber(locale, summary.assignedCount)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">
                {t("classroomStudents.completed")}
              </dt>
              <dd className="text-base font-bold text-slate-950">
                {formatNumber(locale, summary.completedCount)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">
                {t("classroomStudents.practice")}
              </dt>
              <dd className="text-base font-bold text-slate-950">
                {formatNumber(locale, summary.linkedPracticeSessionCount)}
              </dd>
            </div>
          </dl>

          {member.status === "active" ? (
            <form action={removeClassroomStudent} className="space-y-2">
              <input name="classroomId" type="hidden" value={classroomId} />
              <input name="memberId" type="hidden" value={member.id} />
              <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">
                <input
                  className="mt-1"
                  name="confirmRemoval"
                  required
                  type="checkbox"
                  value="yes"
                />
                <span>{t("classroomStudents.removeConfirmation")}</span>
              </label>
              <FormSubmitButton
                className="w-full"
                pendingLabel={t("classroomStudents.removing")}
                variant="outline"
              >
                <UserMinus aria-hidden="true" className="mr-2 h-4 w-4" />
                {t("classroomStudents.removeFromActiveRoster")}
              </FormSubmitButton>
            </form>
          ) : classroomStatus === "active" ? (
            <form action={restoreClassroomStudent}>
              <input name="classroomId" type="hidden" value={classroomId} />
              <input name="memberId" type="hidden" value={member.id} />
              <FormSubmitButton
                className="w-full"
                pendingLabel={t("classroomStudents.restoring")}
              >
                {t("classroomStudents.restoreToActiveRoster")}
              </FormSubmitButton>
            </form>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              {t("classroomStudents.reopenBeforeRestore")}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function ClassroomStudentsPage({
  params,
  searchParams,
}: ClassroomStudentsPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { classroom, roster } = workspace;
  const students = roster.filter((member) => member.role === "student");
  const activeStudents = students.filter((member) => member.status === "active");
  const removedStudents = students.filter((member) => member.status === "removed");
  const needingAttention = activeStudents.filter(
    (student) => student.assignmentSummary.needsAttention,
  );

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("classroomStudents.title")}</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {t("classroomStudents.description")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classrooms/${classroom.id}`}>
              {t("classroomStudents.backToOverview")}
            </Link>
          </Button>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      {query.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {t("classroomStudents.actionSaved")}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {t("classroomStudents.actionFailed")}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description={t("classroomStudents.activeStudentsDescription")}
          icon={Users}
          label={t("classroomStudents.statusActive")}
          value={formatNumber(locale, activeStudents.length)}
        />
        <ClassroomMetricCard
          description={t("classroomStudents.needAttentionDescription")}
          icon={Activity}
          label={t("classroomStudents.needsAttention")}
          value={formatNumber(locale, needingAttention.length)}
        />
        <ClassroomMetricCard
          description={t("classroomStudents.removedDescription")}
          icon={UserMinus}
          label={t("classroomStudents.statusRemoved")}
          value={formatNumber(locale, removedStudents.length)}
        />
        <ClassroomMetricCard
          description={t("classroomStudents.assignedWorkDescription")}
          icon={ClipboardCheck}
          label={t("classroomStudents.assigned")}
          value={formatNumber(locale, classroom.activeAssignmentCount)}
        />
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">
            {t("classroomStudents.studentRoster")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {t("classroomStudents.rosterDescription")}
          </p>
        </div>
        {students.length ? (
          <div className="divide-y divide-slate-100">
            {students.map((member) => (
              <StudentCard
                classroomId={classroom.id}
                classroomStatus={classroom.status}
                key={member.id}
                locale={locale}
                member={member}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="teacher-eyebrow">{t("classroomStudents.noStudentsYet")}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              {t("classroomStudents.noStudentsTitle")}
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("classroomStudents.noStudentsDescription")}
            </p>
            <Button asChild className="mt-5" variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                {t("classroomStudents.manageJoinCode")}
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
