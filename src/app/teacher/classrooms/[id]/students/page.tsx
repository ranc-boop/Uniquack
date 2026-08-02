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
  formatClassroomDateTime,
} from "@/app/teacher/classrooms/classroom-ui";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
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

function StudentCard({
  classroomId,
  classroomStatus,
  member,
}: {
  classroomId: string;
  classroomStatus: string;
  member: TeacherClassroomRosterMember;
}) {
  const summary = member.assignmentSummary;

  return (
    <article className="p-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-bold text-slate-950">
              {member.displayName}
            </h3>
            <ClassroomBadge tone={member.status === "active" ? "sky" : "amber"}>
              {member.status}
            </ClassroomBadge>
            {summary.needsAttention && member.status === "active" ? (
              <ClassroomBadge tone="amber">Needs attention</ClassroomBadge>
            ) : null}
          </div>
          <p className="break-words text-sm leading-6 text-slate-600">
            {member.email || member.profile?.username || member.user_id}
          </p>
          <p className="text-xs text-slate-500">
            Joined {formatClassroomDateTime(member.joined_at ?? member.created_at)}
          </p>
          <p className="text-sm leading-6 text-slate-600">
            Latest assignment activity: {formatClassroomDateTime(summary.latestActivityAt)}
          </p>
        </div>

        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Assigned</dt>
              <dd className="text-base font-bold text-slate-950">
                {summary.assignedCount}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Completed</dt>
              <dd className="text-base font-bold text-slate-950">
                {summary.completedCount}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <dt className="text-xs text-slate-500">Practice</dt>
              <dd className="text-base font-bold text-slate-950">
                {summary.linkedPracticeSessionCount}
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
                <span>Remove from active roster and preserve all history.</span>
              </label>
              <FormSubmitButton
                className="w-full"
                pendingLabel="Removing..."
                variant="outline"
              >
                <UserMinus aria-hidden="true" className="mr-2 h-4 w-4" />
                Remove from active roster
              </FormSubmitButton>
            </form>
          ) : classroomStatus === "active" ? (
            <form action={restoreClassroomStudent}>
              <input name="classroomId" type="hidden" value={classroomId} />
              <input name="memberId" type="hidden" value={member.id} />
              <FormSubmitButton className="w-full" pendingLabel="Restoring...">
                Restore to active roster
              </FormSubmitButton>
            </form>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
              Reopen the classroom before restoring roster access.
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
            <p className="teacher-eyebrow">Students</p>
            <h1 className="break-words text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Manage active roster access without deleting assignment attempts,
              practice evidence, or teacher feedback.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classrooms/${classroom.id}`}>Back to overview</Link>
          </Button>
        </div>
      </section>

      <ClassroomRouteTabs classroomId={classroom.id} />
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

      <section className="grid gap-3 md:grid-cols-4">
        <ClassroomMetricCard
          description="Students currently eligible for new class delivery."
          icon={Users}
          label="Active students"
          value={activeStudents.length}
        />
        <ClassroomMetricCard
          description="Students with incomplete assigned work."
          icon={Activity}
          label="Need attention"
          value={needingAttention.length}
        />
        <ClassroomMetricCard
          description="Soft-removed students kept for historical evidence."
          icon={UserMinus}
          label="Removed"
          value={removedStudents.length}
        />
        <ClassroomMetricCard
          description="Assignments visible to active students only."
          icon={ClipboardCheck}
          label="Assigned work"
          value={classroom.activeAssignmentCount}
        />
      </section>

      <section className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">Student roster</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Removing a student stops future classroom access. It does not grant
            or revoke source Library membership, and it keeps historical evidence.
          </p>
        </div>
        {students.length ? (
          <div className="divide-y divide-slate-100">
            {students.map((member) => (
              <StudentCard
                classroomId={classroom.id}
                classroomStatus={classroom.status}
                key={member.id}
                member={member}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="teacher-eyebrow">No students yet</p>
            <h3 className="mt-2 text-xl font-bold text-slate-950">
              Share the join code from Settings when enrollment is open.
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Students join through the approved class-code flow. That join
              grants roster visibility only, not the teacher source Library.
            </p>
            <Button asChild className="mt-5" variant="outline">
              <Link href={`/teacher/classrooms/${classroom.id}/settings`}>
                Manage join code
              </Link>
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
