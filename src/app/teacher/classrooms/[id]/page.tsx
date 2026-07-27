import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  Users,
} from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomPublishCta,
  ClassroomQuickAction,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
  classroomStatusLabel,
  formatClassroomDate,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherClassroomDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    newCode?: string;
    saved?: string;
  }>;
};

function sourceKindLabel(kind: string) {
  if (kind === "question_bank") return "Library";
  if (kind === "course_builder_run") return "Course Builder";
  if (kind === "practice_framework") return "Practice framework";
  return "Manual";
}

export default async function TeacherClassroomDetailPage({
  params,
  searchParams,
}: TeacherClassroomDetailPageProps) {
  await requireTeacher();
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

  const { assignments, classroom, roster } = workspace;
  const visibleJoinCode = query.newCode || classroom.joinCodeVisible;
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const draft = assignments.filter((assignment) => assignment.status === "draft");
  const recentAssignments = assignments.slice(0, 4);
  const attentionAssignments = assigned.filter(
    (assignment) =>
      assignment.progressSummary.studentCount > 0 &&
      assignment.progressSummary.completedCount <
        assignment.progressSummary.studentCount,
  );
  const activeStudents = roster.filter(
    (member) => member.role === "student" && member.status === "active",
  );
  const owner = roster.find((member) => member.user_id === classroom.owner_id);
  const activeCoTeachers = roster.filter(
    (member) => member.role === "co_teacher" && member.status === "active",
  );
  const studentsNeedingAttention = activeStudents.filter(
    (student) => student.assignmentSummary.needsAttention,
  );

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero overflow-hidden p-0">
        <div className="bg-gradient-to-br from-sky-100 via-white to-blue-50 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-4xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="teacher-eyebrow">Classroom workspace</p>
                <ClassroomBadge tone="sky">
                  {classroomStatusLabel(classroom.status)}
                </ClassroomBadge>
                {classroom.subject ? (
                  <ClassroomBadge>{classroom.subject}</ClassroomBadge>
                ) : null}
              </div>
              <div className="space-y-2">
                <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                  {classroom.name}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-600">
                  {classroom.description ||
                    "Review joined students, delivery history, and evidence for selected Library content."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {classroom.status === "active" ? (
                <ClassroomPublishCta classroomId={classroom.id} />
              ) : (
                <Button asChild variant="outline">
                  <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                    Reopen in settings
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/teacher/classrooms">Back to classes</Link>
              </Button>
            </div>
          </div>

          <div className="mt-5">
            <TeacherWorkspaceNav />
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-200 bg-white/80 p-5 md:grid-cols-4">
          <ClassroomMetricCard
            description="Active students in this roster."
            icon={Users}
            label="Students"
            value={classroom.studentCount}
          />
          <ClassroomMetricCard
            description="Assigned work currently visible to students."
            icon={ClipboardCheck}
            label="Active assignments"
            value={classroom.activeAssignmentCount}
          />
          <ClassroomMetricCard
            description="Active co-teachers in this delivery space."
            icon={Users}
            label="Co-teachers"
            value={classroom.coTeacherCount}
          />
          <ClassroomMetricCard
            description="Latest assignment, progress, or practice activity."
            icon={Activity}
            label="Recent activity"
            value={formatClassroomDateTime(classroom.latestActivityAt)}
          />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <ClassroomSafetyStrip />

      {query.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      {visibleJoinCode && classroom.status === "active" ? (
        <section className="teacher-soft-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="teacher-eyebrow">Active join code</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                Share this code when enrollment is open.
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Students can join the roster, but joining a class does not grant
                access to the teacher&apos;s source Libraries.
              </p>
            </div>
            <code className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-2xl font-bold tracking-[0.16em] text-slate-950">
              {visibleJoinCode}
            </code>
          </div>
        </section>
      ) : (
        <section className="teacher-soft-panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="teacher-eyebrow">Join code status</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">
                {classroom.status === "archived"
                  ? "Joining is blocked while this classroom is archived."
                  : "No active join code is visible."}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Manage join-code rotation, disablement, and reopening from
                Settings. Codes never grant source Library access.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                Manage joining
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-white/70 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="teacher-eyebrow">Overview</p>
                  <h2 className="text-xl font-bold text-slate-950">
                    Class delivery snapshot
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    This overview is bounded to real classroom roster,
                    assignment, and practice evidence data.
                  </p>
                </div>
                <ClassroomQuickAction
                  href={`/teacher/classrooms/${classroom.id}/assignments`}
                  icon={ClipboardCheck}
                >
                  View assignments
                </ClassroomQuickAction>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[20rem_1fr]">
              <ClassroomProgressRing
                helper={
                  classroom.completionRate === null
                    ? "Completion appears after assigned work and student practice."
                    : "Assigned work completed by active students."
                }
                label="Class completion rate"
                value={classroom.completionRate}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Students", classroom.studentCount],
                  ["Co-teachers", activeCoTeachers.length],
                  ["Assigned", assigned.length],
                  ["Teacher drafts", draft.length],
                  ["Attention", studentsNeedingAttention.length],
                ].map(([label, value]) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                    key={label}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="teacher-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-white/70 p-5">
              <h2 className="text-xl font-bold text-slate-950">
                Recent assignments
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Classroom assignment pages are the history and evidence view for
                this class. Publish new work from the top-level Publish module.
              </p>
            </div>
            {recentAssignments.length ? (
              <div className="divide-y divide-slate-100">
                {recentAssignments.map((assignment) => (
                  <Link
                    className="block p-5 transition hover:bg-sky-50/40"
                    href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ClassroomBadge
                            tone={assignment.status === "assigned" ? "blue" : "slate"}
                          >
                            {assignment.status}
                          </ClassroomBadge>
                          <ClassroomBadge>{sourceKindLabel(assignment.source_kind)}</ClassroomBadge>
                        </div>
                        <h3 className="break-words text-lg font-bold text-slate-950">
                          {assignment.title}
                        </h3>
                        <p className="text-sm leading-6 text-slate-600">
                          Due {formatClassroomDate(assignment.due_at)} -{" "}
                          {assignment.itemCount} item(s)
                        </p>
                      </div>
                      <div className="grid min-w-full grid-cols-3 gap-2 text-center lg:min-w-72">
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {assignment.progressSummary.notStartedCount}
                          </span>
                          <span className="text-xs text-slate-500">Not started</span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {assignment.progressSummary.inProgressCount}
                          </span>
                          <span className="text-xs text-slate-500">Active</span>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <span className="block text-base font-bold text-slate-950">
                            {assignment.progressSummary.completedCount}
                          </span>
                          <span className="text-xs text-slate-500">Done</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="teacher-eyebrow">No assignment history</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">
                  Assign selected Library content to start class delivery.
                </h3>
                <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  New work should start from reviewed Library content. This class
                  overview will show delivery and practice evidence afterward.
                </p>
                <div className="mt-5">
                  {classroom.status === "active" ? (
                    <ClassroomPublishCta classroomId={classroom.id} />
                  ) : (
                    <Button asChild variant="outline">
                      <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                        Reopen before publishing
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Students needing attention
            </h2>
            {attentionAssignments.length ? (
              <div className="mt-4 space-y-3">
                {attentionAssignments.slice(0, 3).map((assignment) => (
                  <Link
                    className="block rounded-lg border border-amber-200 bg-amber-50 p-3 transition hover:bg-amber-100/70"
                    href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <p className="break-words text-sm font-bold text-amber-950">
                      {assignment.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">
                      {assignment.progressSummary.notStartedCount} not started,{" "}
                      {assignment.progressSummary.inProgressCount} active.
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">
                No attention list yet. It appears after students begin assigned
                work and practice evidence starts flowing back.
              </p>
            )}
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Class team</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Owner:{" "}
              <span className="font-semibold text-slate-900">
                {owner?.displayName ?? "Classroom owner"}
              </span>
              . Active roster: {activeStudents.length} student(s). Co-teachers:
              {" "}
              {activeCoTeachers.length}.
            </p>
            {activeStudents.length ? (
              <div className="mt-4 space-y-2">
                {activeStudents.slice(0, 4).map((student) => (
                  <div
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    key={student.id}
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {student.displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {student.email || student.profile?.username || "Student"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/students`}>
                  Students
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/teachers`}>
                  Teachers
                </Link>
              </Button>
            </div>
          </section>

          <section className="teacher-panel p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <BarChart3 aria-hidden="true" className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  Progress
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Completion summaries use real assignment evidence. Feedback is
                  available from assignment detail; taxonomy mastery and mistake
                  pattern aggregates are planned next-layer analytics.
                </p>
              </div>
            </div>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/analytics`}>
                Open progress
              </Link>
            </Button>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Linked Blueprint context
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {classroom.linkedBlueprintCount === null
                ? "Blueprints linked to this class will appear here. Use Blueprint Library to organize plans before publishing."
                : `${classroom.linkedBlueprintCount} blueprint(s) are connected through assigned Library content.`}
            </p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/teacher/blueprints">Open Blueprint Library</Link>
            </Button>
          </section>
        </aside>
      </div>
    </main>
  );
}
