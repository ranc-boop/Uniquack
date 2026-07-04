import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
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

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Classroom roster</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {classroom.name}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {classroom.description ||
                "Review joined students and keep the class ready for assignments."}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/teacher/classrooms">Back to classrooms</Link>
          </Button>
        </div>
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

      {query.newCode ? (
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-5">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
            New join code
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <code className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-2xl font-bold tracking-[0.16em] text-slate-950">
              {query.newCode}
            </code>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Copy this now. The database stores only a hash, so the full code is
              not shown again after this page load.
            </p>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="student-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-950">Roster</h2>
            <p className="student-muted">
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
          <section className="student-panel p-5">
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

          <section className="student-panel p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Assignments
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create assigned work from published questions and send it to
              students&apos; My Work.
            </p>
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
