import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus, Users } from "lucide-react";

import {
  addClassroomCoTeacher,
  removeClassroomCoTeacher,
} from "@/app/teacher/classrooms/actions";
import {
  ClassroomBadge,
  ClassroomMetricCard,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { FormSubmitButton } from "@/components/form-submit-button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherClassroomWorkspace,
  type TeacherClassroomRosterMember,
} from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomTeachersPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function TeacherMemberRow({
  canManageCoTeachers,
  classroomId,
  member,
}: {
  canManageCoTeachers: boolean;
  classroomId: string;
  member: TeacherClassroomRosterMember;
}) {
  return (
    <article className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-bold text-slate-950">
              {member.displayName}
            </h3>
            <ClassroomBadge tone={member.role === "teacher" ? "blue" : "sky"}>
              {member.role === "teacher" ? "Owner" : "Co-teacher"}
            </ClassroomBadge>
            <ClassroomBadge tone={member.status === "active" ? "sky" : "amber"}>
              {member.status}
            </ClassroomBadge>
          </div>
          <p className="break-words text-sm leading-6 text-slate-600">
            {member.email || member.profile?.username || member.user_id}
          </p>
          <p className="text-xs text-slate-500">
            Added {formatClassroomDateTime(member.joined_at ?? member.created_at)}
          </p>
        </div>
        {canManageCoTeachers && member.role === "co_teacher" && member.status === "active" ? (
          <form action={removeClassroomCoTeacher} className="w-full max-w-sm space-y-2">
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
              <span>Remove classroom operations access only.</span>
            </label>
            <FormSubmitButton
              className="w-full"
              pendingLabel="Removing..."
              variant="outline"
            >
              Remove co-teacher
            </FormSubmitButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function ClassroomTeachersPage({
  params,
  searchParams,
}: ClassroomTeachersPageProps) {
  const profile = await requireTeacher();
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
  const teacherMembers = roster.filter((member) => member.role !== "student");
  const owner = teacherMembers.find((member) => member.user_id === classroom.owner_id);
  const activeCoTeachers = teacherMembers.filter(
    (member) => member.role === "co_teacher" && member.status === "active",
  );
  const removedCoTeachers = teacherMembers.filter(
    (member) => member.role === "co_teacher" && member.status === "removed",
  );
  const canManageCoTeachers = profile.id === classroom.owner_id;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Teachers</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Manage classroom operators without automatically granting access
              to source banks, provider settings, or Blueprint internals.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classrooms/${classroom.id}`}>Back to overview</Link>
          </Button>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
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

      <section className="grid gap-3 md:grid-cols-3">
        <ClassroomMetricCard
          description="The classroom owner controls co-teacher access."
          icon={Users}
          label="Owner"
          value={owner?.displayName ?? "Owner"}
        />
        <ClassroomMetricCard
          description="Active operators for classroom delivery."
          icon={Users}
          label="Co-teachers"
          value={activeCoTeachers.length}
        />
        <ClassroomMetricCard
          description="Removed operators retained for auditability."
          icon={Users}
          label="Removed"
          value={removedCoTeachers.length}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-white/70 p-5">
            <h2 className="text-xl font-bold text-slate-950">
              Classroom teaching team
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Co-teachers can help with classroom operations under existing
              policy. They still need separate bank membership to inspect source
              bank content.
            </p>
          </div>
          {teacherMembers.length ? (
            <div className="divide-y divide-slate-100">
              {teacherMembers.map((member) => (
                <TeacherMemberRow
                  canManageCoTeachers={canManageCoTeachers}
                  classroomId={classroom.id}
                  key={member.id}
                  member={member}
                />
              ))}
            </div>
          ) : (
            <div className="p-6 text-sm leading-6 text-slate-600">
              No teacher membership rows are visible.
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Add co-teacher</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add an existing teacher-capable account by email or username.
              This does not add them to source Question Banks.
            </p>
            {canManageCoTeachers ? (
              <form action={addClassroomCoTeacher} className="mt-4 space-y-4">
                <input name="classroomId" type="hidden" value={classroom.id} />
                <div className="space-y-2">
                  <Label htmlFor="teacherLookup">Teacher email or username</Label>
                  <Input
                    id="teacherLookup"
                    maxLength={180}
                    name="teacherLookup"
                    placeholder="teacher@example.com"
                    required
                  />
                </div>
                <FormSubmitButton className="w-full" pendingLabel="Adding...">
                  <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
                  Add co-teacher
                </FormSubmitButton>
              </form>
            ) : (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                Only the classroom owner can add or remove co-teachers.
              </p>
            )}
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Boundary</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Classroom roles are operational. They do not expose provider
              settings, public library controls, private student self-study, or
              unrestricted source bank questions.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}
