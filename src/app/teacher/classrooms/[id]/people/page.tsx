import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createClassroomJoinCode,
  removeClassroomStudent,
} from "@/app/teacher/classrooms/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  ClassroomBadge,
  ClassroomRouteTabs,
  ClassroomSafetyStrip,
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherClassroomWorkspace,
  type TeacherClassroomRosterMember,
} from "@/lib/teacher-classrooms";

export const dynamic = "force-dynamic";

type ClassroomPeoplePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function RosterRow({
  classroomId,
  canRemove,
  member,
}: {
  canRemove?: boolean;
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
            <ClassroomBadge tone={member.status === "active" ? "sky" : "amber"}>
              {member.status}
            </ClassroomBadge>
            <ClassroomBadge>{member.role}</ClassroomBadge>
          </div>
          <p className="break-words text-sm leading-6 text-slate-600">
            {member.email || member.profile?.username || member.user_id}
          </p>
          <p className="text-xs text-slate-500">
            Joined {formatClassroomDateTime(member.joined_at ?? member.created_at)}
          </p>
        </div>
        {canRemove ? (
          <form action={removeClassroomStudent}>
            <input name="classroomId" type="hidden" value={classroomId} />
            <input name="memberId" type="hidden" value={member.id} />
            <Button type="submit" variant="outline">
              Remove from class
            </Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

export default async function ClassroomPeoplePage({
  params,
  searchParams,
}: ClassroomPeoplePageProps) {
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

  const { classroom, roster } = workspace;
  const teachers = roster.filter((member) => member.role !== "student");
  const students = roster.filter((member) => member.role === "student");
  const activeStudents = students.filter((member) => member.status === "active");

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">People</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Manage the class roster and keep the join code visible to
              teachers.
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

      <section className="teacher-soft-panel p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="teacher-eyebrow">Class join code</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Joining a class does not grant access to the teacher&apos;s source
              banks.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              The roster controls assignment delivery only. Bank membership and
              bank content access remain separate.
            </p>
          </div>
          {classroom.joinCodeVisible ? (
            <code className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-2xl font-bold tracking-[0.16em] text-slate-950">
              {classroom.joinCodeVisible}
            </code>
          ) : (
            <form
              action={createClassroomJoinCode}
              className="flex flex-col items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 md:items-end"
            >
              <input name="classroomId" type="hidden" value={classroom.id} />
              <span className="text-sm font-semibold text-slate-600">
                Join code unavailable
              </span>
              <FormSubmitButton pendingLabel="Creating code..." variant="outline">
                Create join code
              </FormSubmitButton>
            </form>
          )}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["Teachers", teachers.filter((member) => member.status === "active").length],
          ["Active students", activeStudents.length],
          ["Removed students", students.filter((member) => member.status === "removed").length],
        ].map(([label, value]) => (
          <div className="teacher-panel p-4" key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">Teachers</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Teachers and co-teachers can manage classroom delivery. Bank roles
            remain managed from Question Bank.
          </p>
        </div>
        {teachers.length ? (
          <div className="divide-y divide-slate-100">
            {teachers.map((member) => (
              <RosterRow classroomId={classroom.id} key={member.id} member={member} />
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm leading-6 text-slate-600">
            No teacher membership rows are visible.
          </div>
        )}
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">Students</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Remove from class is a soft roster removal. It does not delete
            historical assignment evidence.
          </p>
        </div>
        {students.length ? (
          <div className="divide-y divide-slate-100">
            {students.map((member) => (
              <RosterRow
                canRemove={member.status === "active"}
                classroomId={classroom.id}
                key={member.id}
                member={member}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="teacher-eyebrow">No students yet</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              Share the join code when the class is ready.
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Students will appear here after joining through the student class
              code flow.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
