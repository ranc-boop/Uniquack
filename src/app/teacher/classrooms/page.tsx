import Link from "next/link";

import { createClassroom } from "@/app/teacher/classrooms/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TeacherClassroomsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default async function TeacherClassroomsPage({
  searchParams,
}: TeacherClassroomsPageProps) {
  const profile = await requireTeacher();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: classrooms, error } = await supabase
    .from("classrooms")
    .select("id, name, description, subject, status, created_at")
    .order("created_at", { ascending: false });
  const classroomIds = (classrooms ?? []).map((classroom) => classroom.id);
  const { data: members } = classroomIds.length
    ? await supabase
        .from("classroom_members")
        .select("classroom_id, role, status")
        .in("classroom_id", classroomIds)
        .eq("status", "active")
    : { data: [] };
  const memberCounts = new Map<string, number>();

  for (const member of members ?? []) {
    if (member.role === "student") {
      memberCounts.set(
        member.classroom_id,
        (memberCounts.get(member.classroom_id) ?? 0) + 1,
      );
    }
  }

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Teacher workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Classrooms
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Create a class, share a join code, review the roster, and assign
              published Question Bank work to students.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/classrooms/join">Preview student join</Link>
          </Button>
        </div>
      </section>

      {params.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {params.saved}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {params.error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="student-panel overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-lg font-bold text-slate-950">
              Your classrooms
            </h2>
            <p className="student-muted">
              Open a classroom to manage its roster and assignments.
            </p>
          </div>
          {error ? (
            <p className="p-5 text-sm text-destructive">{error.message}</p>
          ) : classrooms?.length ? (
            <div className="divide-y divide-slate-100">
              {classrooms.map((classroom) => (
                <Link
                  className="block p-5 transition hover:bg-slate-50"
                  href={`/teacher/classrooms/${classroom.id}`}
                  key={classroom.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-950">
                          {classroom.name}
                        </h3>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {classroom.status}
                        </span>
                      </div>
                      <p className="student-muted">
                        {classroom.subject || "No subject set"} · Created{" "}
                        {formatDate(classroom.created_at)}
                      </p>
                      {classroom.description ? (
                        <p className="line-clamp-2 text-sm leading-6 text-slate-600">
                          {classroom.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600">
                      <span className="font-bold text-slate-950">
                        {memberCounts.get(classroom.id) ?? 0}
                      </span>{" "}
                      students
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <h3 className="text-base font-bold text-slate-950">
                No classrooms yet.
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Create the first classroom to get a join code and start building
                the roster.
              </p>
            </div>
          )}
        </section>

        <section className="student-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">
            Create classroom
          </h2>
          <p className="student-muted">
            Join codes are stored as hashes and shown only once after creation.
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
              <Label htmlFor="subject">Subject</Label>
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
              Create classroom
            </Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Signed in as {profile.username || profile.email || "teacher"}.
          </p>
        </section>
      </div>
    </main>
  );
}
