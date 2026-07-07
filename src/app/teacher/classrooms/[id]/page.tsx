import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import { profileLabel } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import { listTeacherClassroomAssignments } from "@/lib/teacher-assignments";

export const dynamic = "force-dynamic";

type TeacherClassroomDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    newCode?: string;
    saved?: string;
  }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const classroomSections = [
  {
    title: "Overview",
    description: "Class status, roster size, assignment counts, and delivery readiness.",
  },
  {
    title: "People",
    description: "Teacher and student roster visibility stays scoped to this classroom.",
  },
  {
    title: "Assignments",
    description: "Deliver reviewed bank questions as assignment-only student work.",
  },
  {
    title: "Analytics / Feedback",
    description: "Practice evidence and teacher feedback return here after student work.",
  },
  {
    title: "Linked Blueprints",
    description: "Blueprint patterns can support future bank content planning.",
  },
  {
    title: "Settings",
    description: "Classroom metadata and access controls remain teacher-managed.",
  },
];

export default async function TeacherClassroomDetailPage({
  params,
  searchParams,
}: TeacherClassroomDetailPageProps) {
  await requireTeacher();
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: classroom, error: classroomError } = await supabase
    .from("classrooms")
    .select("id, name, description, subject, status, created_at")
    .eq("id", id)
    .single();

  if (classroomError || !classroom) {
    notFound();
  }

  const { data: roster, error: rosterError } = await supabase
    .from("classroom_members")
    .select("id, user_id, role, status, joined_at, created_at")
    .eq("classroom_id", id)
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });
  const userIds = Array.from(new Set((roster ?? []).map((member) => member.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, email, full_name, display_name, role")
        .in("id", userIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const { data: activeJoinCode } = await supabase
    .from("classroom_join_codes")
    .select("display_code, code_hint, status, created_at")
    .eq("classroom_id", id)
    .eq("status", "active")
    .not("display_code", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const visibleJoinCode = query.newCode || activeJoinCode?.display_code || null;
  const studentCount = (roster ?? []).filter(
    (member) => member.role === "student" && member.status === "active",
  ).length;
  const teacherCount = (roster ?? []).filter(
    (member) => member.role !== "student" && member.status === "active",
  ).length;
  const assignments = await listTeacherClassroomAssignments({
    classroomId: id,
    supabase,
  });
  const assignedCount = assignments.filter(
    (assignment) => assignment.status === "assigned",
  ).length;
  const draftCount = assignments.filter((assignment) => assignment.status === "draft").length;
  const archivedCount = assignments.filter(
    (assignment) => assignment.status === "archived",
  ).length;

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Classroom workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {classroom.description ||
                "Review joined students and keep this delivery space ready for selected bank content."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher">Teacher Studio</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">Back to classrooms</Link>
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        <strong className="font-bold">Bank-first reminder:</strong> this class
        delivers selected reviewed content. Students do not gain access to the
        full teacher bank by joining the roster.
      </section>

      {query.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {query.saved}
        </p>
      ) : null}
      {query.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {query.error}
        </p>
      ) : null}

      {visibleJoinCode ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
            Active join code
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-2xl font-bold tracking-[0.16em] text-slate-950">
              {visibleJoinCode}
            </code>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Share this code with students when enrollment is open. Validation still uses the hashed code path.
            </p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {classroomSections.map((section) => (
          <article className="teacher-panel p-4" key={section.title}>
            <h2 className="text-base font-bold text-slate-950">{section.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="teacher-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-950">Roster</h2>
            <p className="teacher-muted">
              Teachers see the class roster. Students cannot list unrelated
              classmates from other classrooms.
            </p>
          </div>
          {rosterError ? (
            <p className="p-5 text-sm text-destructive">{rosterError.message}</p>
          ) : roster?.length ? (
            <div className="divide-y divide-slate-100">
              {roster.map((member) => {
                const memberProfile = profileById.get(member.user_id);
                return (
                  <div className="p-5" key={member.id}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-950">
                          {profileLabel(memberProfile ?? {})}
                        </h3>
                        <p className="text-sm leading-6 text-slate-600">
                          {memberProfile?.email ||
                            memberProfile?.username ||
                            member.user_id}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {member.role}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          {member.status}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Joined {formatDateTime(member.joined_at ?? member.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <h3 className="text-base font-bold text-slate-950">
                No roster members yet.
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Share the join code with students to populate this roster.
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">Class status</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-semibold text-slate-950">{classroom.status}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Subject</dt>
                <dd className="font-semibold text-slate-950">
                  {classroom.subject || "Not set"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Teachers</dt>
                <dd className="font-semibold text-slate-950">{teacherCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Students</dt>
                <dd className="font-semibold text-slate-950">{studentCount}</dd>
              </div>
            </dl>
          </section>

          <section className="teacher-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Assignments
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create delivery events from reviewed questions and send selected
              items to students&apos; My Work.
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Assigned</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">
                  {assignedCount}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Draft</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">
                  {draftCount}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs text-slate-500">Archived</dt>
                <dd className="mt-1 text-lg font-bold text-slate-950">
                  {archivedCount}
                </dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-2">
              <Button asChild className="w-full">
                <Link href={`/teacher/classrooms/${classroom.id}/assignments/new`}>
                  New assignment
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href={`/teacher/classrooms/${classroom.id}/assignments`}>
                  View assignments
                </Link>
              </Button>
              <Button asChild className="w-full" variant="outline">
                <Link href={`/teacher/course-builder?classroomId=${classroom.id}`}>
                  Course Builder bridge
                </Link>
              </Button>
            </div>
            {assignments.length ? (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                {assignments.slice(0, 3).map((assignment) => (
                  <Link
                    className="block rounded-lg border border-slate-200 p-3 text-sm transition hover:bg-slate-50"
                    href={`/teacher/classrooms/${classroom.id}/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <span className="block font-semibold text-slate-950">
                      {assignment.title}
                    </span>
                    <span className="text-xs capitalize text-slate-500">
                      {assignment.status} - {assignment.itemCount} item(s)
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
