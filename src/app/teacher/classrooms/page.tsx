import { randomUUID } from "node:crypto";

import Link from "next/link";
import {
  Activity,
  BookOpenCheck,
  ClipboardCheck,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";

import { createClassroom } from "@/app/teacher/classrooms/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomPublishCta,
  ClassroomQuickAction,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";
import { listTeacherClassroomSummaries } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherClassroomsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function classroomStatusLabel(locale: Parameters<typeof translate>[0], status: string) {
  if (status === "active") return translate(locale, "classroom.statusActive");
  if (status === "archived") return translate(locale, "classroom.statusArchived");
  return translate(locale, "classroom.statusUnknown");
}

function assignmentStatusLabel(locale: Parameters<typeof translate>[0], status: string) {
  if (status === "assigned") return translate(locale, "classroom.assignmentStatusAssigned");
  if (status === "draft") return translate(locale, "classroom.assignmentStatusDraft");
  if (status === "archived") return translate(locale, "classroom.assignmentStatusArchived");
  return translate(locale, "classroom.assignmentStatusUnknown");
}

function formatDateForLocale(
  locale: Parameters<typeof translate>[0],
  value: string | null | undefined,
  fallback: string,
) {
  return value
    ? formatLocaleDate(locale, value, { dateStyle: "medium" })
    : fallback;
}

function formatDateTimeForLocale(
  locale: Parameters<typeof translate>[0],
  value: string | null | undefined,
  fallback: string,
) {
  return value
    ? formatLocaleDateTime(locale, value, { dateStyle: "medium", timeStyle: "short" })
    : fallback;
}

export default async function TeacherClassroomsPage({
  searchParams,
}: TeacherClassroomsPageProps) {
  const profile = await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const params = await searchParams;
  const supabase = await createClient();
  const classroomCreationRequestId = randomUUID();
  const classrooms = await listTeacherClassroomSummaries({ supabase });
  const totals = {
    activeAssignments: classrooms.reduce(
      (sum, classroom) => sum + classroom.activeAssignmentCount,
      0,
    ),
    assignments: classrooms.reduce(
      (sum, classroom) => sum + classroom.assignmentCount,
      0,
    ),
    students: classrooms.reduce((sum, classroom) => sum + classroom.studentCount, 0),
  };

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="teacher-eyebrow">{t("classroom.deliveryLayer")}</p>
              <ClassroomBadge tone="sky">{t("classroom.libraryFirstWorkflow")}</ClassroomBadge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-[#1D1D1F]">
                {t("classroom.title")}
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-600">
                {t("classroom.openContext")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a className="inline-flex items-center gap-2" href="#create-class">
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t("classroom.create")}
              </a>
            </Button>
            <ClassroomPublishCta />
          </div>
        </div>
      </section>

      {params.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {t("classroom.actionSaved")}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {t("classroom.actionFailed")}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description={t("classroom.rosterSpaces")}
          icon={Users}
          label={t("classroom.classes")}
          value={formatNumber(locale, classrooms.length)}
        />
        <ClassroomMetricCard
          description={t("classroom.activeStudents")}
          icon={Users}
          label={t("classroom.students")}
          value={formatNumber(locale, totals.students)}
        />
        <ClassroomMetricCard
          description={t("classroom.deliveryEvents")}
          icon={ClipboardCheck}
          label={t("classroom.activeAssignments")}
          value={formatNumber(locale, totals.activeAssignments)}
        />
        <ClassroomMetricCard
          description={t("classroom.classWork")}
          icon={Activity}
          label={t("classroom.allAssignments")}
          value={formatNumber(locale, totals.assignments)}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                {t("classroom.yourClasses")}
              </h2>
              <p className="teacher-muted">
                {t("classroom.openContext")}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/student/classrooms/join">{t("classroom.previewStudentJoin")}</Link>
            </Button>
          </div>

          {classrooms.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {classrooms.map((classroom, index) => (
                <article
                  className="teacher-card-hover teacher-panel flex min-h-[23rem] flex-col overflow-hidden"
                  key={classroom.id}
                >
                  <div
                    className={`border-b border-slate-200 p-5 ${
                      index % 3 === 0
                        ? "bg-gradient-to-br from-sky-100 via-white to-cyan-50"
                        : index % 3 === 1
                          ? "bg-gradient-to-br from-blue-100 via-white to-sky-50"
                          : "bg-gradient-to-br from-indigo-100 via-white to-sky-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ClassroomBadge tone="sky">
                            {classroomStatusLabel(locale, classroom.status)}
                          </ClassroomBadge>
                          {classroom.subject ? (
                            <ClassroomBadge>{classroom.subject}</ClassroomBadge>
                          ) : null}
                        </div>
                        <h3 className="break-words text-2xl font-bold text-slate-950">
                          {classroom.name}
                        </h3>
                        <p className="line-clamp-2 text-sm leading-6 text-slate-600">
                          {classroom.description ||
                            t("classroom.deliverySpaceDescription")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <div className="grid gap-3">
                      <ClassroomProgressRing
                        helper={
                          classroom.completionRate === null
                            ? t("classroom.completionAppearsAfterPractice")
                            : t("classroom.assignedWorkCompleted")
                        }
                        label={t("classroom.classCompletion")}
                        value={classroom.completionRate}
                      />
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {[
                          [t("classroom.students"), formatNumber(locale, classroom.studentCount)],
                          [t("classroom.activeWork"), formatNumber(locale, classroom.activeAssignmentCount)],
                          [t("classroom.drafts"), formatNumber(locale, classroom.draftAssignmentCount)],
                          [
                            t("classroom.blueprints"),
                            classroom.linkedBlueprintCount === null
                              ? t("classroom.blueprintsPlanned")
                              : formatNumber(locale, classroom.linkedBlueprintCount),
                          ],
                        ].map(([label, value]) => (
                          <div
                            className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                            key={label}
                          >
                            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {label}
                            </dt>
                            <dd className="mt-1 break-words text-sm font-bold text-slate-950">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {t("classroom.latestAssignment")}
                      </p>
                      {classroom.latestAssignment ? (
                        <div className="mt-2 space-y-1">
                          <p className="break-words text-sm font-bold text-slate-950">
                            {classroom.latestAssignment.title}
                          </p>
                          <p className="text-xs capitalize text-slate-500">
                            {assignmentStatusLabel(locale, classroom.latestAssignment.status)} - {t("assignments.due")} {formatDateForLocale(locale, classroom.latestAssignment.due_at, t("classroom.notSet"))}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {t("classroom.noAssignments")} {t("classroom.assignWhenReady")}
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                          {t("classroom.latestActivity")}:{" "}
                          <span className="font-semibold text-slate-900">
                            {formatDateTimeForLocale(locale, classroom.latestActivityAt, t("classroom.noActivityYet"))}
                          </span>
                        </p>
                        {classroom.joinCodeVisible ? (
                          <code className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-bold tracking-wide text-sky-900">
                            {classroom.joinCodeVisible}
                          </code>
                        ) : classroom.joinCodeHint ? (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                            {t("classroom.joinCode", { hint: classroom.joinCodeHint })}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ClassroomQuickAction
                          href={`/teacher/classrooms/${classroom.id}`}
                          icon={BookOpenCheck}
                          variant="default"
                        >
                          {t("classroom.open")}
                        </ClassroomQuickAction>
                        <ClassroomQuickAction
                          href={`/teacher/classrooms/${classroom.id}/assignments`}
                          icon={ClipboardCheck}
                        >
                          {t("classroom.assignmentHistory")}
                        </ClassroomQuickAction>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="teacher-panel p-8 text-center">
              <p className="teacher-eyebrow">{t("classroom.noClasses")}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                {t("classroom.noClassesDescription")}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("classroom.publishDescription")}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/teacher/banks">{t("classroom.openLibraries")}</Link>
                </Button>
                <Button asChild>
                  <a href="#create-class">{t("classroom.create")}</a>
                </Button>
              </div>
            </section>
          )}
        </section>

        <aside className="space-y-4">
          <section className="teacher-panel p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {t("classroom.publishRelationship")}
                </h2>
                <p className="teacher-muted">
                  {t("classroom.publishContext")}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ClassroomPublishCta label={t("classroom.openPublish")} />
            </div>
          </section>

          <section className="teacher-panel p-5" id="create-class">
            <h2 className="text-lg font-bold text-slate-950">{t("classroom.create")}</h2>
            <p className="teacher-muted">
              {t("classroom.createDescription")}
            </p>
            <form action={createClassroom} className="mt-5 space-y-4">
              <input
                name="requestId"
                type="hidden"
                value={classroomCreationRequestId}
              />
              <div className="space-y-2">
                <Label htmlFor="name">{t("classroom.className")}</Label>
                <Input
                  id="name"
                  maxLength={120}
                  name="name"
                  placeholder={t("classroom.classNamePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">{t("classroom.sectionSubject")}</Label>
                <Input
                  id="subject"
                  maxLength={120}
                  name="subject"
                  placeholder={t("classroom.subjectPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t("classroom.description")}</Label>
                <Textarea
                  id="description"
                  maxLength={2000}
                  name="description"
                  placeholder={t("classroom.descriptionPlaceholder")}
                  rows={4}
                />
              </div>
              <FormSubmitButton
                className="w-full"
                pendingLabel={t("classroom.creating")}
              >
                {t("classroom.create")}
              </FormSubmitButton>
            </form>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              {t("classroom.signedInAs", {
                user: profile.username || profile.email || t("classroom.teacherFallback"),
              })}
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
