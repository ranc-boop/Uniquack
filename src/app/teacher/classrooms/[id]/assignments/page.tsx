import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ClassroomPublishCta,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { formatDate as formatLocaleDate, formatDateTime as formatLocaleDateTime, formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import {
  getAssignmentDeliveryQuarantine,
  getManagedClassroom,
  listTeacherClassroomAssignments,
  type TeacherAssignmentSummary,
} from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

type TeacherAssignmentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

type AssignmentGroup = {
  description: string;
  empty: string;
  items: TeacherAssignmentSummary[];
  title: string;
};

function statusClasses(status: string) {
  if (status === "assigned") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "draft") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function AssignmentCard({
  assignment,
  classroomId,
  locale,
  t,
}: {
  assignment: TeacherAssignmentSummary;
  classroomId: string;
  locale: Parameters<typeof translate>[0];
  t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string;
}) {
  const progressSummary = assignment.progressSummary;
  const isDeliveryPaused = Boolean(
    getAssignmentDeliveryQuarantine(assignment.source_summary),
  );
  const displayStatus = isDeliveryPaused ? "paused" : assignment.status;

  return (
    <Link
      className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      href={`/teacher/classrooms/${classroomId}/assignments/${assignment.id}`}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="max-w-full break-words text-base font-bold text-slate-950">
              {assignment.title}
            </h3>
            <span
              className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(
                displayStatus,
              )}`}
            >
              {isDeliveryPaused ? t("assignments.deliveryPaused") : ({ assigned: t("assignments.assigned"), draft: t("assignments.draft"), archived: t("assignments.archived") } as Record<string, string>)[assignment.status] ?? assignment.status}
            </span>
          </div>
          {assignment.instructions ? (
            <p className="line-clamp-2 text-sm leading-6 text-slate-600">
              {assignment.instructions}
            </p>
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              {t("assignments.noInstructions")}
            </p>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t("assignments.due")}
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {assignment.due_at ? formatLocaleDate(locale, assignment.due_at, { dateStyle: "medium" }) : t("assignments.noDueDate")}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t("assignments.items")}
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatNumber(locale, assignment.itemCount)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t("assignments.completed")}
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {formatNumber(locale, progressSummary.completedCount)}/{formatNumber(locale, progressSummary.studentCount)}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {t("assignments.latestActivity")}
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {progressSummary.latestPracticeSessionAt ? formatLocaleDateTime(locale, progressSummary.latestPracticeSessionAt) : t("assignments.noActivity")}
              </dd>
            </div>
          </dl>
        </div>
        <div className="grid min-w-full grid-cols-3 gap-2 text-center xl:min-w-56">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {formatNumber(locale, progressSummary.notStartedCount)}
            </span>
            <span className="text-xs text-slate-500">{t("assignments.notStarted")}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {formatNumber(locale, progressSummary.inProgressCount)}
            </span>
            <span className="text-xs text-slate-500">{t("assignments.active")}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="block text-base font-bold text-slate-950">
              {formatNumber(locale, progressSummary.completedCount)}
            </span>
            <span className="text-xs text-slate-500">{t("assignments.done")}</span>
          </div>
          <span className="col-span-3 text-sm font-semibold text-blue-700">
            {t("assignments.openProgress")}
          </span>
        </div>
      </div>
    </Link>
  );
}

function AssignmentSection({
  classroomId,
  group,
  locale,
  t,
}: {
  classroomId: string;
  group: AssignmentGroup;
  locale: Parameters<typeof translate>[0];
  t: (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => string;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{group.title}</h2>
            <p className="teacher-muted">{group.description}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {group.items.length}
          </span>
        </div>
      </div>
      {group.items.length ? (
        <div className="grid gap-4 p-5">
          {group.items.map((assignment) => (
            <AssignmentCard
              assignment={assignment}
              classroomId={classroomId}
              locale={locale}
              t={t}
              key={assignment.id}
            />
          ))}
        </div>
      ) : (
        <div className="p-5 text-sm leading-6 text-slate-600">{group.empty}</div>
      )}
    </section>
  );
}

export default async function TeacherAssignmentsPage({
  params,
  searchParams,
}: TeacherAssignmentsPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate(locale, key, values);
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  let classroom;
  let assignments;

  try {
    classroom = await getManagedClassroom({ classroomId: id, supabase });
    assignments = await listTeacherClassroomAssignments({
      classroomId: id,
      supabase,
    });
  } catch {
    notFound();
  }

  const paused = assignments.filter((assignment) =>
    Boolean(getAssignmentDeliveryQuarantine(assignment.source_summary)),
  );
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const draft = assignments.filter(
    (assignment) =>
      assignment.status === "draft" &&
      !getAssignmentDeliveryQuarantine(assignment.source_summary),
  );
  const archived = assignments.filter((assignment) => assignment.status === "archived");
  const groups: AssignmentGroup[] = [
    {
      title: t("assignments.deliveryPaused"),
      description:
        t("assignments.pausedDescription"),
      empty: t("assignments.noPaused"),
      items: paused,
    },
    {
      title: t("assignments.assigned"), description: t("assignments.assignedDescription"), empty: t("assignments.noAssigned"),
      items: assigned,
    },
    {
      title: t("assignments.draft"), description: t("assignments.draftDescription"), empty: t("assignments.noDrafts"),
      items: draft,
    },
    {
      title: t("assignments.archived"), description: t("assignments.archivedDescription"), empty: t("assignments.noArchived"),
      items: archived,
    },
  ];
  const latestActivity =
    assignments
      .map((assignment) => assignment.progressSummary.latestPracticeSessionAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("assignments.teacherAssignments")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {t("assignments.deliveryHistoryDescription")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">{t("assignments.teacherStudio")}</Link>
            </Button>
            {classroom.status === "active" ? (
              <>
                <ClassroomPublishCta
                  classroomId={classroom.id}
                  label={t("assignments.publishToClasses")}
                />
                <Button asChild>
                  <Link href={`/teacher/publish?classroomId=${classroom.id}`}>
                    {t("assignments.publishNewWork")}
                  </Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                  {t("assignments.reopenBeforePublishing")}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}`}>
                {t("assignments.backToRoster")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">{t("assignments.assignmentVisibility")}:</strong>{" "}
        {t("assignments.assignmentVisibilityDescription")}
      </section>
      {classroom.status === "archived" ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {t("assignments.archivedClassroomNotice")}
        </section>
      ) : null}

      {query.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {t("assignments.actionSaved")}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {t("assignments.actionFailed")}
        </p>
      ) : null}

      {assignments.length ? (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            {[
              [t("assignments.assigned"), assigned.length], [t("assignments.paused"), paused.length], [t("assignments.draft"), draft.length], [t("assignments.archived"), archived.length], [t("assignments.latestActivity"), latestActivity ? formatLocaleDateTime(locale, latestActivity) : t("assignments.noActivity")],
            ].map(([label, value]) => (
              <div
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                key={label}
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 break-words text-2xl font-bold text-slate-950">
                  {typeof value === "number" ? formatNumber(locale, value) : value}
                </p>
              </div>
            ))}
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-100 p-5">
              <h2 className="text-lg font-bold text-slate-950">
                {t("assignments.classroomAssignments")}
              </h2>
              <p className="teacher-muted">
                {t("assignments.classroomAssignmentsDescription")}
              </p>
            </div>
            <div className="p-5 text-sm leading-6 text-slate-600">
              {t("assignments.statusSectionsDescription")}
            </div>
          </section>

          {groups.map((group) => (
            <AssignmentSection
              classroomId={classroom.id}
              group={group}
              locale={locale}
              t={t}
              key={group.title}
            />
          ))}
        </>
      ) : (
        <section className="teacher-panel flex min-h-72 items-center justify-center p-8 text-center">
          <div className="max-w-md space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {t("assignments.noAssignments")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {t("assignments.noAssignmentsDescription")}
              </p>
            </div>
            {classroom.status === "active" ? (
              <Button asChild>
                <Link href={`/teacher/publish?classroomId=${classroom.id}`}>
                  {t("assignments.publishNewWork")}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                  {t("assignments.reopenBeforePublishing")}
                </Link>
              </Button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
