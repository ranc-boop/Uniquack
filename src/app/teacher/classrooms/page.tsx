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
import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomProgressRing,
  ClassroomPublishCta,
  ClassroomQuickAction,
  ClassroomSafetyStrip,
  classroomStatusLabel,
  formatClassroomDate,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listTeacherClassroomSummaries } from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type TeacherClassroomsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function TeacherClassroomsPage({
  searchParams,
}: TeacherClassroomsPageProps) {
  const profile = await requireTeacher();
  const params = await searchParams;
  const supabase = await createClient();
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
              <p className="teacher-eyebrow">Delivery layer</p>
              <ClassroomBadge tone="sky">Bank-first workflow</ClassroomBadge>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
                Classroom
              </h1>
              <p className="max-w-3xl text-base leading-7 text-slate-600">
                Classes are roster and delivery spaces. Build content in
                Question Bank or Blueprint, then publish selected work to
                classes.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a className="inline-flex items-center gap-2" href="#create-class">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Create Class
              </a>
            </Button>
            <ClassroomPublishCta />
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <ClassroomSafetyStrip />

      {params.saved ? (
        <p className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          {params.saved}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {params.error}
        </p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description="Roster spaces you manage."
          icon={Users}
          label="Classes"
          value={classrooms.length}
        />
        <ClassroomMetricCard
          description="Active students across visible classes."
          icon={Users}
          label="Students"
          value={totals.students}
        />
        <ClassroomMetricCard
          description="Current delivery events visible to students."
          icon={ClipboardCheck}
          label="Active assignments"
          value={totals.activeAssignments}
        />
        <ClassroomMetricCard
          description="Draft, assigned, and archived class work."
          icon={Activity}
          label="All assignments"
          value={totals.assignments}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Your classes</h2>
              <p className="teacher-muted">
                Open a class to view roster, delivery history, and feedback
                context. Publish remains a top-level teacher workflow.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/student/classrooms/join">Preview student join</Link>
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
                            {classroomStatusLabel(classroom.status)}
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
                            "Classroom delivery space for selected reviewed bank content."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-4 p-5">
                    <div className="grid gap-3">
                      <ClassroomProgressRing
                        helper={
                          classroom.completionRate === null
                            ? "Completion appears after assigned work and student practice."
                            : "Assigned work completed by active students."
                        }
                        label="Class completion"
                        value={classroom.completionRate}
                      />
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {[
                          ["Students", classroom.studentCount],
                          ["Active work", classroom.activeAssignmentCount],
                          ["Drafts", classroom.draftAssignmentCount],
                          [
                            "Blueprints",
                            classroom.linkedBlueprintCount === null
                              ? "Planned"
                              : classroom.linkedBlueprintCount,
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
                        Latest assignment
                      </p>
                      {classroom.latestAssignment ? (
                        <div className="mt-2 space-y-1">
                          <p className="break-words text-sm font-bold text-slate-950">
                            {classroom.latestAssignment.title}
                          </p>
                          <p className="text-xs capitalize text-slate-500">
                            {classroom.latestAssignment.status} - Due{" "}
                            {formatClassroomDate(classroom.latestAssignment.due_at)}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          No assignments yet. Publish selected bank content when
                          this class is ready.
                        </p>
                      )}
                    </div>

                    <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-slate-600">
                          Latest activity:{" "}
                          <span className="font-semibold text-slate-900">
                            {formatClassroomDateTime(classroom.latestActivityAt)}
                          </span>
                        </p>
                        {classroom.joinCodeVisible ? (
                          <code className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-bold tracking-wide text-sky-900">
                            {classroom.joinCodeVisible}
                          </code>
                        ) : classroom.joinCodeHint ? (
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                            Join code {classroom.joinCodeHint}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ClassroomQuickAction
                          href={`/teacher/classrooms/${classroom.id}`}
                          icon={BookOpenCheck}
                          variant="default"
                        >
                          Open class
                        </ClassroomQuickAction>
                        <ClassroomQuickAction
                          href={`/teacher/classrooms/${classroom.id}/assignments`}
                          icon={ClipboardCheck}
                        >
                          Assignment history
                        </ClassroomQuickAction>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="teacher-panel p-8 text-center">
              <p className="teacher-eyebrow">No classes yet</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">
                No classes yet. Create your first class after your banks are
                ready.
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Start with a Question Bank, approve reusable content, then
                create a class for roster and assignment delivery.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/teacher/banks">Open Question Bank</Link>
                </Button>
                <Button asChild>
                  <a href="#create-class">Create Class</a>
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
                  Publish relationship
                </h2>
                <p className="teacher-muted">
                  Publish is where teachers distribute work. Classroom is where
                  they view class-specific delivery and evidence.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ClassroomPublishCta label="Open Publish" />
            </div>
          </section>

          <section className="teacher-panel p-5" id="create-class">
            <h2 className="text-lg font-bold text-slate-950">Create Class</h2>
            <p className="teacher-muted">
              Join codes stay available to teachers on the class page and
              continue to validate through the hashed code path.
            </p>
            <form action={createClassroom} className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Class name</Label>
                <Input
                  id="name"
                  maxLength={120}
                  name="name"
                  placeholder="AP Calculus BC Period 2"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Section / subject</Label>
                <Input
                  id="subject"
                  maxLength={120}
                  name="subject"
                  placeholder="Calculus"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  maxLength={2000}
                  name="description"
                  placeholder="Roster for spring review and practice."
                  rows={4}
                />
              </div>
              <Button className="w-full" type="submit">
                Create Class
              </Button>
            </form>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Signed in as {profile.username || profile.email || "teacher"}.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
