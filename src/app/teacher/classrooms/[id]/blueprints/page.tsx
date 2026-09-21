import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Sparkles } from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
} from "@/app/teacher/classrooms/classroom-ui";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { formatNumber } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomBlueprintsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomBlueprintsPage({
  params,
}: ClassroomBlueprintsPageProps) {
  await requireTeacher();
  const locale = await getRequestLocale();
  const t = (key: MessageKey, values?: Record<string, number | string>) =>
    translate(locale, key, values);
  const { id } = await params;
  const supabase = await createClient();
  const workspace = await getTeacherClassroomWorkspace({
    classroomId: id,
    supabase,
  });

  if (!workspace) {
    notFound();
  }

  const { assignments, classroom } = workspace;
  const bankLinkedAssignments = assignments.filter(
    (assignment) => assignment.source_kind === "question_bank",
  );

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">{t("classroomBlueprints.title")}</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              {t("classroomBlueprints.description")}
            </p>
          </div>
          <Button asChild>
            <Link href="/teacher/blueprints">{t("classroomBlueprints.openLibrary")}</Link>
          </Button>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <section className="grid gap-3 md:grid-cols-3">
        <ClassroomMetricCard
          description={t("classroomBlueprints.linkedDescription")}
          icon={Sparkles}
          label={t("classroomBlueprints.linked")}
          value={
            classroom.linkedBlueprintCount === null
              ? t("classroom.blueprintsPlanned")
              : formatNumber(locale, classroom.linkedBlueprintCount)
          }
        />
        <ClassroomMetricCard
          description={t("classroomBlueprints.libraryAssignmentsDescription")}
          icon={ClipboardCheck}
          label={t("classroomBlueprints.libraryAssignments")}
          value={formatNumber(locale, bankLinkedAssignments.length)}
        />
        <ClassroomMetricCard
          description={t("classroomBlueprints.allAssignmentsDescription")}
          icon={ClipboardCheck}
          label={t("classroom.allAssignments")}
          value={formatNumber(locale, assignments.length)}
        />
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">
            {t("classroomBlueprints.planningContext")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {t("classroomBlueprints.planningDescription")}
          </p>
        </div>
        {bankLinkedAssignments.length ? (
          <div className="divide-y divide-slate-100">
            {bankLinkedAssignments.map((assignment) => (
              <Link
                className="block p-5 transition hover:bg-sky-50/40"
                href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                key={assignment.id}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassroomBadge tone="blue">
                        {assignment.source_kind === "question_bank"
                          ? t("assignmentDetail.library")
                          : assignment.source_kind === "course_builder_run"
                            ? t("assignmentDetail.courseBuilderRun")
                            : assignment.source_kind === "practice_framework"
                              ? t("assignmentDetail.practiceFramework")
                              : t("assignmentDetail.manual")}
                      </ClassroomBadge>
                      <ClassroomBadge>
                        {assignment.status === "assigned"
                          ? t("classroom.assignmentStatusAssigned")
                          : assignment.status === "draft"
                            ? t("classroom.assignmentStatusDraft")
                            : assignment.status === "archived"
                              ? t("classroom.assignmentStatusArchived")
                              : t("classroom.assignmentStatusUnknown")}
                      </ClassroomBadge>
                    </div>
                    <h3 className="break-words text-base font-bold text-slate-950">
                      {assignment.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-600">
                      {t("classroomBlueprints.selectedItems", {
                        count: formatNumber(locale, assignment.itemCount),
                      })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-sky-700">
                    {t("classroomBlueprints.openAssignment")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="teacher-eyebrow">{t("classroomBlueprints.noLinked")}</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              {t("classroomBlueprints.noLinkedTitle")}
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {t("classroomBlueprints.noLinkedDescription")}
            </p>
            <Button asChild className="mt-5" variant="outline">
              <Link href="/teacher/blueprints">{t("classroomBlueprints.openLibrary")}</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
