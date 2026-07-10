import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, Sparkles } from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomBlueprintsPageProps = {
  params: Promise<{ id: string }>;
};

function sourceKindLabel(kind: string) {
  if (kind === "question_bank") return "Question Bank";
  if (kind === "course_builder_run") return "Course Builder";
  if (kind === "practice_framework") return "Practice framework";
  return "Manual";
}

export default async function ClassroomBlueprintsPage({
  params,
}: ClassroomBlueprintsPageProps) {
  await requireTeacher();
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
            <p className="teacher-eyebrow">Linked Blueprints</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Blueprint planning context sits above classroom delivery. This
              view shows available bank-linked context without generating
              questions or delivering blueprints directly to students.
            </p>
          </div>
          <Button asChild>
            <Link href="/teacher/blueprints">Open Blueprint Library</Link>
          </Button>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <ClassroomSafetyStrip />

      <section className="grid gap-3 md:grid-cols-3">
        <ClassroomMetricCard
          description="Blueprints connected through assigned bank content when available."
          icon={Sparkles}
          label="Linked blueprints"
          value={
            classroom.linkedBlueprintCount === null
              ? "Planned"
              : classroom.linkedBlueprintCount
          }
        />
        <ClassroomMetricCard
          description="Assignments carrying Question Bank lineage."
          icon={ClipboardCheck}
          label="Bank-sourced assignments"
          value={bankLinkedAssignments.length}
        />
        <ClassroomMetricCard
          description="All delivery events for this class."
          icon={ClipboardCheck}
          label="All assignments"
          value={assignments.length}
        />
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">
            Planning context for this class
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Blueprints are library assets used to organize plans before
            publishing. They are not sent directly to students from this page.
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
                        {sourceKindLabel(assignment.source_kind)}
                      </ClassroomBadge>
                      <ClassroomBadge>{assignment.status}</ClassroomBadge>
                    </div>
                    <h3 className="break-words text-base font-bold text-slate-950">
                      {assignment.title}
                    </h3>
                    <p className="text-sm leading-6 text-slate-600">
                      {assignment.itemCount} selected bank item(s). Open the
                      assignment to inspect source lineage.
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-sky-700">
                    Open assignment
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="teacher-eyebrow">No linked blueprints yet</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              Blueprints linked to this class will appear here.
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Use Blueprint Library to organize plans before publishing. Class
              links can be introduced through bank-linked assignments without
              exposing source banks to students.
            </p>
            <Button asChild className="mt-5" variant="outline">
              <Link href="/teacher/blueprints">Open Blueprint Library</Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
