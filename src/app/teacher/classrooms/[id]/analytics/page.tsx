import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, ClipboardCheck, MessageSquareText, Target } from "lucide-react";

import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherClassroomWorkspace } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomAnalyticsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ClassroomAnalyticsPage({
  params,
}: ClassroomAnalyticsPageProps) {
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
  const assigned = assignments.filter((assignment) => assignment.status === "assigned");
  const linkedPracticeSessions = assignments.reduce(
    (sum, assignment) => sum + assignment.progressSummary.linkedPracticeSessionCount,
    0,
  );
  const latestActivity =
    assignments
      .map((assignment) => assignment.progressSummary.latestPracticeSessionAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? classroom.latestActivityAt;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Progress</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Completion summaries use real assignment and Practice evidence.
              Deeper mastery and feedback drafting are placeholders until those
              engines are implemented.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/teacher/progress">All progress</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}`}>Back to overview</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
      <ClassroomSafetyStrip />

      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description="Assigned delivery events for this class."
          icon={ClipboardCheck}
          label="Assigned"
          value={assigned.length}
        />
        <ClassroomMetricCard
          description="Practice sessions linked back to class assignments."
          icon={BarChart3}
          label="Practice links"
          value={linkedPracticeSessions}
        />
        <ClassroomMetricCard
          description="Latest assignment, progress, or practice activity."
          icon={Target}
          label="Latest activity"
          value={formatClassroomDateTime(latestActivity)}
        />
        <ClassroomMetricCard
          description="Active roster for assignment delivery."
          icon={MessageSquareText}
          label="Students"
          value={classroom.studentCount}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <ClassroomProgressRing
          helper={
            classroom.completionRate === null
              ? "Completion appears after assigned work and student practice."
              : "Assigned work completed by active students."
          }
          label="Class completion rate"
          value={classroom.completionRate}
        />

        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Assignment completion summaries
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Each row is based on current roster membership, assignment
              progress, and linked Practice sessions.
            </p>
          </div>
          {assigned.length ? (
            <div className="divide-y divide-slate-100">
              {assigned.map((assignment) => (
                <Link
                  className="block p-5 transition hover:bg-sky-50/40"
                  href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                  key={assignment.id}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-bold text-slate-950">
                          {assignment.title}
                        </h3>
                        <ClassroomBadge tone="blue">Assigned</ClassroomBadge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {assignment.itemCount} item(s),{" "}
                        {assignment.progressSummary.linkedPracticeSessionCount} linked
                        Practice session(s)
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
              <p className="teacher-eyebrow">No analytics yet</p>
              <h3 className="mt-2 text-xl font-bold text-slate-950">
                Assign selected bank content to begin evidence collection.
              </h3>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                This page will remain empty until assigned work and Practice
                evidence exist.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          [
            "Taxonomy mastery",
            "Planned analytics will summarize mastery by active taxonomy targets after enough assignment evidence exists.",
          ],
          [
            "Mistake patterns",
            "Mistake pattern grouping will use linked Practice evidence, not fake classroom data.",
          ],
          [
            "Feedback drafting",
            "Teacher feedback drafting is a later workflow and will stay teacher-reviewed.",
          ],
        ].map(([title, description]) => (
          <article className="teacher-panel p-5" key={title}>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
